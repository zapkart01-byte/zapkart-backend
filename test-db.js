require('dotenv').config();
const { supabase } = require('./config/supabase');

async function test() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, image_urls, cost_price')
      .limit(1);

    if (error) {
      console.log('Error selecting columns:', error.message);
    } else {
      console.log('Columns exist! Sample data:', data);
    }
  } catch (err) {
    console.error('Execution error:', err);
  }
}

test();
