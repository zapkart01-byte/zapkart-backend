const express = require('express')
const { supabase } = require('../config/supabase')
const { verifyToken, requireRole } = require('../middleware/auth')

const router = express.Router()

// Returns active and in-stock products visible to customers.
router.get('/', verifyToken, requireRole('customer'), async (req, res) => {
  const { storeId, categoryId, search } = req.query
  let query = supabase
    .from('products')
    .select('*, stores(id, store_name, status), categories(id, name)')
    .eq('is_active', true)
    .gt('stock', 0)

  if (storeId) query = query.eq('store_id', storeId)
  if (categoryId) query = query.eq('category_id', categoryId)
  if (search) query = query.ilike('name', `%${search}%`)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return res.status(500).json({ message: 'Failed to fetch products', error: error.message })
  return res.status(200).json(data || [])
})

// Returns a single active product visible to customers.
router.get('/:id', verifyToken, requireRole('customer'), async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*, stores(id, store_name), categories(id, name)')
    .eq('id', req.params.id)
    .eq('is_active', true)
    .single()

  if (error || !data) return res.status(404).json({ message: 'Product not found' })
  return res.status(200).json(data)
})

module.exports = router
