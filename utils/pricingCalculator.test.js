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

console.log('--- TEST 1: Normal single item, no offer ---')
const test1Items = [
  {
    productId: 'amul-milk',
    store_price: 28,
    quantity: 1,
    category_commission_rate: 0.03,
    platform_mrp: 30
  }
]
const pricing1 = calculateOrderPricing(test1Items, 1, settings)
console.log('Result:', pricing1)

console.log('\n--- TEST 2: Medium basket, no offer ---')
const test2Items = [
  { productId: 'item1', store_price: 50, quantity: 1, category_commission_rate: 0.09, platform_mrp: 60 },
  { productId: 'item2', store_price: 50, quantity: 1, category_commission_rate: 0.09, platform_mrp: 60 },
  { productId: 'item3', store_price: 50, quantity: 1, category_commission_rate: 0.09, platform_mrp: 60 },
  { productId: 'item4', store_price: 50, quantity: 1, category_commission_rate: 0.09, platform_mrp: 60 }
]
const pricing2 = calculateOrderPricing(test2Items, 3, settings)
console.log('Result:', pricing2)

console.log('\n--- TEST 3: Large basket, free delivery ---')
const test3Items = [
  { productId: 'item1', store_price: 520, quantity: 1, category_commission_rate: 0.10, platform_mrp: 550 }
]
const pricing3 = calculateOrderPricing(test3Items, 5, settings)
console.log('Result:', pricing3)

console.log('\n--- TEST 4: Event sale 20% off vegetables ---')
const test4Items = [
  { productId: 'tomatoes', store_price: 30, quantity: 1, category_commission_rate: 0.12, platform_mrp: 40 }
]
const offer4 = {
  name: 'VEG20',
  discount_type: 'percentage',
  discount_value: 20,
  rider_gets_event_bonus: true
}
const pricing4 = calculateOrderPricing(test4Items, 1.5, settings, offer4)
console.log('Result:', pricing4)

console.log('\n--- TEST 5: Coupon FIRST50 ---')
const test5Items = [
  { productId: 'item1', store_price: 219, quantity: 1, category_commission_rate: 0.10, platform_mrp: 230 }
]
const offer5 = {
  name: 'FIRST50',
  discount_type: 'flat',
  discount_value: 50,
  rider_gets_event_bonus: false
}
const pricing5 = calculateOrderPricing(test5Items, 2.5, settings, offer5)
console.log('Result:', pricing5)
