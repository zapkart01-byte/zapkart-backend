const { body, param, validationResult } = require('express-validator')

/**
 * ZapKart Payload Validation Middleware
 * Enforces strict input validation on all inbound POST, PATCH, and PUT requests.
 */

// Helper function to return validation errors if any are present in the request context
function checkValidation(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }
  next()
}

// Rules for validating order status update payloads
const validateOrderStatus = [
  param('id').isUUID().withMessage('Invalid order ID format'),
  body('status')
    .isIn(['placed', 'confirmed', 'packed', 'picked', 'out_for_delivery', 'delivered', 'cancelled'])
    .withMessage('Invalid order status value'),
  checkValidation,
]

// Rules for validating rider assignment payloads
const validateRiderAssignment = [
  param('id').isUUID().withMessage('Invalid order ID format'),
  body('riderId').isUUID().withMessage('Invalid rider ID format'),
  checkValidation,
]

// Rules for validating GPS tracking coordinate update payloads
const validateGpsUpdate = [
  body('orderId').isUUID().withMessage('Invalid order ID format'),
  body('lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude coordinates'),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude coordinates'),
  checkValidation,
]

// Rules for validating admin push notification broadcasts
const validateBroadcast = [
  body('audience')
    .isIn(['all', 'customers', 'store_owners', 'riders'])
    .withMessage('Invalid audience target selected'),
  body('title')
    .isString()
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage('Title must be between 1 and 80 characters'),
  body('body')
    .isString()
    .trim()
    .isLength({ min: 1, max: 256 })
    .withMessage('Body must be between 1 and 256 characters'),
  checkValidation,
]

// Rules for validating finance settlement payout processing updates
const validatePayoutUpdate = [
  param('id').isUUID().withMessage('Invalid payout ID format'),
  body('status').isIn(['pending', 'processed', 'failed']).withMessage('Invalid payout status value'),
  body('bankReference').isString().trim().notEmpty().withMessage('Bank reference number is required'),
  checkValidation,
]

// Rules for validating order creation payloads from customer app.
const validateCreateOrder = [
  body('storeId').isUUID().withMessage('Invalid store ID format'),
  body('distanceKm').isFloat({ min: 0 }).withMessage('Distance must be a valid number'),
  body('items').isArray({ min: 1 }).withMessage('At least one order item is required'),
  body('items.*.productId').isUUID().withMessage('Invalid product ID format'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('deliveryAddress').isObject().withMessage('Delivery address is required'),
  body('payment_method').optional().isIn(['cod', 'upi', 'card']).withMessage('Invalid payment method'),
  checkValidation,
]

// Rules for validating coupon validation requests.
const validateCoupon = [
  body('code').isString().trim().notEmpty().withMessage('Coupon code is required'),
  body('cartValue').isFloat({ min: 0 }).withMessage('Cart value must be valid'),
  checkValidation,
]

// Rules for validating order identifier path parameters.
const validateOrderIdParam = [
  param('id').isUUID().withMessage('Invalid order ID format'),
  checkValidation,
]

// Rules for validating payout update payload with optional bank reference.
const validatePayoutPatch = [
  param('id').isUUID().withMessage('Invalid payout ID format'),
  body('status').isIn(['pending', 'processed', 'failed']).withMessage('Invalid payout status value'),
  body('bank_reference').optional().isString().trim(),
  checkValidation,
]

// Rules for validating rider registration payloads.
const validateRiderRegister = [
  body('name').isString().trim().isLength({ min: 2 }).withMessage('Rider name is required'),
  body('phone').isString().trim().isLength({ min: 10, max: 15 }).withMessage('Rider phone is required'),
  body('vehicle_type').isIn(['motorcycle', 'bicycle', 'escooter']).withMessage('Invalid vehicle type'),
  checkValidation,
]

// Rules for validating store registration payloads.
const validateStoreRegister = [
  body('owner_name').isString().trim().isLength({ min: 2 }).withMessage('Owner name is required'),
  body('owner_phone').isString().trim().isLength({ min: 10, max: 15 }).withMessage('Owner phone is required'),
  body('store_name').isString().trim().isLength({ min: 2 }).withMessage('Store name is required'),
  body('store_type').isIn(['general', 'grocery', 'pharmacy', 'bakery']).withMessage('Invalid store type'),
  checkValidation,
]

module.exports = {
  validateOrderStatus,
  validateRiderAssignment,
  validateGpsUpdate,
  validateBroadcast,
  validatePayoutUpdate,
  validateCreateOrder,
  validateCoupon,
  validateOrderIdParam,
  validatePayoutPatch,
  validateRiderRegister,
  validateStoreRegister,
}
