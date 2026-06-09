/**
 * ═══════════════════════════════════════════════════════
 * Notification Routes
 * ═══════════════════════════════════════════════════════
 * Endpoints for device token registration and push notifications
 * ═══════════════════════════════════════════════════════
 */

const express = require('express')
const { body, validationResult } = require('express-validator')
const notificationService = require('../services/notificationService')
const { verifyToken, requireRole } = require('../middleware/authMiddleware')
const { logInfo, logError } = require('../utils/logger')

const router = express.Router()

/**
 * POST /notifications/register-device
 * Register device token for push notifications
 */
router.post(
  '/register-device',
  verifyToken,
  [
    body('token')
      .trim()
      .notEmpty()
      .withMessage('Device token is required'),
    body('token_type')
      .isIn(['expo', 'fcm'])
      .withMessage('Token type must be "expo" or "fcm"'),
    body('device_type')
      .isIn(['ios', 'android', 'web'])
      .withMessage('Device type must be "ios", "android", or "web"'),
    body('app_type')
      .isIn(['store', 'rider', 'customer', 'admin'])
      .withMessage('App type must be "store", "rider", "customer", or "admin"')
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: errors.array()[0].msg,
        errors: errors.array()
      })
    }

    const { token, token_type, device_type, app_type } = req.body
    const userId = req.user.user_id

    try {
      const result = await notificationService.registerDeviceToken(
        userId,
        token,
        token_type,
        device_type,
        app_type
      )

      if (!result.success) {
        return res.status(400).json(result)
      }

      return res.status(200).json(result)
    } catch (error) {
      logError('Device registration error', { error: error.message, user_id: userId })
      return res.status(500).json({
        error_code: 'REGISTRATION_ERROR',
        message: 'Failed to register device token'
      })
    }
  }
)

/**
 * POST /notifications/send
 * Send push notification to user (admin only)
 */
router.post(
  '/send',
  verifyToken,
  requireRole('admin'),
  [
    body('user_id')
      .trim()
      .notEmpty()
      .withMessage('User ID is required'),
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Notification title is required'),
    body('body')
      .trim()
      .notEmpty()
      .withMessage('Notification body is required'),
    body('type')
      .trim()
      .notEmpty()
      .withMessage('Notification type is required')
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: errors.array()[0].msg,
        errors: errors.array()
      })
    }

    const { user_id, title, body, type, data, priority, channelId } = req.body

    try {
      const notification = {
        title,
        body,
        type,
        data: data || {},
        priority: priority || 'default',
        channelId: channelId || 'default'
      }

      const result = await notificationService.sendNotification(user_id, notification)

      if (!result.success) {
        return res.status(400).json(result)
      }

      return res.status(200).json(result)
    } catch (error) {
      logError('Send notification error', { error: error.message })
      return res.status(500).json({
        error_code: 'SEND_ERROR',
        message: 'Failed to send notification'
      })
    }
  }
)

/**
 * POST /notifications/broadcast
 * Send broadcast notification to multiple users (admin only)
 */
router.post(
  '/broadcast',
  verifyToken,
  requireRole('admin'),
  [
    body('user_ids')
      .isArray({ min: 1 })
      .withMessage('User IDs array is required with at least 1 user'),
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Notification title is required'),
    body('body')
      .trim()
      .notEmpty()
      .withMessage('Notification body is required'),
    body('type')
      .trim()
      .notEmpty()
      .withMessage('Notification type is required')
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: errors.array()[0].msg,
        errors: errors.array()
      })
    }

    const { user_ids, title, body, type, data, priority, channelId } = req.body

    try {
      const notification = {
        title,
        body,
        type,
        data: data || {},
        priority: priority || 'default',
        channelId: channelId || 'default'
      }

      const result = await notificationService.sendBroadcast(user_ids, notification)

      return res.status(200).json(result)
    } catch (error) {
      logError('Broadcast notification error', { error: error.message })
      return res.status(500).json({
        error_code: 'BROADCAST_ERROR',
        message: 'Failed to send broadcast notification'
      })
    }
  }
)

/**
 * GET /notifications/test
 * Test notification endpoint (development only)
 */
if (process.env.NODE_ENV === 'development') {
  router.get('/test', verifyToken, async (req, res) => {
    try {
      const userId = req.user.user_id

      const result = await notificationService.sendNotification(userId, {
        title: 'Test Notification',
        body: 'This is a test notification from ZapKart',
        type: 'test',
        data: {
          test: true,
          timestamp: new Date().toISOString()
        },
        priority: 'default'
      })

      return res.status(200).json(result)
    } catch (error) {
      logError('Test notification error', { error: error.message })
      return res.status(500).json({
        error_code: 'TEST_ERROR',
        message: 'Failed to send test notification'
      })
    }
  })
}

module.exports = router
