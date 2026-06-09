/**
 * ═══════════════════════════════════════════════════════
 * Redis Client Configuration
 * ═══════════════════════════════════════════════════════
 * Configures Redis connection for caching and rate limiting
 * ═══════════════════════════════════════════════════════
 */

const Redis = require('ioredis')
const config = require('../config/environment')
const { logInfo, logError } = require('./logger')

let redisClient = null

/**
 * Initialize Redis client with connection handling
 */
function initializeRedis() {
  if (redisClient) {
    return redisClient
  }

  try {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000)
        return delay
      }
    })

    redisClient.on('connect', () => {
      logInfo('Redis client connected successfully')
    })

    redisClient.on('error', (err) => {
      logError('Redis client error', { error: err.message })
    })

    redisClient.on('close', () => {
      logInfo('Redis client connection closed')
    })

    return redisClient
  } catch (error) {
    logError('Failed to initialize Redis client', { error: error.message })
    throw error
  }
}

/**
 * Get Redis client instance
 */
function getRedisClient() {
  if (!redisClient) {
    return initializeRedis()
  }
  return redisClient
}

/**
 * Close Redis connection gracefully
 */
async function closeRedis() {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
    logInfo('Redis client disconnected')
  }
}

module.exports = {
  initializeRedis,
  getRedisClient,
  closeRedis
}
