const rateLimit = require('express-rate-limit')
const jwtVerificationService = require('../services/jwtVerificationService')
const { AuthError } = require('../services/jwtVerificationService')
const { supabase } = require('../config/supabase')
const { logInfo, logError } = require('../utils/logger')

/**
 * ZapKart Authentication and Authorization Middleware
 * Verifies Supabase JWT tokens, performs role-based access checks, and configures rate limiting.
 */

// Verifies the JWT token from the Authorization header and appends user to request
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error_code: 'MISSING_TOKEN',
      message: 'Authorization token is required',
      request_id: req.id
    })
  }

  const token = authHeader.split('Bearer ')[1]
  try {
    const claims = await jwtVerificationService.verifyToken(token)
    
    // Map Supabase claims to req.user with backward-compatible field names
    req.user = {
      uid: claims.user_id,
      user_id: claims.user_id,
      email: claims.email,
      phone: claims.phone,
      phone_number: claims.phone, // backward compat with old Firebase field name
      role: claims.role,
      issuer: claims.issuer
    }

    logInfo('JWT verification successful', { 
      user_id: claims.user_id,
      issuer: claims.issuer
    })

    next()
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({
        error_code: error.code,
        message: error.message,
        request_id: req.id
      })
    }

    logError('JWT verification error', { error: error.message })

    return res.status(401).json({
      error_code: 'VERIFICATION_FAILED',
      message: 'Invalid or expired authorization token',
      request_id: req.id
    })
  }
}

// Verifies that the authenticated user possesses the required role for the requested operation
function requireRole(role) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error_code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        request_id: req.id
      })
    }

    const uid = req.user.uid
    const email = req.user.email
    const phone = req.user.phone

    try {
      if (role === 'superadmin' || role === 'admin') {
        const { data: admin, error } = await supabase
          .from('admins')
          .select('role')
          .eq('email', email?.toLowerCase().trim())
          .single()

        if (error || !admin) {
          return res.status(403).json({ 
            error_code: 'FORBIDDEN',
            message: 'Access denied. Admin role required.',
            request_id: req.id
          })
        }

        if (role === 'superadmin' && admin.role !== 'super_admin') {
          return res.status(403).json({ 
            error_code: 'FORBIDDEN',
            message: 'Access denied. Superadmin role required.',
            request_id: req.id
          })
        }
      } else if (role === 'store_owner' || role === 'store') {
        const { data: store, error } = await supabase
          .from('stores')
          .select('id')
          .eq('owner_phone', phone)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()

        if (error || !store) {
          return res.status(403).json({ 
            error_code: 'FORBIDDEN',
            message: 'Access denied. Active store owner account required.',
            request_id: req.id
          })
        }
        req.storeId = store.id
      } else if (role === 'rider') {
        const { data: rider, error } = await supabase
          .from('riders')
          .select('id, status')
          .eq('phone', phone)
          .single()

        if (error || !rider || rider.status !== 'active') {
          return res.status(403).json({ 
            error_code: 'FORBIDDEN',
            message: 'Access denied. Active rider account required.',
            request_id: req.id
          })
        }
        req.riderId = rider.id
      } else if (role === 'customer') {
        const { data: user, error } = await supabase
          .from('users')
          .select('id')
          .eq('phone', phone)
          .eq('role', 'customer')
          .single()

        if (error || !user) {
          return res.status(403).json({ 
            error_code: 'FORBIDDEN',
            message: 'Access denied. Customer profile required.',
            request_id: req.id
          })
        }
        req.customerId = user.id
      }

      next()
    } catch (err) {
      logError('Role verification error', { error: err.message, role })
      return res.status(500).json({ 
        error_code: 'INTERNAL_ERROR',
        message: 'Internal server error verifying user role',
        request_id: req.id
      })
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
