/**
 * ═══════════════════════════════════════════════════════
 * Push Notification Service
 * ═══════════════════════════════════════════════════════
 * Manages push notifications using expo-server-sdk
 * - Device token storage and management
 * - Notification batching (max 100 per call)
 * - Exponential backoff retry (3 attempts)
 * - Invalid token detection and removal
 * - Receipt tracking with Redis
 * - Rate limiting (100 per user per day)
 * ═══════════════════════════════════════════════════════
 */

const { Expo } = require('expo-server-sdk')
const { createClient } = require('@supabase/supabase-js')
const { getRedisClient } = require('../utils/redisClient')
const config = require('../config/environment')
const { logInfo, logError, logWarn } = require('../utils/logger')

class NotificationService {
  constructor() {
    this.expo = new Expo({
      accessToken: config.expoPush.accessToken,
      useFcmV1: false // Using legacy FCM for compatibility
    })
    this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey)
    this.redis = getRedisClient()
  }

  /**
   * Register device token for push notifications
   * @param {string} userId - User ID
   * @param {string} token - Push token (Expo or FCM)
   * @param {string} tokenType - 'expo' or 'fcm'
   * @param {string} deviceType - 'ios', 'android', or 'web'
   * @param {string} appType - 'store', 'rider', 'customer', or 'admin'
   * @returns {Promise<Object>} Registration result
   */
  async registerDeviceToken(userId, token, tokenType, deviceType, appType) {
    try {
      // Validate Expo push token format
      if (tokenType === 'expo' && !Expo.isExpoPushToken(token)) {
        return {
          success: false,
          error: 'INVALID_TOKEN_FORMAT',
          message: 'Invalid Expo push token format'
        }
      }

      // Check if token already exists for this user and app
      const { data: existing, error: fetchError } = await this.supabase
        .from('device_tokens')
        .select('token_id')
        .eq('user_id', userId)
        .eq('token', token)
        .eq('app_type', appType)
        .maybeSingle()

      if (existing) {
        // Update existing token
        const { error: updateError } = await this.supabase
          .from('device_tokens')
          .update({
            token_type: tokenType,
            device_type: deviceType,
            updated_at: new Date().toISOString()
          })
          .eq('token_id', existing.token_id)

        if (updateError) {
          logError('Error updating device token', { error: updateError.message })
          return {
            success: false,
            error: 'UPDATE_FAILED',
            message: 'Failed to update device token'
          }
        }

        logInfo('Device token updated', { user_id: userId, app_type: appType })
        return {
          success: true,
          message: 'Device token updated successfully',
          token_id: existing.token_id
        }
      }

      // Insert new token
      const { data: newToken, error: insertError } = await this.supabase
        .from('device_tokens')
        .insert({
          user_id: userId,
          token,
          token_type: tokenType,
          device_type: deviceType,
          app_type: appType,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('token_id')
        .single()

      if (insertError) {
        logError('Error inserting device token', { error: insertError.message })
        return {
          success: false,
          error: 'INSERT_FAILED',
          message: 'Failed to register device token'
        }
      }

      logInfo('Device token registered', { user_id: userId, app_type: appType })
      return {
        success: true,
        message: 'Device token registered successfully',
        token_id: newToken.token_id
      }
    } catch (error) {
      logError('Error registering device token', { error: error.message })
      return {
        success: false,
        error: 'REGISTRATION_ERROR',
        message: 'Failed to register device token'
      }
    }
  }

  /**
   * Check notification rate limit for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Rate limit status
   */
  async checkNotificationRateLimit(userId) {
    const rateLimitKey = `notification:rate:${userId}`
    
    try {
      const count = await this.redis.get(rateLimitKey)
      const notificationCount = count ? parseInt(count) : 0
      
      if (notificationCount >= config.rateLimit.notifications.perUser) {
        const ttl = await this.redis.ttl(rateLimitKey)
        return {
          allowed: false,
          remaining: 0,
          resetIn: ttl,
          message: `Maximum ${config.rateLimit.notifications.perUser} notifications per day exceeded`
        }
      }
      
      return {
        allowed: true,
        remaining: config.rateLimit.notifications.perUser - notificationCount
      }
    } catch (error) {
      logError('Error checking notification rate limit', { error: error.message })
      return { allowed: true, remaining: config.rateLimit.notifications.perUser }
    }
  }

  /**
   * Increment notification rate limit counter
   * @param {string} userId - User ID
   * @param {number} count - Number of notifications sent
   */
  async incrementNotificationRateLimit(userId, count = 1) {
    const rateLimitKey = `notification:rate:${userId}`
    
    try {
      const currentCount = await this.redis.incr(rateLimitKey)
      
      if (currentCount === count) {
        // Set expiry on first notification (24 hours)
        await this.redis.expire(rateLimitKey, 86400)
      }
    } catch (error) {
      logError('Error incrementing notification rate limit', { error: error.message })
    }
  }

  /**
   * Send push notification to user
   * @param {string} userId - User ID
   * @param {Object} notification - Notification object
   * @returns {Promise<Object>} Send result
   */
  async sendNotification(userId, notification) {
    try {
      // Check rate limiting
      const rateLimit = await this.checkNotificationRateLimit(userId)
      if (!rateLimit.allowed) {
        logWarn('Notification rate limit exceeded', { user_id: userId })
        return {
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: rateLimit.message,
          sent: 0,
          failed: 0
        }
      }

      // Get user's device tokens
      const { data: tokens, error: fetchError } = await this.supabase
        .from('device_tokens')
        .select('token, token_type, device_type, app_type')
        .eq('user_id', userId)

      if (fetchError || !tokens || tokens.length === 0) {
        logWarn('No device tokens found for user', { user_id: userId })
        return {
          success: false,
          error: 'NO_TOKENS',
          message: 'No device tokens registered for this user',
          sent: 0,
          failed: 0
        }
      }

      // Separate Expo and FCM tokens
      const expoTokens = tokens
        .filter(t => t.token_type === 'expo' && Expo.isExpoPushToken(t.token))
        .map(t => t.token)

      const results = {
        sent: 0,
        failed: 0,
        invalidTokens: []
      }

      // Send via Expo Push
      if (expoTokens.length > 0) {
        const expoResults = await this.sendExpoNotifications(expoTokens, notification)
        results.sent += expoResults.sent
        results.failed += expoResults.failed
        results.invalidTokens.push(...expoResults.invalidTokens)
      }

      // Remove invalid tokens
      if (results.invalidTokens.length > 0) {
        await this.removeInvalidTokens(userId, results.invalidTokens)
      }

      // Increment rate limit counter
      await this.incrementNotificationRateLimit(userId, results.sent)

      // Log notification
      await this.logNotification(userId, notification.type, results)

      return {
        success: results.sent > 0,
        ...results
      }
    } catch (error) {
      logError('Error sending notification', { error: error.message, user_id: userId })
      return {
        success: false,
        error: 'SEND_ERROR',
        message: 'Failed to send notification',
        sent: 0,
        failed: 0
      }
    }
  }

  /**
   * Send notifications via Expo Push Service
   * @param {Array<string>} tokens - Array of Expo push tokens
   * @param {Object} notification - Notification object
   * @returns {Promise<Object>} Send results
   */
  async sendExpoNotifications(tokens, notification) {
    const messages = tokens.map(token => ({
      to: token,
      sound: notification.sound || 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      priority: notification.priority || 'high',
      channelId: notification.channelId || 'default',
      badge: notification.badge
    }))

    const results = {
      sent: 0,
      failed: 0,
      invalidTokens: []
    }

    // Batch notifications (max 100 per request)
    const chunks = this.chunkArray(messages, config.notification.batchSize)

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.sendExpoChunkWithRetry(chunk)

        for (let i = 0; i < ticketChunk.length; i++) {
          const ticket = ticketChunk[i]
          const token = chunk[i].to

          if (ticket.status === 'ok') {
            results.sent++
            // Store receipt ID for later checking
            await this.redis.setex(
              `receipt:${ticket.id}`,
              86400, // 24 hours
              JSON.stringify({ token, notification: notification.type })
            )
          } else if (ticket.status === 'error') {
            results.failed++

            if (ticket.details?.error === 'DeviceNotRegistered') {
              results.invalidTokens.push(token)
            }

            logError('Expo push notification error', {
              error: ticket.message,
              details: ticket.details
            })
          }
        }
      } catch (error) {
        logError('Error sending Expo notification chunk', { error: error.message })
        results.failed += chunk.length
      }
    }

    return results
  }

  /**
   * Send Expo notification chunk with retry logic
   * @param {Array} messages - Messages to send
   * @param {number} attempt - Current attempt number
   * @returns {Promise<Array>} Tickets
   */
  async sendExpoChunkWithRetry(messages, attempt = 1) {
    try {
      return await this.expo.sendPushNotificationsAsync(messages)
    } catch (error) {
      if (attempt < config.notification.maxRetries) {
        // Exponential backoff
        const delay = config.notification.retryBackoffMs * Math.pow(2, attempt - 1)
        logWarn(`Retrying Expo notification send (attempt ${attempt + 1})`, { delay })
        
        await new Promise(resolve => setTimeout(resolve, delay))
        return await this.sendExpoChunkWithRetry(messages, attempt + 1)
      }
      
      throw error
    }
  }

  /**
   * Remove invalid tokens from database
   * @param {string} userId - User ID
   * @param {Array<string>} tokens - Invalid tokens
   */
  async removeInvalidTokens(userId, tokens) {
    try {
      const { error } = await this.supabase
        .from('device_tokens')
        .delete()
        .eq('user_id', userId)
        .in('token', tokens)

      if (error) {
        logError('Error removing invalid tokens', { error: error.message })
      } else {
        logInfo('Invalid tokens removed', { user_id: userId, count: tokens.length })
      }
    } catch (error) {
      logError('Error removing invalid tokens', { error: error.message })
    }
  }

  /**
   * Log notification to database
   * @param {string} userId - User ID
   * @param {string} type - Notification type
   * @param {Object} results - Send results
   */
  async logNotification(userId, type, results) {
    try {
      await this.supabase
        .from('notification_logs')
        .insert({
          user_id: userId,
          notification_type: type,
          sent_count: results.sent,
          failed_count: results.failed,
          timestamp: new Date().toISOString()
        })
    } catch (error) {
      logError('Error logging notification', { error: error.message })
    }
  }

  /**
   * Chunk array into smaller arrays
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array<Array>} Chunked arrays
   */
  chunkArray(array, size) {
    const chunks = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  /**
   * Send notification to store about new order
   * @param {string} storeId - Store ID
   * @param {string} orderId - Order ID
   * @param {Object} orderDetails - Order details
   */
  async notifyStoreNewOrder(storeId, orderId, orderDetails) {
    return await this.sendNotification(storeId, {
      type: 'new_order',
      title: 'New Order Received',
      body: `Order #${orderId} - ${orderDetails.itemCount} items worth ₹${orderDetails.total}`,
      data: {
        order_id: orderId,
        action: 'view_order',
        screen: 'OrderDetails'
      },
      channelId: 'store_orders',
      priority: 'high',
      sound: 'default'
    })
  }

  /**
   * Send notification to rider about delivery assignment
   * @param {string} riderId - Rider ID
   * @param {string} orderId - Order ID
   * @param {string} pickupAddress - Pickup address
   */
  async notifyRiderAssignment(riderId, orderId, pickupAddress) {
    return await this.sendNotification(riderId, {
      type: 'rider_assignment',
      title: 'New Delivery Assignment',
      body: `Pickup from ${pickupAddress}`,
      data: {
        order_id: orderId,
        action: 'view_delivery',
        screen: 'DeliveryDetails'
      },
      channelId: 'rider_deliveries',
      priority: 'high',
      sound: 'default'
    })
  }

  /**
   * Send notification about order status change
   * @param {string} customerId - Customer ID
   * @param {string} orderId - Order ID
   * @param {string} status - Order status
   */
  async notifyOrderStatusChange(customerId, orderId, status) {
    const statusMessages = {
      confirmed: 'Your order has been confirmed',
      preparing: 'Your order is being prepared',
      ready: 'Your order is ready for pickup',
      picked_up: 'Rider has picked up your order',
      out_for_delivery: 'Your order is out for delivery',
      delivered: 'Your order has been delivered'
    }

    return await this.sendNotification(customerId, {
      type: 'order_status',
      title: 'Order Update',
      body: statusMessages[status] || 'Order status updated',
      data: {
        order_id: orderId,
        status,
        action: 'track_order',
        screen: 'OrderTracking'
      },
      channelId: 'customer_orders',
      priority: status === 'delivered' ? 'high' : 'default',
      sound: 'default'
    })
  }

  /**
   * Send broadcast notification to multiple users
   * @param {Array<string>} userIds - Array of user IDs
   * @param {Object} notification - Notification object
   * @returns {Promise<Object>} Broadcast results
   */
  async sendBroadcast(userIds, notification) {
    const results = {
      total: userIds.length,
      sent: 0,
      failed: 0,
      errors: []
    }

    for (const userId of userIds) {
      try {
        const result = await this.sendNotification(userId, notification)
        if (result.success) {
          results.sent += result.sent
        } else {
          results.failed++
          results.errors.push({ user_id: userId, error: result.error })
        }
      } catch (error) {
        results.failed++
        results.errors.push({ user_id: userId, error: error.message })
      }
    }

    logInfo('Broadcast notification sent', {
      total: results.total,
      sent: results.sent,
      failed: results.failed
    })

    return results
  }
}

module.exports = new NotificationService()
