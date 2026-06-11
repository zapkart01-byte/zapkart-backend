require('dotenv').config();
const axios = require('axios');

async function test() {
  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/`;
    const response = await axios.get(url, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    });

    if (response.data.definitions && response.data.definitions.coupon_usage) {
      console.log('coupon_usage table properties:', Object.keys(response.data.definitions.coupon_usage.properties));
    }
    if (response.data.definitions && response.data.definitions.ai_search_log) {
      console.log('ai_search_log table properties:', Object.keys(response.data.definitions.ai_search_log.properties));
    }
  } catch (err) {
    console.error('Error fetching schema:', err.message);
  }
}

test();
