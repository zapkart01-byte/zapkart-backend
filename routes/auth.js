const express = require('express')
const { verifyToken, requireRole, loginLimiter } = require('../middleware/auth')

const router = express.Router()

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
