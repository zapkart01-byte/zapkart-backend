const rateLimit = require('express-rate-limit')
const { firebaseAuth } = require('../config/firebase')
const { supabase } = require('../config/supabase')

/**
 * ZapKart Authentication and Authorization Middleware
 * Verifies Firebase ID tokens, performs role-based access checks, and configures rate limiting.
 */

// Verifies the Firebase JWT token from the Authorization header and appends user to request
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token is required' })
  }

  const token = authHeader.split('Bearer ')[1]
  try {
    const decodedToken = await firebaseAuth.verifyIdToken(token)
    req.user = decodedToken
    next()
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired authorization token' })
  }
}

// Verifies that the authenticated user possesses the required role for the requested operation
function requireRole(role) {
  return async (req, res, next) => {
    const uid = req.user.uid
    const email = req.user.email
    const phone = req.user.phone_number

    try {
      if (role === 'superadmin') {
        const { data: admin, error } = await supabase
          .from('admins')
          .select('role')
          .eq('email', email?.toLowerCase().trim())
          .single()

        if (error || !admin || admin.role !== 'super_admin') {
          return res.status(403).json({ message: 'Access denied. Superadmin role required.' })
        }
      } else if (role === 'store_owner') {
        const { data: store, error } = await supabase
          .from('stores')
          .select('id')
          .eq('owner_phone', phone)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()

        if (error || !store) {
          return res.status(403).json({ message: 'Access denied. Active store owner account required.' })
        }
        req.storeId = store.id
      } else if (role === 'rider') {
        const { data: rider, error } = await supabase
          .from('riders')
          .select('id, status')
          .eq('phone', phone)
          .single()

        if (error || !rider || rider.status !== 'active') {
          return res.status(403).json({ message: 'Access denied. Active rider account required.' })
        }
        req.riderId = rider.id
      } else if (role === 'customer') {
        const { data: customer, error } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', phone)
          .single()

        if (error || !customer) {
          return res.status(403).json({ message: 'Access denied. Customer profile required.' })
        }
        req.customerId = customer.id
      }

      next()
    } catch (err) {
      return res.status(500).json({ message: 'Internal server error verifying user role' })
    }
  }
}

// Global rate limiter for all endpoints to prevent API abuse
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiter for OTP requests to prevent brute force and spam
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: { message: 'Too many OTP requests from this IP, please try again after 10 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiter for login requests to protect authentication forms
const loginLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  message: { message: 'Too many login attempts from this IP, please try again after 30 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiter for order placement transactions to block script runs
const orderLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.uid || 'anonymous',
  message: { message: 'Too many order placements, please wait a minute' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false }
})

// Rate limiter for promo coupon code validation queries
const couponLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.uid || 'anonymous',
  message: { message: 'Too many coupon validation attempts, please wait a minute' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false }
})

// Rate limiter for rider active GPS tracking updates
const gpsLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 3,
  keyGenerator: (req) => req.user?.uid || 'anonymous',
  message: { message: 'GPS updates throttled, maximum 3 updates per 10 seconds' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false }
})

// Rate limiter for admin broadcast notifications to prevent spamming users
const broadcastLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: { message: 'Too many broadcast attempts, maximum 5 broadcasts per minute' },
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = {
  verifyToken,
  requireRole,
  globalLimiter,
  otpLimiter,
  loginLimiter,
  orderLimiter,
  couponLimiter,
  gpsLimiter,
  broadcastLimiter,
}
