const express = require('express')
const { supabase } = require('../config/supabase')
const { verifyToken, requireRole } = require('../middleware/auth')

const router = express.Router()

// Returns nearby active stores based on simple bounding box filtering.
router.get('/nearby', verifyToken, requireRole('customer'), async (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ message: 'Query params lat and lng are required numbers' })
  }

  const minLat = lat - 0.2
  const maxLat = lat + 0.2
  const minLng = lng - 0.2
  const maxLng = lng + 0.2

  const { data, error } = await supabase
    .from('stores')
    .select('id, store_name, store_type, address, lat, lng, delivery_radius_km, rating, is_open')
    .eq('status', 'active')
    .gte('lat', minLat)
    .lte('lat', maxLat)
    .gte('lng', minLng)
    .lte('lng', maxLng)

  if (error) return res.status(500).json({ message: 'Failed to fetch nearby stores', error: error.message })
  return res.status(200).json(data || [])
})

module.exports = router
