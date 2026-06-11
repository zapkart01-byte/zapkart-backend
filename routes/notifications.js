const express = require('express')
const router = express.Router()
const { verifyToken, requireRole, broadcastLimiter } = require('../middleware/auth')
const { validateBroadcast } = require('../middleware/validation')
const { supabase } = require('../config/supabase')
const { sendPush } = require('../services/notificationService')
const { logInfo, logError } = require('../utils/logger')

// POST /notifications/broadcast — Sends a push notification broadcast to a target audience using Expo Push
router.post('/broadcast', verifyToken, requireRole('superadmin'), broadcastLimiter, validateBroadcast, async (req, res) => {
  const { audience, title, body } = req.body
  const actualAdminId = req.user.email

  try {
    let tokens = []

    if (audience === 'all' || audience === 'customers') {
      const { data } = await supabase.from('customers').select('expo_push_token').neq('expo_push_token', null)
      if (data) tokens.push(...data.map(d => d.expo_push_token))
    }
    if (audience === 'all' || audience === 'store_owners') {
      const { data } = await supabase.from('stores').select('expo_push_token').neq('expo_push_token', null)
      if (data) tokens.push(...data.map(d => d.expo_push_token))
    }
    if (audience === 'all' || audience === 'riders') {
      const { data } = await supabase.from('riders').select('expo_push_token').neq('expo_push_token', null)
      if (data) tokens.push(...data.map(d => d.expo_push_token))
    }

    // Filter unique tokens
    tokens = [...new Set(tokens)].filter(Boolean)

    let messageId = 'expo-broadcast-' + Math.random().toString(36).substr(2, 9)

    if (tokens.length > 0) {
      await sendPush(tokens, title, body, { type: 'broadcast' })
      logInfo('Expo Broadcast sent successfully', { audience, title, count: tokens.length })
    } else {
      logInfo('No registered Expo push tokens found for audience', { audience })
    }

    // Log broadcast event in audit_log
    await supabase.from('audit_log').insert({
      admin_id: actualAdminId,
      action: 'BROADCAST_NOTIFICATION',
      target_type: 'notifications',
      new_value: {
        audience,
        title,
        body,
        messageId,
        tokens_count: tokens.length
      },
    })

    return res.status(200).json({
      message: 'Notification broadcast successfully initiated',
      id: messageId,
      audience,
      title,
      body,
      tokens_count: tokens.length
    })
  } catch (err) {
    logError('Unhandled error broadcasting notification', { error: err.message })
    return res.status(500).json({ message: 'Internal server error broadcasting notification', error: err.message })
  }
})

module.exports = router
