const express = require('express')
const router = express.Router()
const { supabase } = require('../config/supabase')
const { verifyToken, requireRole, orderLimiter } = require('../middleware/auth')
const { validateOrderStatus, validateRiderAssignment, validateCreateOrder, validateOrderIdParam } = require('../middleware/validation')
const { calculateOrderPricing } = require('../utils/pricingCalculator')
const { logError, logInfo } = require('../utils/logger')

// POST /orders — Customer creates a new order with server-side pricing verification & stock decrementing
router.post('/', verifyToken, requireRole('customer'), orderLimiter, validateCreateOrder, async (req, res) => {
  const { storeId, distanceKm, items, deliveryAddress, payment_method, couponCode } = req.body
  const customerId = req.customerId // Populated by requireRole('customer')

  try {
    // 1. Fetch platform settings for the pricing engine
    const { data: settings, error: settingsError } = await supabase
      .from('platform_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (settingsError || !settings) {
      logError('Order creation failed: Platform settings not found', { error: settingsError?.message })
      return res.status(500).json({ message: 'Failed to retrieve platform configurations' })
    }

    // 2. Fetch the store and verify it is active and open
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .eq('status', 'active')
      .single()

    if (storeError || !store) {
      return res.status(404).json({ message: 'Store not found or is currently inactive' })
    }

    // 3. Fetch products to calculate genuine subtotal and check stock
    const productIds = items.map((i) => i.productId)
    const { data: dbProducts, error: dbProductsError } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds)
      .eq('is_active', true)
      .eq('store_id', storeId)

    if (dbProductsError || !dbProducts || dbProducts.length !== productIds.length) {
      return res.status(400).json({ message: 'One or more selected products are invalid or inactive' })
    }

    let subtotal = 0
    const validatedItems = []

    for (const item of items) {
      const dbProd = dbProducts.find((p) => p.id === item.productId)
      if (dbProd.stock < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for product: ${dbProd.name}` })
      }
      const itemPrice = Number(dbProd.store_price)
      subtotal += itemPrice * item.quantity

      validatedItems.push({
        product_id: dbProd.id,
        name: dbProd.name,
        quantity: item.quantity,
        store_price: itemPrice,
        total_price: itemPrice * item.quantity,
        dbProd, // Keep reference to update stock later
      })
    }

    // Enforce platform minimum order value check
    if (subtotal < Number(settings.minimum_order_value || 99)) {
      return res.status(400).json({ message: `Minimum order value is ₹${settings.minimum_order_value}` })
    }

    // 4. Run the pricing calculator server-side
    const pricing = calculateOrderPricing(subtotal, distanceKm, settings)

    // 5. Apply coupon discount if applicable
    let discountAmount = 0
    let offerId = null
    let matchedOffer = null

    if (couponCode) {
      const now = new Date().toISOString()
      const { data: offer, error: offerError } = await supabase
        .from('offers')
        .select('*')
        .eq('type', 'coupon')
        .eq('code', couponCode.toUpperCase())
        .eq('is_active', true)
        .lte('start_date', now)
        .gte('end_date', now)
        .single()

      if (offerError || !offer) {
        return res.status(400).json({ message: 'Coupon code is invalid or has expired' })
      }
      if (subtotal < Number(offer.min_order_value || 0)) {
        return res.status(400).json({ message: `Minimum order value for this coupon is ₹${Math.round(offer.min_order_value)}` })
      }
      if (offer.usage_limit && Number(offer.usage_count || 0) >= Number(offer.usage_limit)) {
        return res.status(400).json({ message: 'Coupon usage limit has been reached' })
      }

      // Calculate discount amount
      if (offer.discount_type === 'flat') {
        discountAmount = Number(offer.discount_value || 0)
      } else if (offer.discount_type === 'percentage') {
        discountAmount = (subtotal * Number(offer.discount_value || 0)) / 100
      }
      if (offer.max_discount_cap) {
        discountAmount = Math.min(discountAmount, Number(offer.max_discount_cap))
      }
      discountAmount = Math.round(Math.max(0, discountAmount))
      offerId = offer.id
      matchedOffer = offer
    }

    const finalTotal = Math.max(0, pricing.totalCustomerPays - discountAmount)

    // 6. Insert Order record in Supabase
    const { data: newOrder, error: insertOrderError } = await supabase
      .from('orders')
      .insert({
        customer_id: customerId,
        store_id: storeId,
        status: 'placed',
        subtotal,
        commission_amount: pricing.commissionAmount,
        delivery_fee: pricing.deliveryFee,
        rider_payout: pricing.riderPayout,
        zapkart_net_profit: pricing.zapkartNetProfit - discountAmount,
        discount_amount: discountAmount,
        total: finalTotal,
        delivery_address: deliveryAddress,
        payment_method: payment_method || 'cod',
        payment_status: 'pending',
      })
      .select('*')
      .single()

    if (insertOrderError || !newOrder) {
      logError('Order creation failed: DB insert error', { error: insertOrderError?.message })
      return res.status(500).json({ message: 'Failed to create order transaction' })
    }

    // 7. Insert Order Items records in Supabase
    const orderItemsPayload = validatedItems.map((item) => ({
      order_id: newOrder.id,
      product_id: item.product_id,
      name: item.name,
      quantity: item.quantity,
      store_price: item.store_price,
      total_price: item.total_price,
    }))

    const { error: insertItemsError } = await supabase
      .from('order_items')
      .insert(orderItemsPayload)

    if (insertItemsError) {
      logError('Order creation warning: Order items insert failed', { error: insertItemsError.message })
    }

    // 8. Decrement product stock levels & increment units sold
    for (const item of validatedItems) {
      const newStock = Math.max(0, item.dbProd.stock - item.quantity)
      const newSold = Number(item.dbProd.units_sold_total || 0) + item.quantity

      await supabase
        .from('products')
        .update({ stock: newStock, units_sold_total: newSold })
        .eq('id', item.product_id)
    }

    // 9. Increment offer usage count if coupon applied
    if (offerId && matchedOffer) {
      await supabase
        .from('offers')
        .update({ usage_count: Number(matchedOffer.usage_count || 0) + 1 })
        .eq('id', offerId)
    }

    logInfo('Order successfully placed', { orderId: newOrder.id, total: finalTotal })

    return res.status(201).json({
      message: 'Order placed successfully',
      order: {
        ...newOrder,
        items: validatedItems,
      },
    })
  } catch (err) {
    logError('Unhandled error placing order', { error: err.message, stack: err.stack })
    return res.status(500).json({ message: 'Internal server error processing order' })
  }
})

// GET /orders — Fetch paginated orders based on user role (Admin, Store Owner, Rider, Customer)
router.get('/', verifyToken, async (req, res) => {
  const { page = 1, pageSize = 20, status } = req.query
  const email = req.user.email
  const phone = req.user.phone_number

  try {
    let role = 'customer'
    let filterField = 'customer_id'
    let filterId = null

    // Determine user role and filter identity
    const { data: admin } = await supabase.from('admins').select('role').eq('email', email?.toLowerCase().trim()).maybeSingle()
    if (admin && admin.role === 'super_admin') {
      role = 'superadmin'
    } else {
      const { data: store } = await supabase.from('stores').select('id').eq('owner_phone', phone).eq('status', 'active').maybeSingle()
      if (store) {
        role = 'store_owner'
        filterField = 'store_id'
        filterId = store.id
      } else {
        const { data: rider } = await supabase.from('riders').select('id').eq('phone', phone).maybeSingle()
        if (rider) {
          role = 'rider'
          filterField = 'rider_id'
          filterId = rider.id
        } else {
          const { data: customer } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle()
          if (customer) {
            role = 'customer'
            filterField = 'customer_id'
            filterId = customer.id
          } else {
            return res.status(403).json({ message: 'Access denied. Account profile not found.' })
          }
        }
      }
    }

    let query = supabase
      .from('orders')
      .select('*, stores:store_id(store_name), customers:customer_id(name, phone), riders:rider_id(name, phone)', { count: 'exact' })

    // Apply role-based visibility filters
    if (role !== 'superadmin' && filterId) {
      query = query.eq(filterField, filterId)
    }

    // Apply status filter if provided
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const fromOffset = (Number(page) - 1) * Number(pageSize)
    const toOffset = fromOffset + Number(pageSize) - 1

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(fromOffset, toOffset)

    if (error) {
      logError('Failed to retrieve orders', { error: error.message })
      return res.status(500).json({ message: 'Failed to fetch orders' })
    }

    return res.status(200).json({
      orders: data || [],
      total: count || 0,
      page: Number(page),
      pageSize: Number(pageSize),
    })
  } catch (err) {
    logError('Unhandled error fetching orders list', { error: err.message })
    return res.status(500).json({ message: 'Internal server error fetching orders' })
  }
})

// GET /orders/:id — Retrieves detailed order state including items with strict accessibility check
router.get('/:id', verifyToken, validateOrderIdParam, async (req, res) => {
  const { id } = req.params
  const email = req.user.email
  const phone = req.user.phone_number

  try {
    // 1. Fetch the order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, stores:store_id(*), customers:customer_id(*), riders:rider_id(*)')
      .eq('id', id)
      .single()

    if (orderError || !order) {
      return res.status(404).json({ message: 'Order not found' })
    }

    // 2. Enforce strict access control: Only superadmin or the direct participants can view this order
    let isAuthorized = false

    // Check if requester is superadmin
    const { data: admin } = await supabase.from('admins').select('role').eq('email', email?.toLowerCase().trim()).maybeSingle()
    if (admin && admin.role === 'super_admin') {
      isAuthorized = true
    } else {
      // Check if store owner
      if (order.stores && order.stores.owner_phone === phone) {
        isAuthorized = true
      }
      // Check if rider
      if (order.riders && order.riders.phone === phone) {
        isAuthorized = true
      }
      // Check if customer
      if (order.customers && order.customers.phone === phone) {
        isAuthorized = true
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Access denied. You do not have permissions to view this order.' })
    }

    // 3. Fetch order items
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id)

    if (itemsError) {
      logError('Order details: failed to fetch order items', { orderId: id, error: itemsError.message })
    }

    return res.status(200).json({
      ...order,
      items: orderItems || [],
    })
  } catch (err) {
    logError('Unhandled error retrieving order detail', { error: err.message })
    return res.status(500).json({ message: 'Internal server error retrieving order detail' })
  }
})

// PATCH /orders/:id/status — Updates order status and creates an audit log
router.patch('/:id/status', verifyToken, requireRole('superadmin'), validateOrderStatus, async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  const adminId = req.user.email

  try {
    // 1. Fetch old order state for audit logs
    const { data: oldOrder, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !oldOrder) {
      return res.status(404).json({ message: 'Order not found' })
    }

    // 2. Perform database update
    const updatePayload = { status }
    if (status === 'delivered') {
      updatePayload.delivered_at = new Date().toISOString()
      updatePayload.payment_status = 'paid'
    } else if (status === 'confirmed') {
      updatePayload.store_confirmed_at = new Date().toISOString()
    } else if (status === 'picked') {
      updatePayload.picked_up_at = new Date().toISOString()
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return res.status(500).json({ message: 'Failed to update order status', error: updateError.message })
    }

    // 3. Write into audit logs
    await supabase.from('audit_log').insert({
      admin_id: adminId,
      action: 'UPDATE_ORDER_STATUS',
      target_type: 'order',
      target_id: id,
      old_value: oldOrder,
      new_value: updatedOrder,
    })

    return res.status(200).json({ message: 'Order status updated successfully', order: updatedOrder })
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error', error: err.message })
  }
})

// POST /orders/:id/assign-rider — Assigns a rider to an order and checks rider compliance
router.post('/:id/assign-rider', verifyToken, requireRole('superadmin'), validateRiderAssignment, async (req, res) => {
  const { id } = req.params
  const { riderId } = req.body
  const adminId = req.user.email

  try {
    // 1. Fetch old order state
    const { data: oldOrder, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !oldOrder) {
      return res.status(404).json({ message: 'Order not found' })
    }

    // 2. Fetch rider details to check compliance limits
    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .select('*')
      .eq('id', riderId)
      .single()

    if (riderError || !rider) {
      return res.status(404).json({ message: 'Rider not found' })
    }

    if (rider.status !== 'active') {
      return res.status(400).json({ message: 'Cannot assign order to an inactive rider' })
    }

    if (rider.cod_limit_reached || Number(rider.cod_balance || 0) >= 2000) {
      return res.status(400).json({ message: 'Rider cash limit of ₹2,000 exceeded. Collect COD first.' })
    }

    // 3. Perform database update
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        rider_id: riderId,
        rider_accepted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return res.status(500).json({ message: 'Failed to assign rider', error: updateError.message })
    }

    // 4. Log admin action
    await supabase.from('audit_log').insert({
      admin_id: adminId,
      action: 'ASSIGN_RIDER',
      target_type: 'order',
      target_id: id,
      old_value: oldOrder,
      new_value: updatedOrder,
    })

    return res.status(200).json({ message: 'Rider assigned successfully', order: updatedOrder })
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error', error: err.message })
  }
})

module.exports = router
