const { supabase } = require('../config/supabase')

class AuthError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'AuthError'
    this.status = status
    this.code = code
  }
}

class TokenExpiredError extends AuthError {
  constructor(code, message) {
    super(401, code, message)
    this.name = 'TokenExpiredError'
  }
}

class JWTVerificationService {
  async verifyToken(token) {
    if (!token || typeof token !== 'string') {
      throw new AuthError(401, 'MISSING_TOKEN', 'Token is required')
    }

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user) {
        throw new AuthError(401, 'INVALID_TOKEN', 'Invalid or expired token')
      }

      return {
        user_id: user.id,
        email: user.email,
        phone: user.phone || user.user_metadata?.phone,
        role: user.user_metadata?.role || 'user',
        issuer: 'supabase'
      }
    } catch (err) {
      if (err instanceof AuthError) throw err;
      throw new AuthError(401, 'VERIFICATION_FAILED', err.message || 'JWT verification failed')
    }
  }
}

module.exports = new JWTVerificationService()
module.exports.AuthError = AuthError
module.exports.TokenExpiredError = TokenExpiredError
