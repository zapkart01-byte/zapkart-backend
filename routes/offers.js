const express = require('express')
const { supabase } = require('../config/supabase')
const { verifyToken, requireRole, couponLimiter } = require('../middleware/auth')
const { validateCoupon } = require('../middleware/validation')

const router = express.Router()

// Validates a coupon code against order value and active validity dates.
router.post('/validate', verifyToken, requireRole('customer'), couponLimiter, validateCoupon, async (req, res) => {
  const { code, cartValue } = req.body
  const now = new Date().toISOString()

  const { data: offer, error } = await supabase
    .from('offers')
    .select('*')
    .eq('type', 'coupon')
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .lte('valid_from', now)
    .gte('valid_until', now)
    .single()

  if (error || !offer) return res.status(404).json({ message: 'Coupon is invalid or expired' })
  if (Number(cartValue) < Number(offer.min_order_value || 0)) {
    return res.status(400).json({ message: `Minimum order value is ₹${Math.round(Number(offer.min_order_value || 0))}` })
  }
  if (offer.usage_limit && Number(offer.usage_count || 0) >= Number(offer.usage_limit)) {
    return res.status(400).json({ message: 'Coupon usage limit has been reached' })
  }

  let discount = 0
  if (offer.discount_type === 'flat') discount = Number(offer.discount_value || 0)
  if (offer.discount_type === 'percentage') {
    discount = (Number(cartValue) * Number(offer.discount_value || 0)) / 100
  }
  if (offer.max_discount_cap) discount = Math.min(discount, Number(offer.max_discount_cap))
  discount = Math.round(Math.max(0, discount))

  return res.status(200).json({
    message: 'Coupon validated successfully',
    offerId: offer.id,
    discountAmount: discount,
    code: offer.code,
  })
})

module.exports = router
