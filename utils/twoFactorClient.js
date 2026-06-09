/**
 * ═══════════════════════════════════════════════════════
 * 2Factor.in API Client
 * ═══════════════════════════════════════════════════════
 * Client for 2Factor.in SMS OTP service
 * ═══════════════════════════════════════════════════════
 */

const axios = require('axios')
const config = require('../config/environment')
const { logInfo, logError } = require('./logger')

const TWOFACTOR_BASE_URL = 'https://2factor.in/API/V1'

class TwoFactorClient {
  constructor() {
    this.apiKey = config.twoFactor.apiKey
    this.client = axios.create({
      baseURL: TWOFACTOR_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  /**
   * Send OTP to phone number
   * @param {string} phoneNumber - Phone number in format: +91XXXXXXXXXX
   * @param {number} otpLength - Length of OTP (default: 6)
   * @param {number} otpExpiry - Expiry in minutes (default: 5)
   * @returns {Promise<Object>} Response with session_id
   */
  async sendOTP(phoneNumber, otpLength = 6, otpExpiry = 5) {
    try {
      // Remove +91 prefix if present for 2Factor.in API
      const cleanPhone = phoneNumber.replace(/^\+91/, '')
      
      const response = await this.client.get(`/${this.apiKey}/SMS/${cleanPhone}/AUTOGEN/${otpLength}`)
      
      if (response.data.Status === 'Success') {
        logInfo('OTP sent successfully via 2Factor.in', { 
          phone_last_4: cleanPhone.slice(-4),
          session_id: response.data.Details
        })
        
        return {
          success: true,
          session_id: response.data.Details,
          message: 'OTP sent successfully'
        }
      } else {
        logError('Failed to send OTP via 2Factor.in', { 
          status: response.data.Status,
          details: response.data.Details
        })
        
        return {
          success: false,
          error: response.data.Details || 'Failed to send OTP'
        }
      }
    } catch (error) {
      logError('2Factor.in API error (send OTP)', { 
        error: error.message,
        phone_last_4: phoneNumber.slice(-4)
      })
      
      return {
        success: false,
        error: error.response?.data?.Details || error.message || 'Failed to send OTP'
      }
    }
  }

  /**
   * Verify OTP
   * @param {string} sessionId - Session ID from sendOTP response
   * @param {string} otp - OTP code entered by user
   * @returns {Promise<Object>} Verification result
   */
  async verifyOTP(sessionId, otp) {
    try {
      const response = await this.client.get(`/${this.apiKey}/SMS/VERIFY/${sessionId}/${otp}`)
      
      if (response.data.Status === 'Success' && response.data.Details === 'OTP Matched') {
        logInfo('OTP verified successfully via 2Factor.in', { 
          session_id: sessionId
        })
        
        return {
          success: true,
          message: 'OTP verified successfully'
        }
      } else {
        logInfo('OTP verification failed via 2Factor.in', { 
          session_id: sessionId,
          status: response.data.Status,
          details: response.data.Details
        })
        
        return {
          success: false,
          error: response.data.Details || 'Invalid OTP'
        }
      }
    } catch (error) {
      logError('2Factor.in API error (verify OTP)', { 
        error: error.message,
        session_id: sessionId
      })
      
      return {
        success: false,
        error: error.response?.data?.Details || error.message || 'Failed to verify OTP'
      }
    }
  }

  /**
   * Check 2Factor.in service status
   * @returns {Promise<boolean>} Service availability
   */
  async checkServiceStatus() {
    try {
      const response = await this.client.get(`/${this.apiKey}/BAL/SMS`)
      return response.data.Status === 'Success'
    } catch (error) {
      logError('Failed to check 2Factor.in service status', { error: error.message })
      return false
    }
  }
}

module.exports = new TwoFactorClient()
