// AI Shopping Assistant Routes
const express = require('express')
const router = express.Router()
const { verifyToken, requireRole } = require('../middleware/auth')
const { body, validationResult } = require('express-validator')
const Groq = require('groq-sdk')
const fs = require('fs')
const os = require('os')
const path = require('path')
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

  const parsed = normalizeItems(extractJsonArray(responseText))
  if (parsed.length > 0) return parsed

  // Fallback: simple comma-split parsing if the model returned nothing usable
  return text.split(',').map(item => ({
    name: item.trim(),
    quantity: 1
  })).filter(it => it.name)
}

/**
 * Normalize a raw model JSON array into the { name, quantity } shape
 * used by the product search loop. Accepts items that use either
 * "name" or "item" keys and an optional "unit".
 */
function normalizeItems(rawArray) {
  if (!Array.isArray(rawArray)) return []
  return rawArray
    .map((it) => {
      const baseName = (it.name || it.item || '').toString().trim()
      if (!baseName) return null
      const name = it.unit ? `${baseName} ${it.unit}`.trim() : baseName
      const quantity = Number(it.quantity) > 0 ? Number(it.quantity) : 1
      return { name, quantity }
    })
    .filter(Boolean)
}

/**
 * Extract a JSON array from a model response that may be wrapped in
 * markdown fences or include surrounding prose.
 */
function extractJsonArray(responseText) {
  let jsonText = (responseText || '').trim()
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  }
  // If the model returned an explicit not-a-list error object, treat as empty.
  if (jsonText.startsWith('{')) {
    try {
      const obj = JSON.parse(jsonText)
      if (obj && obj.error) return []
    } catch (_) { /* fall through */ }
  }
  try {
    return JSON.parse(jsonText)
  } catch (_) {
    const start = jsonText.indexOf('[')
    const end = jsonText.lastIndexOf(']')
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(jsonText.slice(start, end + 1))
      } catch (_) { /* fall through */ }
    }
    return []
  }
}

/**
 * Parse a photo of a shopping list using Groq vision.
 * Accepts a base64-encoded JPEG (with or without data URL prefix).
 */
async function parseImageWithGroq(base64Image) {
  const cleaned = (base64Image || '').replace(/^data:image\/[a-zA-Z]+;base64,/, '')
  if (!cleaned) return []

  const completion = await groq.chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    max_tokens: 800,
    temperature: 0.2,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${cleaned}` } },
          {
            type: 'text',
            text: 'This is a grocery shopping list image. It may be handwritten in Hindi or English. Extract all grocery items and quantities. Return ONLY a JSON array: [{"name":"item name","quantity":1}]. If this is not a grocery list, return {"error":"not_a_list"}.'
          }
        ]
      }
    ]
  })

  const responseText = completion.choices[0]?.message?.content || '[]'
  return normalizeItems(extractJsonArray(responseText))
}

/**
 * Parse a voice recording: transcribe with Whisper, then reuse the
 * text parser on the transcription. Accepts base64-encoded audio
 * (with or without data URL prefix).
 */
async function parseVoiceWithGroq(audioBase64) {
  const cleaned = (audioBase64 || '').replace(/^data:audio\/[a-zA-Z0-9.+-]+;base64,/, '')
  if (!cleaned) return []

  const tmpFile = path.join(os.tmpdir(), `zapkart-voice-${Date.now()}.m4a`)
  try {
    fs.writeFileSync(tmpFile, Buffer.from(cleaned, 'base64'))

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tmpFile),
      model: 'whisper-large-v3',
      language: 'hi'
    })

    const text = (transcription && transcription.text ? transcription.text : '').trim()
    if (!text) return []
    return await parseTextWithGroq(text)
  } finally {
    try { fs.unlinkSync(tmpFile) } catch (_) { /* ignore cleanup errors */ }
  }
}

module.exports = router
