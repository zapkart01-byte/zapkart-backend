require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const http = require('http')
const { Server } = require('socket.io')
const cron = require('node-cron')

const config = require('./config/environment')
const { initializeRedis } = require('./utils/redisClient')
const { globalLimiter } = require('./middleware/auth')
const { setIo } = require('./config/socket')
const { runWeeklySettlement, checkCODLimits } = require('./services/settlementService')
const { logInfo, logError } = require('./utils/logger')

// Import route handlers
const authRoutes = require('./routes/auth')
const authMobileRoutes = require('./routes/authMobile')
const publicRoutes = require('./routes/public')
const productsRoutes = require('./routes/products')
const storesRoutes = require('./routes/stores')
const offersRoutes = require('./routes/offers')
const registrationRoutes = require('./routes/registration')
const analyticsRoutes = require('./routes/analytics')
const ordersRoutes = require('./routes/orders')
const financeRoutes = require('./routes/finance')
const notificationsRoutes = require('./routes/notifications')
const notificationRoutesNew = require('./routes/notificationRoutes')
const trackingRoutes = require('./routes/tracking')
const ridersRoutes = require('./routes/riders')

// Initialize Redis connection
try {
  initializeRedis()
} catch (error) {
  logError('Failed to initialize Redis', { error: error.message })
  process.exit(1)
}

// Initialize Express application
const app = express()
const PORT = config.port

// Create HTTP server wrapping Express
const server = http.createServer(app)

// Apply global security headers middleware via Helmet
app.use(helmet())

// Configure Cross-Origin Resource Sharing (CORS) limits
const allowedOrigins = [
  'http://localhost:5173', // Local Vite Admin App
  'http://localhost:8081', // Local Expo Store App (web)
  'http://localhost:19006', // Expo Web alternate port
]

if (process.env.CORS_ORIGIN) {
  // Support comma-separated origins in CORS_ORIGIN env var
  process.env.CORS_ORIGIN.split(',').forEach((origin) => {
    allowedOrigins.push(origin.trim())
  })
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true)
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true)
    } else {
      return callback(new Error('Not allowed by CORS'), false)
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}
app.use(cors(corsOptions))

// Request payload parsing middlewares
app.use(express.json({ limit: '10kb' })) // Protect against large payload flood attacks
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// Disable X-Powered-By header to obscure tech stack
app.disable('x-powered-by')

// Apply global API request rate limiter
app.use(globalLimiter)

// Healthcheck endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Register application routes
app.use('/auth', authRoutes)
app.use('/auth', authMobileRoutes)
app.use('/public', publicRoutes)
app.use('/products', productsRoutes)
app.use('/stores', storesRoutes)
app.use('/offers', offersRoutes)
app.use('/', registrationRoutes)
app.use('/analytics', analyticsRoutes)
app.use('/orders', ordersRoutes)
app.use('/finance', financeRoutes)
app.use('/notifications', notificationsRoutes)
app.use('/api/notifications', notificationRoutesNew)
app.use('/tracking', trackingRoutes)
app.use('/riders', ridersRoutes)

// Fallback 404 handler for invalid routes
app.use((req, res, next) => {
  res.status(404).json({ message: 'Resource not found' })
})

// Centralized error handling middleware
app.use((err, req, res, next) => {
  logError('Unhandled Server Error', { 
    message: err.message, 
    stack: err.stack,
    path: req.path,
    method: req.method
  })
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  })
})

// Initialize Socket.io on the HTTP server
const io = new Server(server, {
  cors: corsOptions
})
setIo(io)

// Handle Socket.io connections for real-time tracking
io.on('connection', (socket) => {
  logInfo('Socket.io client connected', { socketId: socket.id })

  socket.on('join-order', (orderId) => {
    if (orderId && typeof orderId === 'string') {
      socket.join(`order:${orderId}`)
      logInfo('Socket joined order room', { socketId: socket.id, orderId })
    }
  })

  socket.on('disconnect', () => {
    logInfo('Socket.io client disconnected', { socketId: socket.id })
  })
})

// Schedule automated settlement cron: Sunday 18:30 UTC = Monday 00:00 IST
cron.schedule('30 18 * * 0', async () => {
  logInfo('Cron: Starting weekly settlement run')
  try {
    const payouts = await runWeeklySettlement('system-cron')
    logInfo('Cron: Settlement run successfully completed', { processedPayouts: payouts.length })
  } catch (err) {
    logError('Cron: Weekly settlement run failed', { error: err.message, stack: err.stack })
  }
})

// Schedule hourly COD limit checks for riders
cron.schedule('0 * * * *', async () => {
  logInfo('Cron: Starting hourly COD balance limit check')
  try {
    await checkCODLimits()
    logInfo('Cron: COD balance limit check completed')
  } catch (err) {
    logError('Cron: COD limit check failed', { error: err.message })
  }
})

// Start the HTTP server listener
server.listen(PORT, () => {
  logInfo('ZapKart API Server successfully started', {
    port: PORT,
    environment: config.nodeEnv
  })
})
