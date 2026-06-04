const express = require('express')
const { supabase } = require('../config/supabase')
const { verifyToken, requireRole, otpLimiter } = require('../middleware/auth')
const { validateStoreRegister, validateRiderRegister } = require('../middleware/validation')

const router = express.Router()

// Creates a store registration record for a store owner.
router.post('/stores/register', otpLimiter, validateStoreRegister, async (req, res) => {
  const payload = req.body
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .insert({
      owner_name: payload.owner_name,
      owner_phone: payload.owner_phone,
      store_name: payload.store_name,
      store_type: payload.store_type,
      address: payload.address || null,
      lat: payload.lat || null,
      lng: payload.lng || null,
      gstin: payload.gstin || null,
      bank_account: payload.bank_account || null,
      bank_ifsc: payload.bank_ifsc || null,
      status: 'pending',
    })
    .select('*')
    .single()

  if (storeError) return res.status(500).json({ message: 'Failed to register store', error: storeError.message })

  // Insert store KYC documents into store_documents table
  if (payload.documents && Array.isArray(payload.documents) && payload.documents.length > 0) {
    const documentsToInsert = payload.documents.map((doc) => ({
      store_id: store.id,
      document_type: doc.type,
      document_url: doc.url,
      verified: false,
    }))

    const { error: docsError } = await supabase
      .from('store_documents')
      .insert(documentsToInsert)

    if (docsError) {
      // Clean up the created store to prevent orphaned/incomplete store profiles
      await supabase.from('stores').delete().eq('id', store.id)
      return res.status(500).json({ message: 'Failed to save store KYC documents', error: docsError.message })
    }
  }

  return res.status(201).json(store)
})

// Creates a rider registration record for a rider account.
router.post('/riders/register', verifyToken, otpLimiter, validateRiderRegister, async (req, res) => {
  const payload = req.body
  const { data, error } = await supabase
    .from('riders')
    .insert({
      id: payload.id || req.user.uid,
      firebase_uid: req.user.uid,
      name: payload.name,
      phone: payload.phone,
      vehicle_type: payload.vehicle_type,
      vehicle_number: payload.vehicle_number || null,
      bank_account: payload.bank_account || null,
      bank_ifsc: payload.bank_ifsc || null,
      status: 'pending_kyc',
    })
    .select('*')
    .single()

  if (error) return res.status(500).json({ message: 'Failed to register rider', error: error.message })
  return res.status(201).json(data)
})

module.exports = router
