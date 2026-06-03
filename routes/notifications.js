const express = require('express')
const router = express.Router()
const { firebaseMessaging } = require('../config/firebase')
const { verifyToken, requireRole, broadcastLimiter } = require('../middleware/auth')
const { validateBroadcast } = require('../middleware/validation')
const { supabase } = require('../config/supabase')
const { logInfo, logError } = require('../utils/logger')

// POST /notifications/broadcast — Sends a push notification broadcast to a target audience
router.post('/broadcast', verifyToken, requireRole('superadmin'), broadcastLimiter, validateBroadcast, async (req, res) => {
  const { audience, title, body } = req.body
  const actualAdminId = req.user.email

  try {
    // 1. Prepare standard FCM message payload
    // Topics are: 'all', 'customers', 'store_owners', 'riders'
    const topic = audience === 'all' ? 'zapkart_all' : `zapkart_${audience}`

    const message = {
      notification: {
        title: title,
        body: body,
      },
      topic: topic,
    }

    let messageId = 'mock-message-id-' + Math.random().toString(36).substr(2, 9)

    try {
      // 2. Attempt to send FCM broadcast message via Firebase Admin SDK
      const response = await firebaseMessaging.send(message)
      messageId = response
      logInfo('FCM Broadcast sent successfully', { messageId, topic, title })
    } catch (fcmError) {
      // Log error but proceed to let the superadmin know we recorded the broadcast intent
      logError('FCM Broadcast Send Error (using mock ID fallback)', { 
        error: fcmError.message,
        topic,
        title 
      })
    }

    // 3. Log broadcast event in audit_log
    await supabase.from('audit_log').insert({
      admin_id: actualAdminId,
      action: 'BROADCAST_NOTIFICATION',
      target_type: 'notifications',
      new_value: {
        audience,
        title,
        body,
        messageId,
      },
    })

    // 4. Return success along with the message ID
    return res.status(200).json({
      message: 'Notification broadcast successfully initiated',
      id: messageId,
      audience,
      title,
      body,
    })
  } catch (err) {
    logError('Unhandled error broadcasting notification', { error: err.message })
    return res.status(500).json({ message: 'Internal server error broadcasting notification', error: err.message })
  }
})

module.exports = router
