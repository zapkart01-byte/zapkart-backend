/**
 * ═══════════════════════════════════════════════════════
 * Mobile Authentication Routes
 * ═══════════════════════════════════════════════════════
 * OTP-based authentication endpoints for mobile apps
 * ═══════════════════════════════════════════════════════
 */

const express = require('express')
const { body, validationResult } = require('express-validator')
const mobileAuthService = require('../services/mobileAuthService')
const { verifyToken } = require('../middleware/authMiddleware')
const { logInfo, logError } = require('../utils/logger')

const router = express.Router()

/**
 * POST /auth/mobile/send-otp
 * Send OTP to phone number
 */
router.post(
  '/mobile/send-otp',
  [
    body('phone')
      .trim()
      .matches(/^\+91[6-9]\d{9}$/)
      .withMessage('Invalid Indian phone number. Format: +91XXXXXXXXXX')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: errors.array()[0].msg,
        errors: errors.array()
      })
    }

    const { phone } = req.body

    try {
      const result = await mobileAuthService.sendOTP(phone)

      if (!result.success) {
        return res.status(400).json(result)
      }

      return res.status(200).json(result)
    } catch (error) {
      logError('Send OTP error', { error: error.message, phone_last_4: phone.slice(-4) })
      return res.status(500).json({
        error_code: 'INTERNAL_ERROR',
        message: 'Failed to send OTP'
      })
    }
  }
)

/**
 * POST /auth/mobile/verify-otp
 * Verify OTP and authenticate user
 */
router.post(
  '/mobile/verify-otp',
  [
    body('phone')
      .trim()
      .matches(/^\+91[6-9]\d{9}$/)
      .withMessage('Invalid Indian phone number. Format: +91XXXXXXXXXX'),
    body('otp')
      .trim()
      .isLength({ min: 6, max: 6 })
      .isNumeric()
      .withMessage('OTP must be a 6-digit number')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: errors.array()[0].msg,
        errors: errors.array()
      })
    }

    const { phone, otp } = req.body

    try {
      const result = await mobileAuthService.verifyOTP(phone, otp)

      if (!result.success) {
        return res.status(400).json(result)
      }

      return res.status(200).json(result)
    } catch (error) {
      logError('Verify OTP error', { error: error.message, phone_last_4: phone.slice(-4) })
      return res.status(500).json({
        error_code: 'INTERNAL_ERROR',
        message: 'Failed to verify OTP'
      })
    }
  }
)

/**
 * POST /auth/mobile/refresh-token
 * Refresh access token using refresh token
 */
router.post(
  '/mobile/refresh-token',
  [
    body('refresh_token')
      .trim()
      .notEmpty()
      .withMessage('Refresh token is required')
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: errors.array()[0].msg
      })
    }

    const { refresh_token } = req.body

    try {
      const supabaseAuthService = require('../services/supabaseAuthService')
      const result = await supabaseAuthService.refreshSession(refresh_token)

      if (!result.success) {
        return res.status(401).json(result)
      }

      return res.status(200).json(result)
    } catch (error) {
      logError('Token refresh error', { error: error.message })
      return res.status(500).json({
        error_code: 'INTERNAL_ERROR',
        message: 'Failed to refresh token'
      })
    }
  }
)

/**
 * POST /auth/mobile/logout
 * Logout and revoke tokens
 */
router.post('/mobile/logout', verifyToken, async (req, res) => {
  try {
    const supabaseAuthService = require('../services/supabaseAuthService')
    const accessToken = req.headers.authorization?.split('Bearer ')[1]
    
    const result = await supabaseAuthService.revokeSession(accessToken)
    
    logInfo('User logged out', { user_id: req.user.user_id })

    if (!result.success) {
      return res.status(500).json(result)
    }

    return res.status(200).json(result)
  } catch (error) {
    logError('Logout error', { error: error.message })
    return res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'Failed to logout'
    })
  }
})

module.exports = router
