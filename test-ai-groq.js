// Test GROQ API directly
require('dotenv').config()
const Groq = require('groq-sdk')

console.log('🔍 Testing GROQ API Connection...\n')
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? `${process.env.GROQ_API_KEY.substring(0, 20)}...` : '❌ NOT SET')
console.log('')

if (!process.env.GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY not found in .env file')
  process.exit(1)
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

async function testGroqAPI() {
  try {
    console.log('📤 Sending test prompt to GROQ...')
    
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a grocery list parser. Extract items and quantities from user input. Always return valid JSON array.'
        },
        {
          role: 'user',
          content: 'Extract grocery items from this shopping list. Return JSON array with objects containing "name" and "quantity" fields.\n\nShopping list: "2L milk, 6 eggs, bread"\n\nRules:\n- Extract each item as separate object\n- Parse quantities (2L, 1kg, 6 pieces, etc)\n- Normalize names (e.g., "2L milk" -> name: "Milk 2L", quantity: 1)\n- If no quantity specified, use quantity: 1\n- Return only valid JSON array\n\nExample output:\n[{"name": "Milk 2L", "quantity": 1}, {"name": "Eggs", "quantity": 6}]'
        }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 1000
    })

    const responseText = completion.choices[0]?.message?.content || '[]'
    
    console.log('✅ GROQ API Response:')
    console.log(responseText)
    console.log('')
    
    // Try to parse JSON
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    }
    
    try {
      const parsed = JSON.parse(jsonText)
      console.log('✅ Successfully parsed JSON:')
      console.log(JSON.stringify(parsed, null, 2))
      console.log('')
      console.log('🎉 GROQ API is working correctly!')
    } catch (parseError) {
      console.error('❌ Failed to parse JSON response:')
      console.error(parseError.message)
    }
    
  } catch (error) {
    console.error('❌ GROQ API Error:')
    console.error('Status:', error.status)
    console.error('Message:', error.message)
    
    if (error.status === 401) {
      console.error('\n🔑 API Key is invalid or expired!')
      console.error('Get new key at: https://console.groq.com/keys')
    } else if (error.status === 429) {
      console.error('\n⏱️ Rate limit exceeded. Wait and try again.')
    }
  }
}

// Also test Supabase connection
async function testSupabase() {
  const { createClient } = require('@supabase/supabase-js')
  
  console.log('\n🔍 Testing Supabase Connection...\n')
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL)
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  
  try {
    const { data, error, count } = await supabase
      .from('products')
      .select('id, name, unit, store_price', { count: 'exact' })
      .eq('is_active', true)
      .limit(5)
    
    if (error) throw error
    
    console.log(`✅ Found ${count} active products in database`)
    console.log('\nSample products:')
    data.forEach(p => {
      console.log(`- ${p.name} (${p.unit}) - ₹${p.store_price}`)
    })
    
    if (count === 0) {
      console.log('\n⚠️  WARNING: No products in database!')
      console.log('AI cart needs products to search and match.')
      console.log('Add some products from the admin/store app first.')
    }
    
  } catch (error) {
    console.error('❌ Supabase Error:', error.message)
  }
}

// Run tests
async function runAllTests() {
  await testGroqAPI()
  await testSupabase()
  console.log('\n✅ All tests complete!')
}

runAllTests()
