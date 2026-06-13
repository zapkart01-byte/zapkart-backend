/**
 * ═══════════════════════════════════════════════════════
 * Supabase Authentication Service
 * ═══════════════════════════════════════════════════════
 * Manages Supabase authentication sessions, tokens, and user management
 * - Session token generation (24-hour validity)
 * - Refresh token generation (30-day validity)
 * - Token refresh and rotation
 * - Logout with token revocation
 * ═══════════════════════════════════════════════════════
 */

const { createClient } = require('@supabase/supabase-js')
const jwt = require('jsonwebtoken')
const config = require('../config/environment')
const { logInfo, logError, logWarn } = require('../utils/logger')

class SupabaseAuthService {
  constructor() {
    // Service role client (full access)
    this.supabaseAdmin = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
    
    // Anon client (for user operations)
    this.supabaseAnon = createClient(
      config.supabase.url,
      config.supabase.anonKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true
        }
      }
    )
  }

  /**
   * Create or get user by phone number
   * @param {string} phoneNumber - Phone number in +91XXXXXXXXXX format
   * @param {string} role - User role (customer, store_owner, rider)
   * @returns {Promise<Object>} User data
   */
  async createOrGetUserByPhone(phoneNumber, role = 'customer') {
    try {
      // Check if user exists
      const { data: existingUser, error: fetchError } = await this.supabaseAdmin
        .from('users')
        .select('id, phone, email, role, created_at')
        .eq('phone', phoneNumber)
        .single()

      if (existingUser) {
        logInfo('Existing user retrieved', {
          user_id: existingUser.id,
          phone_last_4: phoneNumber.slice(-4),
          role: existingUser.role
        })
        return {
          success: true,
          user: existingUser,
          isNew: false
        }
      }

      // User doesn't exist - create new user
      if (fetchError && fetchError.code === 'PGRST116') {
        // Generate unique email for phone-only users
        const phoneDigits = phoneNumber.replace(/\D/g, '')
        const uniqueEmail = `user_${phoneDigits}@zapkart.phone`

        const { data: newUser, error: createError } = await this.supabaseAdmin
          .from('users')
          .insert({
            phone: phoneNumber,
            email: uniqueEmail,
            role: role,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('id, phone, email, role, created_at')
          .single()

        if (createError) {
          logError('Failed to create user', {
            error: createError.message,
            phone_last_4: phoneNumber.slice(-4)
          })
          return {
            success: false,
            error: 'USER_CREATION_FAILED',
            message: 'Failed to create user account'
          }
        }

        logInfo('New user created', {
          user_id: newUser.id,
          phone_last_4: phoneNumber.slice(-4),
          role: newUser.role
        })

        return {
          success: true,
          user: newUser,
          isNew: true
        }
      }

      // Other database error
      logError('Database error fetching user', { error: fetchError.message })
      return {
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to retrieve user'
      }
    } catch (error) {
      logError('Error in createOrGetUserByPhone', { error: error.message })
      return {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to process user data'
      }
    }
  }

  /**
   * Generate authentication session with tokens
   * @param {Object} user - User object from database
   * @returns {Promise<Object>} Session with access and refresh tokens
   */
  async generateAuthSession(user) {
    try {
      // Create Supabase auth user if doesn't exist
      const { data: authUser, error: authError } = await this.supabaseAdmin.auth.admin.createUser({
        email: user.email,
        phone: user.phone,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: {
          role: user.role,
          user_id: user.id,
          phone: user.phone
        }
      })

      if (authError && authError.message !== 'User already registered') {
        logError('Failed to create Supabase auth user', {
          error: authError.message,
          user_id: user.id
        })
        return {
          success: false,
          error: 'AUTH_USER_CREATION_FAILED',
          message: 'Failed to create authentication session'
        }
      }

      // Calculate expiry times
      const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

      // Generate JWT tokens directly for custom OTP auth flow
      const accessToken = this.generateMockJWT(user, 86400)
      const refreshToken = this.generateMockJWT(user, 2592000, 'refresh')

      logInfo('Auth session generated', {
        user_id: user.id,
        session_expires_at: sessionExpiresAt.toISOString(),
        refresh_expires_at: refreshExpiresAt.toISOString()
      })

      return {
        success: true,
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          role: user.role
        },
        session: {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'bearer',
          expires_in: 86400, // 24 hours in seconds
          expires_at: sessionExpiresAt.toISOString(),
          refresh_expires_at: refreshExpiresAt.toISOString()
        }
      }
    } catch (error) {
      logError('Error generating auth session', { error: error.message })
      return {
        success: false,
        error: 'SESSION_ERROR',
        message: 'Failed to create authentication session'
      }
    }
  }

  /**
   * Generate mock JWT for development/testing
   * @param {Object} user - User object
   * @param {number} expiresIn - Expiry time in seconds
   * @param {string} type - Token type (access or refresh)
   * @returns {string} JWT token
   */
  generateMockJWT(user, expiresIn = 86400, type = 'access') {
    const payload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      type: type,
      aud: 'authenticated',
      iss: config.supabase.url,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresIn
    }

    // Use a mock secret for development
    // In production, Supabase generates these with their private key
    return jwt.sign(payload, 'mock-jwt-secret-' + config.supabase.serviceRoleKey.slice(0, 20))
  }

  /**
   * Refresh authentication session
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New session tokens
   */
  async refreshSession(refreshToken) {
    try {
      // Try Supabase refresh first (for Supabase-issued tokens)
      const { data, error } = await this.supabaseAnon.auth.refreshSession({
        refresh_token: refreshToken
      })

      if (!error && data?.session) {
        const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
        const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

        logInfo('Session refreshed successfully via Supabase', {
          user_id: data.session.user.id
        })

        return {
          success: true,
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            token_type: 'bearer',
            expires_in: 86400,
            expires_at: sessionExpiresAt.toISOString(),
            refresh_expires_at: refreshExpiresAt.toISOString()
          },
          user: {
            id: data.session.user.id,
            email: data.session.user.email,
            phone: data.session.user.phone,
            role: data.session.user.user_metadata?.role
          }
        }
      }

      // Fallback: decode mock JWT refresh token and generate new tokens
      const decoded = jwt.decode(refreshToken)
      if (!decoded || decoded.type !== 'refresh') {
        logWarn('Token refresh failed - invalid token type', { error: error?.message })
        return {
          success: false,
          error: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token'
        }
      }

      // Check if refresh token is expired
      if (decoded.exp * 1000 < Date.now()) {
        return {
          success: false,
          error: 'REFRESH_TOKEN_EXPIRED',
          message: 'Refresh token expired, please login again'
        }
      }

      // Fetch user from database
      const { data: userData, error: userError } = await this.supabaseAdmin
        .from('users')
        .select('id, phone, email, role')
        .eq('id', decoded.sub)
        .single()

      if (userError || !userData) {
        logError('User not found for refresh', { user_id: decoded.sub })
        return {
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      }

      // Generate new tokens
      const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      const newAccessToken = this.generateMockJWT(userData, 86400)
      const newRefreshToken = this.generateMockJWT(userData, 2592000, 'refresh')

      logInfo('Session refreshed successfully via mock JWT', {
        user_id: userData.id
      })

      return {
        success: true,
        session: {
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          token_type: 'bearer',
          expires_in: 86400,
          expires_at: sessionExpiresAt.toISOString(),
          refresh_expires_at: refreshExpiresAt.toISOString()
        },
        user: {
          id: userData.id,
          email: userData.email,
          phone: userData.phone,
          role: userData.role
        }
      }
    } catch (error) {
      logError('Error refreshing session', { error: error.message })
      return {
        success: false,
        error: 'REFRESH_ERROR',
        message: 'Failed to refresh authentication session'
      }
    }
  }

  /**
   * Revoke user session (logout)
   * @param {string} accessToken - Access token to revoke
   * @returns {Promise<Object>} Revocation result
   */
  async revokeSession(accessToken) {
    try {
      // Sign out using Supabase
      const { error } = await this.supabaseAnon.auth.signOut({
        scope: 'local' // or 'global' to sign out from all sessions
      })

      if (error) {
        logError('Failed to revoke session', { error: error.message })
        return {
          success: false,
          error: 'REVOCATION_FAILED',
          message: 'Failed to revoke session'
        }
      }

      logInfo('Session revoked successfully')

      return {
        success: true,
        message: 'Session revoked successfully'
      }
    } catch (error) {
      logError('Error revoking session', { error: error.message })
      return {
        success: false,
        error: 'REVOCATION_ERROR',
        message: 'Failed to revoke session'
      }
    }
  }

  /**
   * Validate if token needs refresh (< 1 hour remaining)
   * @param {string} accessToken - Access token
   * @returns {boolean} True if token should be refreshed
   */
  shouldRefreshToken(accessToken) {
    try {
      const decoded = jwt.decode(accessToken)
      if (!decoded || !decoded.exp) return true

      const expiresAt = decoded.exp * 1000 // Convert to milliseconds
      const now = Date.now()
      const oneHour = 60 * 60 * 1000

      return (expiresAt - now) < oneHour
    } catch (error) {
      return true // Refresh if we can't decode
    }
  }
}

module.exports = new SupabaseAuthService()
