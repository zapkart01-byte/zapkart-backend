const { Expo } = require('expo-server-sdk')
const { supabase } = require('../config/supabase')

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN })

async function sendPush(pushTokens, title, body, data = {}) {
  if (!pushTokens || pushTokens.length === 0) return

  const tokens = Array.isArray(pushTokens) ? pushTokens : [pushTokens]
  const validTokens = tokens.filter(token => token && Expo.isExpoPushToken(token))

  if (validTokens.length === 0) return

  const messages = validTokens.map(to => ({
    to,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: 'default',
  }))

  const chunks = expo.chunkPushNotifications(messages)
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk)
    } catch (error) {
      console.error('Push error:', error.message)
    }
  }
}

// Specific notification helpers
async function notifyStoreNewOrder(store, order) {
  await sendPush(
    [store.expo_push_token],
    'New Order Received!',
    `₹${order.total} order — ${order.items?.length} items. Confirm within 60 seconds.`,
    { type: 'new_order', orderId: order.id }
  )
}

async function notifyRiderNewDelivery(rider, order) {
  await sendPush(
    [rider.expo_push_token],
    'New Delivery Available',
    `₹${order.total} order — ${order.delivery_distance_km?.toFixed(1)}km away.`,
    { type: 'new_delivery', orderId: order.id }
  )
}

async function notifyCustomerOrderUpdate(customer, order, message) {
  await sendPush(
    [customer.expo_push_token],
    'Order Update',
    message,
    { type: 'order_update', orderId: order.id }
  )
}

// Compatibility methods for routes/notificationRoutes.js
async function registerDeviceToken(userId, token, tokenType, deviceType, appType) {
  try {
    if (!Expo.isExpoPushToken(token)) {
      return { success: false, error: 'INVALID_TOKEN', message: 'Invalid Expo push token' }
    }

    let table = 'customers'
    if (appType === 'store' || appType === 'admin') {
      table = 'stores'
    } else if (appType === 'rider') {
      table = 'riders'
    }

    const { error } = await supabase
      .from(table)
      .update({ expo_push_token: token })
      .eq('id', userId)

    if (error) throw error

    return { success: true, message: 'Device token registered successfully' }
  } catch (error) {
    console.error('Error registering device token:', error.message)
    return { success: false, error: 'DB_ERROR', message: error.message }
  }
}

async function sendNotification(userId, notification) {
  try {
    // Search in customers, stores, and riders
    let token = null

    const { data: customer } = await supabase.from('customers').select('expo_push_token').eq('id', userId).maybeSingle()
    if (customer?.expo_push_token) {
      token = customer.expo_push_token
    } else {
      const { data: store } = await supabase.from('stores').select('expo_push_token').eq('id', userId).maybeSingle()
      if (store?.expo_push_token) {
        token = store.expo_push_token
      } else {
        const { data: rider } = await supabase.from('riders').select('expo_push_token').eq('id', userId).maybeSingle()
        if (rider?.expo_push_token) {
          token = rider.expo_push_token
        }
      }
    }

    if (!token) {
      return { success: false, error: 'NO_TOKEN', message: 'No registered push token found for user' }
    }

    await sendPush([token], notification.title, notification.body, notification.data)
    return { success: true, sent: 1, failed: 0 }
  } catch (error) {
    console.error('Error sending notification:', error.message)
    return { success: false, error: 'SEND_ERROR', message: error.message, sent: 0, failed: 1 }
  }
}

async function sendBroadcast(userIds, notification) {
  const results = { sent: 0, failed: 0 }
  for (const userId of userIds) {
    const res = await sendNotification(userId, notification)
    if (res.success) {
      results.sent += res.sent
    } else {
      results.failed += res.failed
    }
  }
  return { success: results.sent > 0, ...results }
}

module.exports = {
  sendPush,
  notifyStoreNewOrder,
  notifyRiderNewDelivery,
  notifyCustomerOrderUpdate,
  registerDeviceToken,
  sendNotification,
  sendBroadcast
}
