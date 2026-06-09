/**
 * ═══════════════════════════════════════════════════════
 * Authentication Middleware (Modernized)
 * ═══════════════════════════════════════════════════════
 * JWT verification middleware using the new JWTVerificationService
 * Supports both Supabase and Firebase tokens during transition
 * ═══════════════════════════════════════════════════════
 */

const jwtVerificationService = require('../services/jwtVerificationService')
const { AuthError } = require('../services/jwtVerificationService')
const { supabase } = require('../config/supabase')
const { logInfo, logError } = require('../utils/logger')

/**
 * Verify JWT token from Authorization header
 * Attaches decoded user claims to req.user
 */
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
    // Verify token using JWTVerificationService
    const claims = await jwtVerificationService.verifyToken(token)
    
    // Attach user claims to request
    req.user = {
      uid: claims.user_id,
      user_id: claims.user_id,
      email: claims.email,
      phone: claims.phone,
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

/**
 * Require specific role for accessing endpoint
 * Must be used after verifyToken middleware
 */
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
        const { data: customer, error } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', phone)
          .single()

        if (error || !customer) {
          return res.status(403).json({ 
            error_code: 'FORBIDDEN',
            message: 'Access denied. Customer profile required.',
            request_id: req.id
          })
        }
        req.customerId = customer.id
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

module.exports = {
  verifyToken,
  requireRole
}
