// AI Shopping Assistant Routes
const express = require('express')
const router = express.Router()
const { verifyToken, requireRole } = require('../middleware/auth')
const { body, validationResult } = require('express-validator')
const Groq = require('groq-sdk')
const { supabase } = require('../config/supabase')

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

// Validation rules
const validateParseCart = [
  body('type').isIn(['text', 'image', 'voice']).withMessage('Type must be text, image, or voice'),
  body('content').notEmpty().withMessage('Content is required')
]

/**
 * POST /ai/parse-cart
 * Parse shopping list from text, image, or voice
 */
router.post('/parse-cart', verifyToken, requireRole('customer'), validateParseCart, async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg })
  }

  const { type, content } = req.body
  const customerId = req.user.id

  try {
    // Check if Groq API key is configured
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ 
        error: 'AI service not configured. Please add GROQ_API_KEY to backend environment.'
      })
    }

    let extractedItems = []

    if (type === 'text') {
      extractedItems = await parseTextWithGroq(content)
    } else if (type === 'image') {
      extractedItems = await parseImageWithGroq(content)
    } else if (type === 'voice') {
      extractedItems = await parseVoiceWithGroq(content)
    }

    // Search for matching products in database
    const matchedProducts = []
    const notFoundItems = []

    for (const item of extractedItems) {
      const { data: products } = await supabase
        .from('products')
        .select(`
          *,
          categories (id, name, emoji, commission_rate),
          stores!inner (id, store_name, status, is_open)
        `)
        .eq('stores.status', 'active')
        .eq('is_active', true)
        .gt('stock', 0)
        .ilike('name', `%${item.name}%`)
        .limit(1)
        .single()

      if (products) {
        matchedProducts.push({
          id: products.id,
          product: products,
          quantity: item.quantity || 1,
          searchTerm: item.name
        })
      } else {
        notFoundItems.push(item.name)
      }
    }

    // Log search for analytics
    await supabase.from('ai_search_log').insert({
      customer_id: customerId,
      query: type === 'text' ? content : `${type} input`,
      items_found: matchedProducts.length,
      items_missing: notFoundItems.length
    })

    res.json({
      matched: matchedProducts,
      notFound: notFoundItems,
      totalRequested: extractedItems.length
    })

  } catch (error) {
    console.error('AI parse error:', error)
    res.status(500).json({ 
      error: error.message || 'Failed to process shopping list'
    })
  }
})

/**
 * Parse text shopping list using Groq
 */
async function parseTextWithGroq(text) {
  const prompt = `Extract grocery items from this shopping list. Return JSON array with objects containing "name" and "quantity" fields.

Shopping list: "${text}"

Rules:
- Extract each item as separate object
- Parse quantities (2L, 1kg, 6 pieces, etc)
- Normalize names (e.g., "2L milk" -> name: "Milk 2L", quantity: 1)
- If no quantity specified, use quantity: 1
- Return only valid JSON array

Example output:
[{"name": "Milk 2L", "quantity": 1}, {"name": "Eggs", "quantity": 6}]`

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: 'You are a grocery list parser. Extract items and quantities from user input. Always return valid JSON array.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.3,
    max_tokens: 1000
  })

  const responseText = completion.choices[0]?.message?.content || '[]'
  
  // Extract JSON from response (handle markdown code blocks)
  let jsonText = responseText.trim()
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  }

  try {
    return JSON.parse(jsonText)
  } catch (error) {
    console.error('Failed to parse Groq response:', responseText)
    // Fallback: simple parsing
    return text.split(',').map(item => ({
      name: item.trim(),
      quantity: 1
    }))
  }
}

/**
 * Parse image using Groq Vision (placeholder - not fully supported yet)
 */
async function parseImageWithGroq(base64Image) {
  // Groq doesn't have full vision support yet
  // For now, return empty or use OCR alternative
  return []
}

/**
 * Parse voice using Groq Whisper
 */
async function parseVoiceWithGroq(audioBase64) {
  // Groq supports Whisper model for transcription
  // Convert base64 to buffer and transcribe
  // Then parse transcription as text
  
  // For now, return empty
  return []
}

module.exports = router
