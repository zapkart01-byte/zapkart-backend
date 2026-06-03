const Redis = require('ioredis')
const { logError, logInfo, logWarn } = require('../utils/logger')

let redisClient = null
const memoryStore = new Map()

// Initializes and returns the Redis client when REDIS_URL is configured.
function getRedisClient() {
  if (redisClient) return redisClient

  if (!process.env.REDIS_URL) {
    logWarn('REDIS_URL missing, falling back to in-memory cache')
    return null
  }

  const connectionOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  }

  // Upstash and secure connections require TLS options enabled
  if (process.env.REDIS_URL.startsWith('rediss://')) {
    connectionOptions.tls = {
      rejectUnauthorized: false
    }
  }

  redisClient = new Redis(process.env.REDIS_URL, connectionOptions)

  redisClient.on('error', (error) => {
    logError('Redis client error', { error: error.message })
  })

  redisClient.connect().then(() => {
    logInfo('Redis client connected')
  }).catch((error) => {
    logError('Redis connection failed, using in-memory cache', { error: error.message })
    redisClient = null
  })

  return redisClient
}

// Stores a rider location with a short expiration window.
async function setRiderLocation(riderId, payload, ttlSeconds = 30) {
  const client = getRedisClient()
  const key = `rider:${riderId}:location`

  if (!client) {
    memoryStore.set(key, { payload, expiresAt: Date.now() + ttlSeconds * 1000 })
    return
  }

  await client.set(key, JSON.stringify(payload), 'EX', ttlSeconds)
}

// Reads the rider location from Redis or fallback memory.
async function getRiderLocation(riderId) {
  const client = getRedisClient()
  const key = `rider:${riderId}:location`

  if (!client) {
    const entry = memoryStore.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      memoryStore.delete(key)
      return null
    }
    return entry.payload
  }

  const value = await client.get(key)
  return value ? JSON.parse(value) : null
}

module.exports = {
  getRedisClient,
  setRiderLocation,
  getRiderLocation,
}
