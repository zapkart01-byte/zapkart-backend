const { supabase } = require('../config/supabase')
const { logError, logInfo } = require('../utils/logger')

// Returns ISO boundaries for the previous settlement week.
function getSettlementWindow() {
  const now = new Date()
  const periodTo = new Date(now)
  const periodFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return {
    periodFrom: periodFrom.toISOString(),
    periodTo: periodTo.toISOString(),
  }
}

// Creates store and rider settlement payout records and resets counters.
async function runWeeklySettlement(triggeredBy = 'system') {
  const { periodFrom, periodTo } = getSettlementWindow()
  const createdPayouts = []

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('*')
    .eq('id', 1)
    .single()

  const { data: stores, error: storesError } = await supabase
    .from('stores')
    .select('id, store_name, bank_account, bank_ifsc, commission_rate')
    .eq('status', 'active')

  if (storesError) throw new Error(storesError.message)

  for (const store of stores || []) {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('subtotal, commission_amount')
      .eq('store_id', store.id)
      .eq('status', 'delivered')
      .gte('created_at', periodFrom)
      .lte('created_at', periodTo)

    if (ordersError) {
      logError('Store settlement order query failed', { storeId: store.id, error: ordersError.message })
      continue
    }

    const gross = (orders || []).reduce((sum, order) => sum + Number(order.subtotal || 0), 0)
    if (gross <= 0) continue

    // Use the actual commission charged per order (computed with per-category
    // variable rates at order time), not a single flat store rate.
    const commissionDeducted = Math.round(
      (orders || []).reduce((sum, order) => sum + Number(order.commission_amount || 0), 0)
    )
    const netAmount = Math.max(0, Math.round(gross - commissionDeducted))

    const { data: payout, error: payoutError } = await supabase
      .from('payouts')
      .insert({
        recipient_type: 'store',
        recipient_id: store.id,
        period_from: periodFrom.slice(0, 10),
        period_to: periodTo.slice(0, 10),
        gross_amount: gross,
        commission_deducted: commissionDeducted,
        net_amount: netAmount,
        direction: 'to_recipient',
        status: 'pending',
      })
      .select('*')
      .single()

    if (!payoutError && payout) {
      createdPayouts.push(payout)
      await supabase.from('stores').update({ cancellation_count: 0 }).eq('id', store.id)
    }
  }

  const { data: riders, error: ridersError } = await supabase
    .from('riders')
    .select('id, weekly_delivery_earnings, cod_balance')
    .eq('status', 'active')

  if (ridersError) throw new Error(ridersError.message)

  for (const rider of riders || []) {
    // Sum rider event bonuses from delivered orders in the settlement window.
    const { data: riderOrders, error: riderOrdersError } = await supabase
      .from('orders')
      .select('rider_event_bonus')
      .eq('rider_id', rider.id)
      .eq('status', 'delivered')
      .gte('created_at', periodFrom)
      .lte('created_at', periodTo)

    if (riderOrdersError) {
      logError('Rider settlement order query failed', { riderId: rider.id, error: riderOrdersError.message })
    }

    const eventBonusTotal = (riderOrders || []).reduce((sum, o) => sum + Number(o.rider_event_bonus || 0), 0)
    const deliveryEarnings = Number(rider.weekly_delivery_earnings || 0) + eventBonusTotal
    const codCollected = Number(rider.cod_balance || 0)
    if (deliveryEarnings === 0 && codCollected === 0) continue

    const net = deliveryEarnings - codCollected
    const direction = net >= 0 ? 'to_recipient' : 'to_zapkart'

    const { data: payout, error: payoutError } = await supabase
      .from('payouts')
      .insert({
        recipient_type: 'rider',
        recipient_id: rider.id,
        period_from: periodFrom.slice(0, 10),
        period_to: periodTo.slice(0, 10),
        gross_amount: deliveryEarnings,
        cod_deducted: codCollected,
        net_amount: Math.abs(net),
        direction,
        status: 'pending',
      })
      .select('*')
      .single()

    if (!payoutError && payout) {
      createdPayouts.push(payout)
      await supabase
        .from('riders')
        .update({ weekly_delivery_earnings: 0, cod_balance: 0, cod_limit_reached: false })
        .eq('id', rider.id)
    }
  }

  // Track total offer/discount cost absorbed by ZapKart in this period (reporting).
  let offerCostTotal = 0
  const { data: discountOrders, error: discountError } = await supabase
    .from('orders')
    .select('discount_amount')
    .eq('status', 'delivered')
    .gte('created_at', periodFrom)
    .lte('created_at', periodTo)
  if (!discountError) {
    offerCostTotal = Math.round((discountOrders || []).reduce((sum, o) => sum + Number(o.discount_amount || 0), 0))
  }

  await supabase.from('audit_log').insert({
    admin_id: triggeredBy,
    action: 'INITIATE_PAYOUT',
    target_type: 'settlement',
    new_value: {
      createdPayouts: createdPayouts.length,
      period_from: periodFrom.slice(0, 10),
      period_to: periodTo.slice(0, 10),
      offer_cost_total: offerCostTotal,
    },
  })

  logInfo('Weekly settlement completed', { createdPayouts: createdPayouts.length, offerCostTotal })
  return createdPayouts
}

// Sets COD limit flags for riders who crossed the configured threshold.
async function checkCODLimits() {
  const { data: settings, error: settingsError } = await supabase
    .from('platform_settings')
    .select('max_cod_balance_per_rider')
    .eq('id', 1)
    .single()

  if (settingsError) throw new Error(settingsError.message)

  const limit = Number(settings?.max_cod_balance_per_rider || 2000)
  const { data: riders, error: ridersError } = await supabase
    .from('riders')
    .select('id, cod_balance, cod_limit_reached')

  if (ridersError) throw new Error(ridersError.message)

  for (const rider of riders || []) {
    const reached = Number(rider.cod_balance || 0) >= limit
    if (reached !== Boolean(rider.cod_limit_reached)) {
      await supabase.from('riders').update({ cod_limit_reached: reached }).eq('id', rider.id)
    }
  }
}

module.exports = {
  runWeeklySettlement,
  checkCODLimits,
}
