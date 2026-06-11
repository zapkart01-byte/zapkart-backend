const express = require('express')
const { verifyToken, requireRole, loginLimiter } = require('../middleware/auth')
const { getRedisClient } = require('../utils/redisClient')
const { supabase } = require('../config/supabase')

const router = express.Router()
const redis = getRedisClient()

// POST /auth/send-otp
router.post('/send-otp', loginLimiter, async (req, res) => {
  const { phone, userType } = req.body

  if (!phone || !userType) {
    return res.status(400).json({ error: 'Phone and userType are required' })
  }

  const url = `https://2factor.in/API/V1/${process.env.TWOFACTOR_API_KEY}/SMS/${phone}/AUTOGEN`
  
  try {
    const response = await fetch(url)
    const data = await response.json()

    if (data.Status === 'Success') {
      // Store session ID in Redis with 120 second expiry
      await redis.setex(`otp:${phone}`, 120, data.Details)
      return res.json({ success: true })
    }

    return res.status(400).json({ error: 'Failed to send OTP' })
  } catch (error) {
    console.error('Error sending OTP:', error.message)
    return res.status(500).json({ error: 'Failed to send OTP due to internal error' })
  }
})

// POST /auth/verify-otp
router.post('/verify-otp', loginLimiter, async (req, res) => {
  const { phone, otp, userType } = req.body

  if (!phone || !otp || !userType) {
    return res.status(400).json({ error: 'Phone, otp, and userType are required' })
  }

  try {
    const sessionId = await redis.get(`otp:${phone}`)
    if (!sessionId) return res.status(400).json({ error: 'OTP expired. Request new OTP.' })

    const url = `https://2factor.in/API/V1/${process.env.TWOFACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`
    const response = await fetch(url)
    const data = await response.json()

    if (data.Details !== 'OTP Matched') {
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' })
    }

    await redis.del(`otp:${phone}`)

    // Find or create user based on userType
    const table = userType === 'customer' ? 'customers'
      : userType === 'store' ? 'stores'
      : 'riders'

    const { data: existingUser } = await supabase
      .from(table)
      .select('*')
      .eq('phone', phone)
      .maybeSingle()

    let user = existingUser
    let isNew = false

    if (!user && userType === 'customer') {
      const { data: newUser, error: createError } = await supabase
        .from('customers')
        .insert({ phone })
        .select()
        .single()
      
      if (createError) throw createError
      user = newUser
      isNew = true
    } else if (!user) {
      return res.status(400).json({ error: 'User profile not found. Please register first.' })
    }

    // Generate JWT
    const token = require('jsonwebtoken').sign(
      { id: user.id, phone, userType },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.json({ success: true, token, user, isNew })
  } catch (error) {
    console.error('Error verifying OTP:', error.message)
    return res.status(500).json({ error: 'Failed to verify OTP due to internal error' })
  }
})

// Verifies an admin token and returns normalized identity details.
router.post('/verify', loginLimiter, verifyToken, requireRole('superadmin'), async (req, res) => {
  return res.status(200).json({
    message: 'Token verified successfully',
    user: {
      uid: req.user.uid,
      email: req.user.email,
      role: 'superadmin',
    },
  })
})

module.exports = router
