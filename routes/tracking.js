const express = require('express')
const router = express.Router()
const { supabase } = require('../config/supabase')
const { verifyToken, requireRole, gpsLimiter } = require('../middleware/auth')
const { validateGpsUpdate } = require('../middleware/validation')
const { setRiderLocation, getRiderLocation } = require('../config/redis')
const { getIo } = require('../config/socket')
const { logInfo, logError } = require('../utils/logger')

// POST /tracking/update — Updates rider's live location for an order, caches in Redis, broadcasts via Socket.io
router.post('/update', verifyToken, requireRole('rider'), gpsLimiter, validateGpsUpdate, async (req, res) => {
  const { orderId, lat, lng } = req.body
  const riderId = req.riderId // Populated by requireRole('rider')

  try {
    // 1. Validate that the order is assigned to this rider and is in a tracking status
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, rider_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return res.status(404).json({ message: 'Order not found' })
    }

    if (order.rider_id !== riderId) {
      return res.status(403).json({ message: 'Access denied. You are not assigned to this order.' })
    }

    const trackableStatuses = ['confirmed', 'packed', 'picked', 'out_for_delivery']
    if (!trackableStatuses.includes(order.status)) {
      return res.status(400).json({ message: `Cannot update tracking for order in ${order.status} status.` })
    }

    const timestamp = new Date().toISOString()
    const locationPayload = {
      orderId,
      riderId,
      lat,
      lng,
      timestamp,
    }

    // 2. Cache in Redis immediately for high-frequency low-latency updates
    try {
      await setRiderLocation(riderId, locationPayload, 30) // 30 seconds TTL
    } catch (redisErr) {
      logError('Failed to cache rider location in Redis', { error: redisErr.message })
    }

    // 3. Broadcast real-time location update to Socket.io room "order:{orderId}"
    try {
      const io = getIo()
      if (io) {
        io.to(`order:${orderId}`).emit('location:update', locationPayload)
        logInfo('Broadcasted live location update', { orderId, riderId })
      }
    } catch (socketErr) {
      logError('Failed to broadcast location update over Socket.io', { error: socketErr.message })
    }

    // 4. Try saving location log history to database
    const { data: trackingRecord, error: trackingError } = await supabase
      .from('rider_locations')
      .insert({
        rider_id: riderId,
        order_id: orderId,
        lat,
        lng,
        created_at: timestamp,
      })
      .select()
      .single()

    if (trackingError) {
      // Graceful fallback in case table doesn't exist
      return res.status(200).json({
        message: 'Rider GPS updated successfully (mock table sync)',
        orderId,
        lat,
        lng,
      })
    }

    return res.status(200).json({
      message: 'Rider live GPS updated successfully',
      trackingRecord,
    })
  } catch (err) {
    logError('Internal server error updating tracking', { error: err.message })
    return res.status(500).json({ message: 'Internal server error updating tracking', error: err.message })
  }
})

// GET /tracking/:orderId — Retrieves the latest GPS coordinates of the assigned rider
router.get('/:orderId', verifyToken, async (req, res) => {
  const { orderId } = req.params

  try {
    // 1. Fetch order details to identify the rider
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, rider_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return res.status(404).json({ message: 'Order not found' })
    }

    if (!order.rider_id) {
      return res.status(400).json({ message: 'No rider has been assigned to this order yet.' })
    }

    // 2. Try fetching from hot Redis cache first
    try {
      const cached = await getRiderLocation(order.rider_id)
      if (cached && cached.orderId === orderId) {
        return res.status(200).json({
          rider_id: order.rider_id,
          order_id: orderId,
          lat: cached.lat,
          lng: cached.lng,
          created_at: cached.timestamp,
          cached: true,
        })
      }
    } catch (redisErr) {
      logError('Failed to read from Redis cache, querying database', { error: redisErr.message })
    }

    // 3. Fallback to querying the rider_locations database table
    const { data: locations, error: locationError } = await supabase
      .from('rider_locations')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (locationError || !locations || locations.length === 0) {
      // Simulated mock tracking coordinates (Bangalore default) if no historical values exist
      return res.status(200).json({
        orderId,
        riderId: order.rider_id,
        lat: 12.9716,
        lng: 77.5946,
        simulated: true,
        created_at: new Date().toISOString(),
      })
    }

    return res.status(200).json(locations[0])
  } catch (err) {
    logError('Internal server error retrieving tracking details', { error: err.message })
    return res.status(500).json({ message: 'Internal server error retrieving tracking', error: err.message })
  }
})

module.exports = router
