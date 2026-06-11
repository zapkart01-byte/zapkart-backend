const assert = require('assert')
const { calculateOrderPricing } = require('./pricingCalculator')

const settings = {
  rider_payout_under_2km: 25,
  rider_payout_2_to_4km: 35,
  rider_payout_above_4km: 50,
  platform_markup_per_item: 1,
  min_profit_tier1: 12,
  min_profit_tier1_max_cart: 149,
  min_profit_tier2: 14,
  min_profit_tier2_max_cart: 249,
  min_profit_tier3: 15,
  min_profit_tier3_max_cart: 399,
  min_profit_tier4: 10,
  min_profit_tier4_max_cart: 499,
  min_profit_tier5: 8,
  bonus_event_order: 5,
  free_delivery_above: 499,
  min_delivery_fee: 15,
  max_delivery_fee: 45
}

let passed = 0
function check(label, fn) {
  fn()
  passed++
  console.log('  PASS: ' + label)
}

console.log('--- TEST 1: Normal single item, no offer ---')
{
  const items = [
    { productId: 'amul-milk', store_price: 28, quantity: 1, category_commission_rate: 0.03, platform_mrp: 30 }
  ]
  const r = calculateOrderPricing(items, 1, settings)
  check('commission ~= 0.84 (rounded 1)', () => assert.strictEqual(r.totalCommission, 1))
  check('markupRevenue === 1', () => assert.strictEqual(r.markupRevenue, 1))
  check('riderBasePayout === 25 (under 2km)', () => assert.strictEqual(r.riderBasePayout, 25))
  check('store receives on store_price', () => assert.strictEqual(r.storePayouts[0].storeReceives, Math.round(28 * 1 * (1 - 0.03))))
  check('no offer applied', () => assert.strictEqual(r.offerApplied, null))
}

console.log('--- TEST 2: Medium basket, no offer ---')
{
  const items = [
    { productId: 'item1', store_price: 50, quantity: 1, category_commission_rate: 0.09, platform_mrp: 60 },
    { productId: 'item2', store_price: 50, quantity: 1, category_commission_rate: 0.09, platform_mrp: 60 },
    { productId: 'item3', store_price: 50, quantity: 1, category_commission_rate: 0.09, platform_mrp: 60 },
    { productId: 'item4', store_price: 50, quantity: 1, category_commission_rate: 0.09, platform_mrp: 60 }
  ]
  const r = calculateOrderPricing(items, 3, settings)
  check('totalCommission ~= 18', () => assert.strictEqual(r.totalCommission, 18))
  check('markupRevenue ~= 4', () => assert.strictEqual(r.markupRevenue, 4))
  check('riderBasePayout === 35 (2-4km)', () => assert.strictEqual(r.riderBasePayout, 35))
}

console.log('--- TEST 3: Large basket, free delivery ---')
{
  const items = [
    { productId: 'item1', store_price: 520, quantity: 1, category_commission_rate: 0.10, platform_mrp: 550 }
  ]
  const r = calculateOrderPricing(items, 5, settings)
  check('isFreeDelivery === true', () => assert.strictEqual(r.isFreeDelivery, true))
  check('deliveryFee === 0', () => assert.strictEqual(r.deliveryFee, 0))
}

console.log('--- TEST 4: Event sale 20% off (CRITICAL: store & rider not reduced) ---')
{
  const items = [
    { productId: 'tomatoes', store_price: 30, quantity: 1, category_commission_rate: 0.12, platform_mrp: 40 }
  ]
  const offer = { name: 'VEG20', discount_type: 'percentage', discount_value: 20, rider_gets_event_bonus: true }
  const r = calculateOrderPricing(items, 1.5, settings, offer)
  check('discountAmount > 0', () => assert.ok(r.discountAmount > 0))
  check('riderEventBonus === 5', () => assert.strictEqual(r.riderEventBonus, 5))
  check('totalRiderEarning === base + 5', () => assert.strictEqual(r.totalRiderEarning, r.riderBasePayout + 5))
  check('store paid on full store_price, NOT discounted', () => assert.strictEqual(r.storePayouts[0].storeReceives, Math.round(30 * 1 * (1 - 0.12))))
  check('offerApplied === VEG20', () => assert.strictEqual(r.offerApplied, 'VEG20'))
}

console.log('--- TEST 5: Coupon FIRST50 (CRITICAL: store & rider unchanged) ---')
{
  const items = [
    { productId: 'item1', store_price: 219, quantity: 1, category_commission_rate: 0.10, platform_mrp: 230 }
  ]
  const offer = { name: 'FIRST50', discount_type: 'flat', discount_value: 50, rider_gets_event_bonus: false }
  const r = calculateOrderPricing(items, 2.5, settings, offer)
  check('discountAmount === 50', () => assert.strictEqual(r.discountAmount, 50))
  check('riderEventBonus === 0', () => assert.strictEqual(r.riderEventBonus, 0))
  check('totalRiderEarning === base (no bonus)', () => assert.strictEqual(r.totalRiderEarning, r.riderBasePayout))
  check('store payout unchanged by coupon', () => assert.strictEqual(r.storePayouts[0].storeReceives, Math.round(219 * 1 * (1 - 0.10))))
}

console.log('\nAll ' + passed + ' assertions passed.')
