/**
 * ═══════════════════════════════════════════════════════
 * Environment Configuration Management
 * ═══════════════════════════════════════════════════════
 * Validates and exports all environment variables with:
 * - Required variable validation at startup
 * - Clear error messages for missing variables
 * - Environment-specific configuration profiles
 * - Secure defaults and type coercion
 * ═══════════════════════════════════════════════════════
 */

require('dotenv').config()

/**
 * Configuration profiles for different environments
 */
const ENV_PROFILES = {
  development: {
    logLevel: 'DEBUG',
    rateLimitEnabled: false,
    corsStrict: false
  },
  staging: {
    logLevel: 'INFO',
    rateLimitEnabled: true,
    corsStrict: true
  },
  production: {
    logLevel: 'INFO',
    rateLimitEnabled: true,
    corsStrict: true
  }
}

/**
 * Required environment variables with descriptions
 */
const REQUIRED_VARS = {
  // Server
  PORT: 'Server port number',
  NODE_ENV: 'Environment: development, staging, or production',
  
  // Supabase
  SUPABASE_URL: 'Supabase project URL',
  SUPABASE_SERVICE_ROLE_KEY: 'Supabase service role key (full access)',
  SUPABASE_ANON_KEY: 'Supabase anon key (client-side auth)',
  
  // External Services
  TWOFACTOR_API_KEY: '2Factor.in API key for SMS OTP',
  GROQ_API_KEY: 'Groq API key for AI shopping assistant',
  MAPTILER_API_KEY: 'MapTiler API key for map tiles',
  REDIS_URL: 'Redis connection URL for caching and rate limiting',
  
  // CORS
  CORS_ORIGIN: 'Allowed CORS origins (comma-separated)'
}

/**
 * Optional environment variables with defaults
 */
const OPTIONAL_VARS = {
  EXPO_ACCESS_TOKEN: null,
  AUTH_TRANSITION_DAYS: '30',
  // Firebase (legacy — no longer required, kept for backward compatibility)
  FIREBASE_PROJECT_ID: null,
  FIREBASE_CLIENT_EMAIL: null,
  FIREBASE_PRIVATE_KEY: null,
}

/**
 * Validate required environment variables
 * @throws {Error} If any required variable is missing
 */
function validateEnvironment() {
  const missing = []
  const warnings = []
  
  // Check required variables
  for (const [key, description] of Object.entries(REQUIRED_VARS)) {
    if (!process.env[key] || process.env[key].trim() === '') {
      missing.push(`  ❌ ${key}: ${description}`)
    }
  }
  
  // If any required variables are missing, throw error
  if (missing.length > 0) {
    console.error('\n╔═══════════════════════════════════════════════════════╗')
    console.error('║   CONFIGURATION ERROR: Missing Required Variables    ║')
    console.error('╚═══════════════════════════════════════════════════════╝\n')
    console.error('The following environment variables are required but not set:\n')
    console.error(missing.join('\n'))
    console.error('\n📄 Please check your .env file and set all required variables.')
    console.error('📖 Refer to .env.example for the complete list.\n')
    process.exit(1)
  }
  
  // Validate NODE_ENV
  const validEnvs = ['development', 'staging', 'production']
  if (!validEnvs.includes(process.env.NODE_ENV)) {
    console.warn(`⚠️  NODE_ENV="${process.env.NODE_ENV}" is not standard. Using "development" profile.`)
    process.env.NODE_ENV = 'development'
  }
  
  // Check optional variables and set defaults
  for (const [key, defaultValue] of Object.entries(OPTIONAL_VARS)) {
    if (!process.env[key] && defaultValue !== null) {
      process.env[key] = defaultValue
      warnings.push(`  ℹ️  ${key}: Using default value "${defaultValue}"`)
    }
  }
  
  // Display warnings if any
  if (warnings.length > 0) {
    console.log('\n⚙️  Configuration Warnings:\n')
    console.log(warnings.join('\n'))
    console.log('')
  }
  
  // Success message
  console.log('✅ Environment configuration validated successfully')
  console.log(`📦 Environment: ${process.env.NODE_ENV}`)
  console.log(`🔧 Profile: ${JSON.stringify(ENV_PROFILES[process.env.NODE_ENV] || ENV_PROFILES.development)}\n`)
}

/**
 * Get current environment profile
 * @returns {Object} Environment-specific configuration
 */
function getEnvProfile() {
  return ENV_PROFILES[process.env.NODE_ENV] || ENV_PROFILES.development
}

/**
 * Parse boolean environment variable
 * @param {string} key - Environment variable name
 * @param {boolean} defaultValue - Default value if not set
 * @returns {boolean}
 */
function getBoolean(key, defaultValue = false) {
  const value = process.env[key]
  if (value === undefined || value === null) return defaultValue
  return value.toLowerCase() === 'true' || value === '1'
}

/**
 * Parse integer environment variable
 * @param {string} key - Environment variable name
 * @param {number} defaultValue - Default value if not set
 * @returns {number}
 */
function getInteger(key, defaultValue = 0) {
  const value = process.env[key]
  if (value === undefined || value === null) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Export configuration object
 */
const config = {
  // Server
  port: getInteger('PORT', 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  profile: getEnvProfile(),
  
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY
  },
  
  // Firebase (for backward compatibility)
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  },
  
  // External Services
  twoFactor: {
    apiKey: process.env.TWOFACTOR_API_KEY
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY
  },
  mapTiler: {
    apiKey: process.env.MAPTILER_API_KEY
  },
  redis: {
    url: process.env.REDIS_URL
  },
  expoPush: {
    accessToken: process.env.EXPO_ACCESS_TOKEN || null
  },
  
  // CORS
  cors: {
    origins: process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || []
  },
  
  // Authentication
  auth: {
    transitionDays: getInteger('AUTH_TRANSITION_DAYS', 30)
  },
  
  // Rate Limiting
  rateLimit: {
    otp: {
      perPhone: 5,
      windowHours: 1
    },
    login: {
      perIP: 10,
      windowHours: 1
    },
    ai: {
      perUser: 20,
      windowHours: 1
    },
    notifications: {
      perUser: 100,
      windowDays: 1
    }
  },
  
  // OTP Configuration
  otp: {
    length: 6,
    expiryMinutes: 5,
    maxAttempts: 3,
    blockMinutes: 15,
    resendCooldownSeconds: 60
  },
  
  // JWT Configuration
  jwt: {
    publicKeyCacheTTL: 3600, // 1 hour in seconds
    maxTokenAge: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
  },
  
  // AI Service Configuration
  ai: {
    textTimeoutMs: 10000, // 10 seconds
    imageTimeoutMs: 15000, // 15 seconds
    voiceTimeoutMs: 15000, // 15 seconds
    models: {
      chat: 'llama-3.3-70b-versatile',
      whisper: 'whisper-large-v3'
    }
  },
  
  // Push Notification Configuration
  notification: {
    batchSize: 100,
    maxRetries: 3,
    retryBackoffMs: 1000
  },
  
  // Pricing Configuration
  pricing: {
    platformMarkup: 1.00, // INR per item
    riderPayoutTiers: [
      { maxKm: 2, payout: 25 },
      { maxKm: 5, payout: 40 },
      { maxKm: Infinity, payout: 60 }
    ],
    platformMarginTiers: [
      { maxKm: 2, margin: 10 },
      { maxKm: 5, margin: 15 },
      { maxKm: Infinity, margin: 20 }
    ]
  }
}

// Validate environment on module load
validateEnvironment()

module.exports = config
