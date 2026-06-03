const admin = require('firebase-admin')
const { logError, logInfo, logWarn } = require('../utils/logger')

let firebaseAuth = null
let firebaseMessaging = null
let isFirebaseInitialized = false

try {
  // Sanitize the private key to strip surrounding quotes if loaded literally by dotenv
  let privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim()
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1)
  }
  privateKey = privateKey.replace(/\\n/g, '\n').trim()

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL

  if (privateKey && projectId && clientEmail) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    })
    firebaseAuth = admin.auth()
    firebaseMessaging = admin.messaging()
    isFirebaseInitialized = true
    logInfo('Firebase Admin SDK initialized successfully')
  } else {
    logWarn('Firebase environment credentials missing, starting in mock Firebase mode')
  }
} catch (error) {
  logError('Firebase Admin SDK initialization failed, falling back to mock mode', { error: error.message })
}

// Fallback mock implementations if Firebase is not initialized
if (!isFirebaseInitialized) {
  firebaseAuth = {
    verifyIdToken: async (token) => {
      logWarn('Using MOCK Firebase verifyIdToken', { token: token ? token.substring(0, 15) + '...' : 'null' })
      
      // Decodes payload if token is structured like a JWT, otherwise uses standard developer token logic
      if (token && token.startsWith('mock-')) {
        return {
          uid: 'mock-uid',
          email: 'admin@zapkart.in',
          phone_number: '+919876543210',
          name: 'Mock Administrator'
        }
      }

      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
          return {
            uid: payload.user_id || payload.sub || 'mock-uid',
            email: payload.email || 'mock@zapkart.in',
            phone_number: payload.phone_number || '+919999999999',
            name: payload.name || 'Mock User'
          }
        }
      } catch (e) {
        // Fall through
      }

      // Default mock token profile fallback to allow local manual verification
      return {
        uid: 'mock-default-uid',
        email: 'developer@zapkart.in',
        phone_number: '+919999999999',
        name: 'Local Developer'
      }
    }
  }

  firebaseMessaging = {
    send: async (message) => {
      logWarn('Using MOCK Firebase messaging send', { message })
      return 'mock-message-id-' + Math.random().toString(36).substr(2, 9)
    }
  }
}

module.exports = { admin, firebaseAuth, firebaseMessaging, isFirebaseInitialized }
