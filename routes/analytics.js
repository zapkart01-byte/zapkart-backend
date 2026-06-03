const express = require('express')
const { supabase } = require('../config/supabase')
const { verifyToken, requireRole } = require('../middleware/auth')

const router = express.Router()

// Returns admin summary metrics for dashboard cards.
router.get('/summary', verifyToken, requireRole('superadmin'), async (req, res) => {
  const [{ count: totalOrders }, { count: activeStores }, { count: activeRiders }] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('stores').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('riders').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ])

  const { data: revenueRows, error: revenueError } = await supabase
    .from('orders')
    .select('subtotal, total, commission_amount, zapkart_net_profit')
    .eq('status', 'delivered')

  if (revenueError) return res.status(500).json({ message: 'Failed to compute analytics summary', error: revenueError.message })

  const grossSales = (revenueRows || []).reduce((sum, row) => sum + Number(row.total || 0), 0)
  const commission = (revenueRows || []).reduce((sum, row) => sum + Number(row.commission_amount || 0), 0)
  const netProfit = (revenueRows || []).reduce((sum, row) => sum + Number(row.zapkart_net_profit || 0), 0)
  const averageOrderValue = totalOrders ? Math.round(grossSales / totalOrders) : 0

  return res.status(200).json({
    totalOrders: totalOrders || 0,
    activeStores: activeStores || 0,
    activeRiders: activeRiders || 0,
    grossSales: Math.round(grossSales),
    commission: Math.round(commission),
    netProfit: Math.round(netProfit),
    averageOrderValue,
  })
})

module.exports = router
