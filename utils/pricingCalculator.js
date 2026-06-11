// Calculates delivery fee, payout, and profit for a cart and distance.
// THIS FUNCTION IS IDENTICAL IN ADMIN, CUSTOMER APP, AND BACKEND

function calculateOrderPricing(cartItems, distanceKm, settings, offer = null) {
  // Coerce all inputs to Numbers
  distanceKm = Number(distanceKm || 0)

  const platformSettings = {
    rider_payout_under_2km: Number(settings.rider_payout_under_2km || 25),
    rider_payout_2_to_4km: Number(settings.rider_payout_2_to_4km || 35),
    rider_payout_above_4km: Number(settings.rider_payout_above_4km || 50),
    platform_markup_per_item: Number(settings.platform_markup_per_item !== undefined ? settings.platform_markup_per_item : 1),
    min_profit_tier1: Number(settings.min_profit_tier1 || 12),
    min_profit_tier1_max_cart: Number(settings.min_profit_tier1_max_cart || 149),
    min_profit_tier2: Number(settings.min_profit_tier2 || 14),
    min_profit_tier2_max_cart: Number(settings.min_profit_tier2_max_cart || 249),
    min_profit_tier3: Number(settings.min_profit_tier3 || 15),
    min_profit_tier3_max_cart: Number(settings.min_profit_tier3_max_cart || 399),
    min_profit_tier4: Number(settings.min_profit_tier4 || 10),
    min_profit_tier4_max_cart: Number(settings.min_profit_tier4_max_cart || 499),
    min_profit_tier5: Number(settings.min_profit_tier5 || 8),
    bonus_event_order: Number(settings.bonus_event_order || 5),
    free_delivery_above: Number(settings.free_delivery_above || 499),
    min_delivery_fee: Number(settings.min_delivery_fee || 15),
    max_delivery_fee: Number(settings.max_delivery_fee || 45)
  }

  // Step 1: Rider base payout by distance
  let riderBasePayout
  if (distanceKm < 2)      riderBasePayout = platformSettings.rider_payout_under_2km
  else if (distanceKm < 4) riderBasePayout = platformSettings.rider_payout_2_to_4km
  else                     riderBasePayout = platformSettings.rider_payout_above_4km

  // Step 2: Blended commission (per item category rate)
  const totalCommission = cartItems.reduce((sum, item) => {
    const storePrice = Number(item.store_price || 0)
    const qty = Number(item.quantity || 0)
    const commRate = Number(item.category_commission_rate !== undefined ? item.category_commission_rate : 0.18)
    return sum + (storePrice * qty * commRate)
  }, 0)

  // Step 3: Markup revenue (platform_markup_per_item per item, capped at platform_mrp)
  const markupRevenue = cartItems.reduce((sum, item) => {
    const storePrice = Number(item.store_price || 0)
    const platformMrp = Number(item.platform_mrp || 0)
    const qty = Number(item.quantity || 0)
    const cp = Math.min(storePrice + platformSettings.platform_markup_per_item, platformMrp)
    return sum + ((cp - storePrice) * qty)
  }, 0)

  // Step 4: Cart value from customer perspective (after markup)
  const cartValue = cartItems.reduce((sum, item) => {
    const storePrice = Number(item.store_price || 0)
    const platformMrp = Number(item.platform_mrp || 0)
    const qty = Number(item.quantity || 0)
    const cp = Math.min(storePrice + platformSettings.platform_markup_per_item, platformMrp)
    return sum + (cp * qty)
  }, 0)

  // Step 5: Apply offer discount if present
  let discountAmount = 0
  let riderEventBonus = 0

  if (offer) {
    const discountVal = Number(offer.discount_value || 0)
    if (offer.discount_type === 'flat') {
      discountAmount = discountVal
    } else if (offer.discount_type === 'percentage') {
      discountAmount = cartValue * (discountVal / 100)
      if (offer.max_discount_cap) {
        discountAmount = Math.min(discountAmount, Number(offer.max_discount_cap))
      }
    }
    discountAmount = Math.round(discountAmount)

    // Rider gets event bonus during any active offer
    if (offer.rider_gets_event_bonus) {
      riderEventBonus = platformSettings.bonus_event_order
    }
  }

  // Step 6: Tiered minimum profit
  const minimumProfit = getMinimumProfit(cartValue, platformSettings)

  // Step 7: ZapKart item revenue
  const zapkartItemRevenue = totalCommission + markupRevenue - discountAmount

  // Step 8: Dynamic delivery fee
  const isFreeDelivery = cartValue - discountAmount >= platformSettings.free_delivery_above
  let deliveryFee = 0
  if (!isFreeDelivery) {
    deliveryFee = (riderBasePayout + minimumProfit) - zapkartItemRevenue
    deliveryFee = Math.max(deliveryFee, platformSettings.min_delivery_fee)
    deliveryFee = Math.min(deliveryFee, platformSettings.max_delivery_fee)
    deliveryFee = Math.round(deliveryFee)
  }

  // Step 9: Final calculations
  const finalCustomerPays = Math.round(cartValue - discountAmount + deliveryFee)
  const zapkartNetProfit = Math.round(zapkartItemRevenue + deliveryFee - riderBasePayout)
  const totalRiderEarning = riderBasePayout + riderEventBonus

  // Step 10: Store payouts (NEVER affected by offers)
  const storePayouts = cartItems.map(item => {
    const storePrice = Number(item.store_price || 0)
    const qty = Number(item.quantity || 0)
    const commRate = Number(item.category_commission_rate !== undefined ? item.category_commission_rate : 0.18)
    return {
      productId: item.productId || item.product_id || item.id,
      storeReceives: Math.round(storePrice * qty * (1 - commRate))
    }
  })

  return {
    cartValue,
    discountAmount,
    deliveryFee,
    finalCustomerPays,
    riderBasePayout,
    riderEventBonus,
    totalRiderEarning,
    totalCommission: Math.round(totalCommission),
    markupRevenue: Math.round(markupRevenue),
    zapkartNetProfit,
    isFreeDelivery,
    amountToFreeDelivery: Math.max(0, platformSettings.free_delivery_above - (cartValue - discountAmount)),
    storePayouts,
    offerApplied: offer?.name || null,
  }
}

function getMinimumProfit(cartValue, settings) {
  if (cartValue <= (settings.min_profit_tier1_max_cart || 149)) return settings.min_profit_tier1 || 12
  if (cartValue <= (settings.min_profit_tier2_max_cart || 249)) return settings.min_profit_tier2 || 14
  if (cartValue <= (settings.min_profit_tier3_max_cart || 399)) return settings.min_profit_tier3 || 15
  if (cartValue <= (settings.min_profit_tier4_max_cart || 499)) return settings.min_profit_tier4 || 10
  return settings.min_profit_tier5 || 8
}

module.exports = { calculateOrderPricing, getMinimumProfit }
