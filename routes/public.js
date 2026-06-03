const express = require('express')
const { supabase } = require('../config/supabase')

const router = express.Router()

// Returns currently active banners for unauthenticated clients.
router.get('/banners', async (req, res) => {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .eq('is_active', true)
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gte.${now}`)
    .order('sort_order', { ascending: true })

  if (error) return res.status(500).json({ message: 'Failed to fetch banners', error: error.message })
  return res.status(200).json(data || [])
})

// Returns active product categories for unauthenticated clients.
router.get('/categories', async (req, res) => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) return res.status(500).json({ message: 'Failed to fetch categories', error: error.message })
  return res.status(200).json(data || [])
})

module.exports = router
