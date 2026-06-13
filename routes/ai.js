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
  const customerId = req.customerId

  try {
    // Check if Groq API key is configured
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ 
        error: 'AI service not configured. Please add GROQ_API_KEY to backend environment.'
      })
    }

    let extractedItems = []
    let aiMessage = ''

    if (type === 'text') {
      const result = await parseTextWithGroq(content)
      extractedItems = result.items || []
      aiMessage = result.message || ''
    } else if (type === 'image') {
      extractedItems = await parseImageWithGroq(content)
      aiMessage = "I've analyzed your shopping list image and extracted the items below."
    } else if (type === 'voice') {
      const result = await parseVoiceWithGroq(content)
      extractedItems = result.items || []
      aiMessage = result.message || ''
    }

    // Search for matching products in database
    const matchedProducts = []
    const notFoundItems = []

    for (const item of extractedItems) {
      let { data: products } = await supabase
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
        .maybeSingle()

      // If no exact match, try with exact name match
      if (!products) {
        const { data: exactMatch } = await supabase
          .from('products')
          .select(`
            *,
            categories (id, name, emoji, commission_rate),
            stores!inner (id, store_name, status, is_open)
          `)
          .eq('stores.status', 'active')
          .eq('is_active', true)
          .gt('stock', 0)
          .ilike('name', `${item.name}`)
          .limit(1)
          .maybeSingle()
        products = exactMatch
      }

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
      message: aiMessage,
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
  const prompt = `You are a warm, friendly, and helpful grocery shopping assistant (like ChatGPT).
Analyze the user's input: "${text}"

Perform these tasks:
1. Identify if the user is asking for a recipe, meal idea, or theme (e.g. "paneer butter masala", "birthday party snacks", "weekly essentials"). If so, intelligently expand it into a list of specific, individual grocery items (e.g. for paneer butter masala: paneer, butter, tomato, onion, cream).
2. Extract the final list of specific grocery items and their quantities. Keep item names simple and relevant.
3. Formulate a conversational response (message) that is friendly, helpful, and polite. If they asked for a recipe, briefly mention the recipe or how you selected the ingredients. If they just said hi, greet them warmly. Keep it positive, conversational, and under 3 sentences.
4. Output ONLY a valid JSON object in the following format:
{
  "message": "Your friendly, conversational response here.",
  "items": [
    {"name": "item name", "quantity": 1}
  ]
}`

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: 'You are a friendly grocery shopping AI assistant. Extract items and quantities. Respond warmly and helpfully. Always return a valid JSON object with "message" and "items".'
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

  const responseText = completion.choices[0]?.message?.content || '{}'

  try {
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    }
    const parsedObj = JSON.parse(jsonText)
    const items = normalizeItems(parsedObj.items || [])
    const message = parsedObj.message || "I've processed your list and found these items for you!"
    return { items, message }
  } catch (error) {
    const items = normalizeItems(extractJsonArray(responseText))
    return {
      items,
      message: "Here are the items I found based on your request!"
    }
  }
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
    model: 'llama-3.2-11b-vision-preview',
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
  if (!cleaned) return { items: [], message: "No voice input detected." }

  const tmpFile = path.join(os.tmpdir(), `zapkart-voice-${Date.now()}.m4a`)
  try {
    fs.writeFileSync(tmpFile, Buffer.from(cleaned, 'base64'))

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tmpFile),
      model: 'whisper-large-v3',
      language: 'hi'
    })

    const text = (transcription && transcription.text ? transcription.text : '').trim()
    if (!text) return { items: [], message: "Could not transcribe audio." }
    return await parseTextWithGroq(text)
  } finally {
    try { fs.unlinkSync(tmpFile) } catch (_) { /* ignore cleanup errors */ }
  }
}

module.exports = router
