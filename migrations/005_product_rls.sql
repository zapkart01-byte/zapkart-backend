-- ═══════════════════════════════════════════════════════
-- Zapkart Database Migration - 005_product_rls.sql
-- Enable Row Level Security (RLS) and define policies for products
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. Enable Row Level Security (RLS) on public.products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if they exist to avoid duplication errors
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
DROP POLICY IF EXISTS "Store owners can insert their own products" ON public.products;
DROP POLICY IF EXISTS "Store owners can update their own products" ON public.products;
DROP POLICY IF EXISTS "Store owners can delete their own products" ON public.products;
DROP POLICY IF EXISTS "Admins have full access to products" ON public.products;

-- 3. Policy: Anyone (authenticated or guest/public) can view products
-- This is required so customers can browse store catalogs.
CREATE POLICY "Anyone can view products" ON public.products
  FOR SELECT USING (true);

-- 4. Policy: Store owners can insert products for their own store
-- Checks if the product's store_id is linked to the user's account in public.users
CREATE POLICY "Store owners can insert their own products" ON public.products
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT store_id FROM public.users WHERE id = auth.uid()
    )
  );

-- 5. Policy: Store owners can update products in their own store
CREATE POLICY "Store owners can update their own products" ON public.products
  FOR UPDATE USING (
    store_id IN (
      SELECT store_id FROM public.users WHERE id = auth.uid()
    )
  ) WITH CHECK (
    store_id IN (
      SELECT store_id FROM public.users WHERE id = auth.uid()
    )
  );

-- 6. Policy: Store owners can delete products from their own store
CREATE POLICY "Store owners can delete their own products" ON public.products
  FOR DELETE USING (
    store_id IN (
      SELECT store_id FROM public.users WHERE id = auth.uid()
    )
  );

-- 7. Policy: Admins have full access to all products
CREATE POLICY "Admins have full access to products" ON public.products
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );
