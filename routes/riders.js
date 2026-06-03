const express = require('express')
const { supabase } = require('../config/supabase')
const { verifyToken, requireRole } = require('../middleware/auth')
const { body, validationResult } = require('express-validator')

const router = express.Router()

// Validates request body for admin-created rider records
const validateAdminRiderCreate = [
  body('name').trim().notEmpty().withMessage('Rider name is required'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Enter a valid 10-digit Indian mobile number'),
  body('vehicle_type')
    .isIn(['motorcycle', 'bicycle', 'escooter'])
    .withMessage('Vehicle type must be motorcycle, bicycle, or escooter'),
  body('vehicle_number').optional().trim(),
]

// Creates a rider record manually from the admin panel (no Firebase UID required)
router.post(
  '/',
  verifyToken,
  requireRole('superadmin'),
  validateAdminRiderCreate,
  async (req, res) => {
    // Return validation errors if any field is invalid
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(422).json({ message: errors.array()[0].msg, errors: errors.array() })
    }

    const { name, phone, vehicle_type, vehicle_number } = req.body

    // Check if a rider with this phone number already exists
    const { data: existing } = await supabase
      .from('riders')
      .select('id')
      .eq('phone', phone.trim())
      .maybeSingle()

    if (existing) {
      return res.status(409).json({ message: `A rider with phone ${phone} already exists.` })
    }

    // Insert the new rider with pending_kyc status — firebase_uid is null until rider registers via app
    const { data, error } = await supabase
      .from('riders')
      .insert({
        name: name.trim(),
        phone: phone.trim(),
        vehicle_type,
        vehicle_number: vehicle_number?.trim() || null,
        firebase_uid: null,
        status: 'pending_kyc',
        is_online: false,
        rating: 5.0,
        total_deliveries: 0,
        total_earnings: 0,
        cod_balance: 0,
        cod_limit_reached: false,
        weekly_delivery_earnings: 0,
      })
      .select()
      .single()

    if (error) {
      return res.status(500).json({ message: 'Failed to create rider', error: error.message })
    }

    // Log the manual rider creation in audit_log
    await supabase.from('audit_log').insert({
      admin_id: req.user.uid,
      action: 'CREATE_RIDER_MANUAL',
      target_type: 'rider',
      target_id: data.id,
      old_value: null,
      new_value: { name: data.name, phone: data.phone, vehicle_type: data.vehicle_type },
    })

    return res.status(201).json(data)
  }
)

module.exports = router
