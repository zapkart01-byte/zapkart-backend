const { createClient } = require('@supabase/supabase-js')

// Load environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

// Validate environment variables
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables in backend .env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
}

// Create Supabase client using the service role key to bypass RLS for administrative actions
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})

module.exports = { supabase }
