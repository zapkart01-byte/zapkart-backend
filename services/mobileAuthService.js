/**
 * ═══════════════════════════════════════════════════════
 * Mobile Authentication Service
 * ═══════════════════════════════════════════════════════
 * Handles OTP-based authentication for mobile apps
 * - 2Factor.in OTP integration
 * - Redis-based rate limiting
 * - Session management
 * - Supabase user integration
 * ═══════════════════════════════════════════════════════
 */

const twoFactorClient = require('../utils/twoFactorClient')
const { getRedisClient } = require('../utils/redisClient')
const { createClient } = require('@supabase/supabase-js')
const config = require('../config/environment')
const { logInfo, logError, logWarn } = require('../utils/logger')

class MobileAuthService {
  constructor() {
    this.redis = getRedisClient()
    this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey)
  }

  /**
   * Validate Indian phone number format
   * @param {string} phone - Phone number
   * @returns {boolean}
   */
  isValidIndianPhone(phone) {
    // Pattern: +91[6-9][0-9]{9}
    const pattern = /^\+91[6-9]\d{9}$/
    return pattern.test(phone)
  }

  /**
   * Check OTP request rate limiting
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object>} Rate limit status
   */
  async checkOTPRateLimit(phoneNumber) {
    const rateLimitKey = `otp:rate:${phoneNumber}`
    
    try {
      const requestCount = await this.redis.get(rateLimitKey)
      const count = requestCount ? parseInt(requestCount) : 0
      
      if (count >= config.rateLimit.otp.perPhone) {
        const ttl = await this.redis.ttl(rateLimitKey)
        return {
          allowed: false,
          remaining: 0,
          resetIn: ttl,
          message: `Maximum ${config.rateLimit.otp.perPhone} OTP requests per hour exceeded`
        }
      }
      
      return {
        allowed: true,
        remaining: config.rateLimit.otp.perPhone - count - 1
      }
    } catch (error) {
      logError('Error checking OTP rate limit', { error: error.message })
      // Allow request on Redis error to avoid blocking legitimate users
      return { allowed: true, remaining: config.rateLimit.otp.perPhone - 1 }
    }
  }

  /**
   * Increment OTP request counter
   * @param {string} phoneNumber - Phone number
   */
  async incrementOTPRateLimit(phoneNumber) {
    const rateLimitKey = `otp:rate:${phoneNumber}`
    
    try {
      const count = await this.redis.incr(rateLimitKey)
      
      if (count === 1) {
        // Set expiry on first request
        await this.redis.expire(rateLimitKey, config.rateLimit.otp.windowHours * 3600)
      }
    } catch (error) {
      logError('Error incrementing OTP rate limit', { error: error.message })
    }
  }

  /**
   * Check resend cooldown
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object>} Cooldown status
   */
  async checkResendCooldown(phoneNumber) {
    const cooldownKey = `otp:cooldown:${phoneNumber}`
    
    try {
      const ttl = await this.redis.ttl(cooldownKey)
      
      if (ttl > 0) {
        return {
          active: true,
          remainingSeconds: ttl,
          message: `Please wait ${ttl} seconds before requesting a new OTP`
        }
      }
      
      return { active: false }
    } catch (error) {
      logError('Error checking resend cooldown', { error: error.message })
      return { active: false }
    }
  }

  /**
   * Set resend cooldown
   * @param {string} phoneNumber - Phone number
   */
  async setResendCooldown(phoneNumber) {
    const cooldownKey = `otp:cooldown:${phoneNumber}`
    
    try {
      await this.redis.setex(cooldownKey, config.otp.resendCooldownSeconds, '1')
    } catch (error) {
      logError('Error setting resend cooldown', { error: error.message })
    }
  }

  /**
   * Send OTP to phone number
   * @param {string} phoneNumber - Phone number in format +91XXXXXXXXXX
   * @returns {Promise<Object>} Send OTP result
   */
  async sendOTP(phoneNumber) {
    // Validate phone number format
    if (!this.isValidIndianPhone(phoneNumber)) {
      return {
        success: false,
        error_code: 'INVALID_PHONE',
        message: 'Invalid Indian phone number format. Use +91XXXXXXXXXX'
      }
    }

    // Check rate limiting
    const rateLimit = await this.checkOTPRateLimit(phoneNumber)
    if (!rateLimit.allowed) {
      await this.logOTPOperation(phoneNumber, 'send', 'failure', 'Rate limit exceeded')
      return {
        success: false,
        error_code: 'RATE_LIMIT_EXCEEDED',
        message: rateLimit.message,
        resetIn: rateLimit.resetIn
      }
    }

    // Check resend cooldown
    const cooldown = await this.checkResendCooldown(phoneNumber)
    if (cooldown.active) {
      await this.logOTPOperation(phoneNumber, 'send', 'failure', 'Resend cooldown active')
      return {
        success: false,
        error_code: 'RESEND_COOLDOWN',
        message: cooldown.message,
        remainingSeconds: cooldown.remainingSeconds
      }
    }

    // Send OTP via 2Factor.in
    const otpResult = await twoFactorClient.sendOTP(
      phoneNumber,
      config.otp.length,
      config.otp.expiryMinutes
    )

    if (!otpResult.success) {
      await this.logOTPOperation(phoneNumber, 'send', 'failure', otpResult.error)
      return {
        success: false,
        error_code: 'OTP_SEND_FAILED',
        message: otpResult.error || 'Failed to send OTP'
      }
    }

    // Increment rate limit counter
    await this.incrementOTPRateLimit(phoneNumber)

    // Set resend cooldown
    await this.setResendCooldown(phoneNumber)

    // Store OTP session data
    const sessionKey = `otp:session:${phoneNumber}`
    const sessionData = {
      session_id: otpResult.session_id,
      attempts: 0,
      created_at: Date.now()
    }

    try {
      await this.redis.setex(
        sessionKey,
        config.otp.expiryMinutes * 60,
        JSON.stringify(sessionData)
      )
    } catch (error) {
      logError('Error storing OTP session', { error: error.message })
    }

    await this.logOTPOperation(phoneNumber, 'send', 'success', null)

    return {
      success: true,
      message: 'OTP sent successfully',
      expiresIn: config.otp.expiryMinutes * 60,
      session_id: otpResult.session_id
    }
  }

  /**
   * Verify OTP
   * @param {string} phoneNumber - Phone number
   * @param {string} otp - OTP code
   * @returns {Promise<Object>} Verification result with Supabase tokens
   */
  async verifyOTP(phoneNumber, otp) {
    // Validate phone number
    if (!this.isValidIndianPhone(phoneNumber)) {
      return {
        success: false,
        error_code: 'INVALID_PHONE',
        message: 'Invalid phone number format'
      }
    }

    // Check if phone is blocked
    const blockKey = `otp:block:${phoneNumber}`
    const blocked = await this.redis.get(blockKey)

    if (blocked) {
      const ttl = await this.redis.ttl(blockKey)
      await this.logOTPOperation(phoneNumber, 'verify', 'failure', 'Phone blocked')
      return {
        success: false,
        error_code: 'PHONE_BLOCKED',
        message: `Too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes`,
        unblockIn: ttl
      }
    }

    // Get OTP session data
    const sessionKey = `otp:session:${phoneNumber}`
    const sessionDataStr = await this.redis.get(sessionKey)

    if (!sessionDataStr) {
      await this.logOTPOperation(phoneNumber, 'verify', 'failure', 'Session expired or invalid')
      return {
        success: false,
        error_code: 'INVALID_SESSION',
        message: 'OTP expired or invalid session'
      }
    }

    const sessionData = JSON.parse(sessionDataStr)

    // Increment attempts
    sessionData.attempts += 1

    // Update session with new attempt count
    await this.redis.setex(
      sessionKey,
      config.otp.expiryMinutes * 60,
      JSON.stringify(sessionData)
    )

    // Check max attempts
    if (sessionData.attempts > config.otp.maxAttempts) {
      // Block phone for 15 minutes
      await this.redis.setex(blockKey, config.otp.blockMinutes * 60, '1')
      await this.redis.del(sessionKey)
      await this.logOTPOperation(phoneNumber, 'verify', 'failure', 'Max attempts exceeded')
      
      return {
        success: false,
        error_code: 'PHONE_BLOCKED',
        message: 'Maximum verification attempts exceeded. Phone blocked for 15 minutes',
        unblockIn: config.otp.blockMinutes * 60
      }
    }

    // Verify OTP with 2Factor.in
    const verifyResult = await twoFactorClient.verifyOTP(sessionData.session_id, otp)

    if (!verifyResult.success) {
      await this.logOTPOperation(
        phoneNumber,
        'verify',
        'failure',
        `Attempt ${sessionData.attempts}: ${verifyResult.error}`
      )
      
      return {
        success: false,
        error_code: 'INVALID_OTP',
        message: 'Incorrect OTP',
        attemptsRemaining: config.otp.maxAttempts - sessionData.attempts
      }
    }

    // OTP verified successfully - clear session
    await this.redis.del(sessionKey)

    // Authenticate with Supabase
    const authResult = await this.authenticateWithSupabase(phoneNumber)

    if (!authResult.success) {
      await this.logOTPOperation(phoneNumber, 'verify', 'failure', 'Supabase auth failed')
      return authResult
    }

    await this.logOTPOperation(phoneNumber, 'verify', 'success', null)

    return authResult
  }

  /**
   * Authenticate user with Supabase after OTP verification
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object>} Supabase auth tokens
   */
  async authenticateWithSupabase(phoneNumber) {
    try {
      const supabaseAuthService = require('./supabaseAuthService')
      
      // Create or get user
      const userResult = await supabaseAuthService.createOrGetUserByPhone(phoneNumber, 'customer')
      
      if (!userResult.success) {
        return userResult
      }
      
      // Generate auth session with tokens
      const sessionResult = await supabaseAuthService.generateAuthSession(userResult.user)
      
      if (!sessionResult.success) {
        return sessionResult
      }
      
      return {
        success: true,
        user: sessionResult.user,
        tokens: sessionResult.session,
        message: 'Authentication successful',
        isNewUser: userResult.isNew
      }
    } catch (error) {
      logError('Supabase authentication error', { error: error.message })
      return {
        success: false,
        error_code: 'AUTH_ERROR',
        message: 'Authentication failed'
      }
    }
  }

  /**
   * Log OTP operation to database
   * @param {string} phoneNumber - Phone number
   * @param {string} operation - 'send' or 'verify'
   * @param {string} status - 'success' or 'failure'
   * @param {string} reason - Failure reason (if any)
   */
  async logOTPOperation(phoneNumber, operation, status, reason) {
    try {
      const phoneLast4 = phoneNumber.slice(-4)

      await this.supabase
        .from('otp_logs')
        .insert({
          phone_last_4: phoneLast4,
          operation,
          status,
          reason,
          timestamp: new Date().toISOString()
        })

      logInfo('OTP operation logged', {
        phone_last_4: phoneLast4,
        operation,
        status
      })
    } catch (error) {
      logError('Error logging OTP operation', { error: error.message })
    }
  }
}

module.exports = new MobileAuthService()
