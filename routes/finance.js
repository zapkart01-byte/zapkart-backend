const express = require('express')
const router = express.Router()
const { supabase } = require('../config/supabase')
const { verifyToken, requireRole } = require('../middleware/auth')
const { validatePayoutPatch } = require('../middleware/validation')

// POST /finance/settlement/run — Runs the weekly settlement processing for stores and riders
router.post('/settlement/run', verifyToken, requireRole('superadmin'), async (req, res) => {
  const { adminId } = req.body
  const actualAdminId = req.user.email

  try {
    // 1. Fetch active stores to run settlements
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('*')
      .eq('status', 'active')

    if (storesError) {
      return res.status(500).json({ message: 'Failed to fetch stores for settlement', error: storesError.message })
    }

    // 2. Fetch active riders to run settlements
    const { data: riders, error: ridersError } = await supabase
      .from('riders')
      .select('*')
      .eq('status', 'active')

    if (ridersError) {
      return res.status(500).json({ message: 'Failed to fetch riders for settlement', error: ridersError.message })
    }

    const createdPayouts = []
    const now = new Date()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // 3. Process Store Payouts
    for (const store of stores) {
      // Find all delivered orders for the store in the last week
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('store_id', store.id)
        .eq('status', 'delivered')
        .gte('created_at', oneWeekAgo.toISOString())

      if (ordersError || !orders || orders.length === 0) continue

      const grossAmount = orders.reduce((sum, o) => sum + Number(o.subtotal || 0), 0)
      const commissionAmount = orders.reduce((sum, o) => sum + Number(o.commission_amount || 0), 0)
      const netAmount = grossAmount - commissionAmount

      if (netAmount <= 0) continue

      // Create payout record
      const { data: payout, error: payoutError } = await supabase
        .from('payouts')
        .insert({
          recipient_type: 'store',
          recipient_id: store.id,
          recipient_name: store.store_name,
          period_start: oneWeekAgo.toISOString(),
          period_end: now.toISOString(),
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          status: 'pending',
          bank_details: { bank_account: store.bank_account, bank_ifsc: store.bank_ifsc },
        })
        .select()
        .single()

      if (!payoutError && payout) {
        createdPayouts.push(payout)
      }
    }

    // 4. Process Rider Payouts
    for (const rider of riders) {
      // Run settlement if rider has delivery earnings or COD balance
      const weeklyEarnings = Number(rider.weekly_delivery_earnings || 0)
      const codBalance = Number(rider.cod_balance || 0)

      if (weeklyEarnings === 0 && codBalance === 0) continue

      const netAmount = weeklyEarnings - codBalance
      const direction = netAmount >= 0 ? 'to_recipient' : 'to_zapkart'
      const absoluteNetAmount = Math.abs(netAmount)

      // Create rider payout record
      const { data: payout, error: payoutError } = await supabase
        .from('payouts')
        .insert({
          recipient_type: 'rider',
          recipient_id: rider.id,
          recipient_name: rider.name,
          period_start: oneWeekAgo.toISOString(),
          period_end: now.toISOString(),
          gross_amount: weeklyEarnings,
          cod_deduction: codBalance,
          net_amount: absoluteNetAmount,
          direction,
          status: 'pending',
          bank_details: { bank_account: rider.bank_account, bank_ifsc: rider.bank_ifsc },
        })
        .select()
        .single()

      if (!payoutError && payout) {
        createdPayouts.push(payout)
        
        // Reset rider weekly stats as they have been settled
        await supabase
          .from('riders')
          .update({
            weekly_delivery_earnings: 0,
            cod_balance: 0,
            cod_limit_reached: false
          })
          .eq('id', rider.id)
      }
    }

    // 5. Log admin action
    await supabase.from('audit_log').insert({
      admin_id: actualAdminId,
      action: 'INITIATE_SETTLEMENT_RUN',
      target_type: 'settings',
      new_value: { created_payouts_count: createdPayouts.length },
    })

    return res.status(200).json({
      message: 'Settlement run executed successfully',
      processedPayoutsCount: createdPayouts.length,
      payouts: createdPayouts,
    })
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error running settlement', error: err.message })
  }
})

// PATCH /finance/payout/:id — Admin updates payout status and bank reference
router.patch('/payout/:id', verifyToken, requireRole('superadmin'), validatePayoutPatch, async (req, res) => {
  const { id } = req.params
  const { status, bank_reference } = req.body
  const adminId = req.user.email

  try {
    // 1. Fetch old payout record
    const { data: oldPayout, error: fetchError } = await supabase
      .from('payouts')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !oldPayout) {
      return res.status(404).json({ message: 'Payout not found' })
    }

    // 2. Perform database update
    const updatePayload = { status }
    if (status === 'processed') {
      updatePayload.processed_at = new Date().toISOString()
    }
    if (bank_reference !== undefined) {
      updatePayload.bank_reference = bank_reference
    }

    const { data: updatedPayout, error: updateError } = await supabase
      .from('payouts')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return res.status(500).json({ message: 'Failed to update payout', error: updateError.message })
    }

    // 3. Write into audit logs
    await supabase.from('audit_log').insert({
      admin_id: adminId,
      action: 'UPDATE_PAYOUT_STATUS',
      target_type: 'payout',
      target_id: id,
      old_value: oldPayout,
      new_value: updatedPayout,
    })

    return res.status(200).json({ message: 'Payout status updated successfully', payout: updatedPayout })
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error updating payout', error: err.message })
  }
})

module.exports = router
