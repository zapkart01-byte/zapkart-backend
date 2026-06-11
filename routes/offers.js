const express = require('express')
const { supabase } = require('../config/supabase')
const { verifyToken, requireRole, couponLimiter } = require('../middleware/auth')
const { validateCoupon } = require('../middleware/validation')

const router = express.Router()

// GET /offers/active — Get all active offers
router.get('/active', verifyToken, requireRole('customer'), async (req, res) => {
  try {
    const now = new Date().toISOString()
    const { data: offers, error } = await supabase
      .from('offers')
      .select('*')
      .eq('is_active', true)
      .lte('valid_from', now)
      .gte('valid_until', now)

    if (error) throw error

    return res.status(200).json({
      success: true,
      offers: offers || []
    })
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch active offers', error: error.message })
  }
})

// POST /offers/validate — Validates a coupon code against order value, first-order status, usage limits, and daily budget.
router.post('/validate', verifyToken, requireRole('customer'), couponLimiter, validateCoupon, async (req, res) => {
  const { code, cartValue } = req.body
  const now = new Date().toISOString()
  const customerId = req.customerId || req.user.id

  try {
    const { data: offer, error } = await supabase
      .from('offers')
      .select('*')
      .eq('type', 'coupon')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .lte('valid_from', now)
      .gte('valid_until', now)
      .maybeSingle()

    if (error || !offer) {
      return res.status(404).json({ message: 'Coupon is invalid or expired' })
    }

    // 1. Min order value check
    if (Number(cartValue) < Number(offer.min_order_value || 0)) {
      return res.status(400).json({ message: `Minimum order value is ₹${Math.round(Number(offer.min_order_value || 0))}` })
    }

    // 2. Usage limit check (global limit)
    if (offer.usage_limit && Number(offer.usage_count || 0) >= Number(offer.usage_limit)) {
      return res.status(400).json({ message: 'Coupon usage limit has been reached' })
    }

    // 3. First-order check
    if (offer.code === 'FIRST50' || offer.per_user_limit === 1) {
      // Check if user has any existing orders
      const { count, error: countError } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customerId)
        
      if (countError) throw countError
      
      if (count && count > 0) {
        return res.status(400).json({ message: 'This coupon is only valid for your first order' })
      }
    }

    // 4. Per-user limit check (if per_user_limit > 1)
    if (offer.per_user_limit && offer.per_user_limit > 1) {
      const { count: userUses, error: usesError } = await supabase
        .from('coupon_usage')
        .select('id', { count: 'exact', head: true })
        .eq('offer_id', offer.id)
        .eq('customer_id', customerId)

      if (usesError) throw usesError

      if (userUses && userUses >= offer.per_user_limit) {
        return res.status(400).json({ message: `You have already used this coupon the maximum number of times (${offer.per_user_limit})` })
      }
    }

    // Calculate discount amount
    let discount = 0
    if (offer.discount_type === 'flat') {
      discount = Number(offer.discount_value || 0)
    } else if (offer.discount_type === 'percentage') {
      discount = (Number(cartValue) * Number(offer.discount_value || 0)) / 100
    }
    if (offer.max_discount_cap) {
      discount = Math.min(discount, Number(offer.max_discount_cap))
    }
    discount = Math.round(Math.max(0, discount))

    // 5. Daily budget check
    if (offer.daily_budget) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      
      const { data: usages, error: usagesError } = await supabase
        .from('coupon_usage')
        .select('discount_amount')
        .eq('offer_id', offer.id)
        .gte('used_at', todayStart.toISOString())

      if (usagesError) throw usagesError

      const totalSpentToday = (usages || []).reduce((sum, u) => sum + Number(u.discount_amount), 0)
      if (totalSpentToday + discount > Number(offer.daily_budget)) {
        return res.status(400).json({ message: "Today's budget limit for this coupon has been reached. Try again tomorrow." })
      }
    }

    return res.status(200).json({
      message: 'Coupon validated successfully',
      offerId: offer.id,
      discountAmount: discount,
      code: offer.code,
      discountType: offer.discount_type,
      discountValue: offer.discount_value,
      maxDiscountCap: offer.max_discount_cap,
      riderGetsEventBonus: offer.rider_gets_event_bonus
    })
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error validating coupon', error: error.message })
  }
})

module.exports = router
