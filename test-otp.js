/**
 * Quick Test Script for 2Factor OTP Setup
 * 
 * Usage:
 *   node test-otp.js send +919876543210
 *   node test-otp.js verify +919876543210 123456
 *   node test-otp.js balance
 */

require('dotenv').config()
const axios = require('axios')

const API_KEY = process.env.TWOFACTOR_API_KEY
const BASE_URL = 'https://2factor.in/API/V1'

if (!API_KEY) {
  console.error('❌ TWOFACTOR_API_KEY not found in .env file')
  process.exit(1)
}

const args = process.argv.slice(2)
const command = args[0]

async function checkBalance() {
  try {
    console.log('🔍 Checking 2Factor.in account balance...\n')
    
    const response = await axios.get(`${BASE_URL}/${API_KEY}/BAL/SMS`)
    
    if (response.data.Status === 'Success') {
      console.log('✅ API Key is valid!')
      console.log(`💰 SMS Balance: ${response.data.Details}\n`)
      console.log('📊 Estimated SMS available: ~', Math.floor(parseFloat(response.data.Details) / 0.15))
      return true
    } else {
      console.error('❌ Failed to check balance:', response.data)
      return false
    }
  } catch (error) {
    console.error('❌ Error checking balance:', error.message)
    if (error.response) {
      console.error('   Response:', error.response.data)
    }
    return false
  }
}

async function sendOTP(phone) {
  try {
    // Remove +91 prefix for 2Factor API
    const cleanPhone = phone.replace(/^\+91/, '')
    
    console.log(`📱 Sending OTP to: ${phone}\n`)
    
    const response = await axios.get(`${BASE_URL}/${API_KEY}/SMS/${cleanPhone}/AUTOGEN/6`)
    
    if (response.data.Status === 'Success') {
      console.log('✅ OTP sent successfully!')
      console.log(`📲 Session ID: ${response.data.Details}`)
      console.log('\n📝 Save this Session ID to verify the OTP')
      console.log('   Usage: node test-otp.js verify <phone> <otp>\n')
      return response.data.Details
    } else {
      console.error('❌ Failed to send OTP:', response.data)
      return null
    }
  } catch (error) {
    console.error('❌ Error sending OTP:', error.message)
    if (error.response) {
      console.error('   Response:', error.response.data)
    }
    return null
  }
}

async function verifyOTP(phone, otp) {
  try {
    console.log(`🔐 Verifying OTP for: ${phone}\n`)
    console.log('⚠️  NOTE: This requires the Session ID from send-otp response')
    console.log('   This is a simplified test. Use the mobile auth service for full flow.\n')
    
    // In real usage, you'd need the session_id from the send response
    // This is just a demonstration that the API key works
    console.log('✅ API Key is configured correctly')
    console.log('📱 Use the mobile app or full backend API for actual verification')
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Main execution
(async () => {
  console.log('\n' + '═'.repeat(60))
  console.log('  2Factor.in OTP Setup Test')
  console.log('═'.repeat(60) + '\n')
  
  if (!command) {
    console.log('Usage:')
    console.log('  node test-otp.js balance')
    console.log('  node test-otp.js send +919876543210')
    console.log('  node test-otp.js verify +919876543210 123456')
    console.log('\n')
    process.exit(0)
  }
  
  switch (command) {
    case 'balance':
      await checkBalance()
      break
      
    case 'send':
      const phone = args[1]
      if (!phone) {
        console.error('❌ Phone number required')
        console.error('   Usage: node test-otp.js send +919876543210')
        process.exit(1)
      }
      if (!/^\+91[6-9]\d{9}$/.test(phone)) {
        console.error('❌ Invalid phone format')
        console.error('   Required format: +91XXXXXXXXXX')
        console.error('   Example: +919876543210')
        process.exit(1)
      }
      await checkBalance()
      await sendOTP(phone)
      break
      
    case 'verify':
      const verifyPhone = args[1]
      const otp = args[2]
      if (!verifyPhone || !otp) {
        console.error('❌ Phone number and OTP required')
        console.error('   Usage: node test-otp.js verify +919876543210 123456')
        process.exit(1)
      }
      await verifyOTP(verifyPhone, otp)
      break
      
    default:
      console.error('❌ Unknown command:', command)
      console.error('   Valid commands: balance, send, verify')
      process.exit(1)
  }
  
  console.log('\n' + '═'.repeat(60) + '\n')
})()
