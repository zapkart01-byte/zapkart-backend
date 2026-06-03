// Calculates delivery fee, payout, and profit for a cart and distance.
function calculateOrderPricing(cartValue, distanceKm, settings) {
  let riderPayout
  if (distanceKm < 2) riderPayout = settings.rider_payout_under_2km
  else if (distanceKm < 4) riderPayout = settings.rider_payout_2_to_4km
  else riderPayout = settings.rider_payout_above_4km

  const commissionEarned = cartValue * settings.commission_rate
  const revenueNeeded = riderPayout + settings.minimum_profit
  let deliveryFee = revenueNeeded - commissionEarned

  if (cartValue >= settings.free_delivery_above) deliveryFee = 0

  deliveryFee = Math.max(deliveryFee, settings.min_delivery_fee)
  deliveryFee = Math.min(deliveryFee, settings.max_delivery_fee)
  deliveryFee = Math.round(deliveryFee)

  const commissionAmount = Math.round(commissionEarned)
  const zapkartNetProfit = Math.round(commissionEarned + deliveryFee - riderPayout)

  return {
    deliveryFee,
    riderPayout,
    commissionAmount,
    storeReceives: Math.round(cartValue - commissionAmount),
    zapkartNetProfit,
    isFreeDelivery: cartValue >= settings.free_delivery_above,
    totalCustomerPays: cartValue + deliveryFee,
  }
}

module.exports = {
  calculateOrderPricing,
}
