-- ═══════════════════════════════════════════════════════
-- Zapkart Database Migration - 003_product_images_and_profit.sql
-- Run this in the Supabase SQL Editor to add multi-image support
-- and cost price fields for products.
-- ═══════════════════════════════════════════════════════

-- 1. Add multi-image support (Postgres TEXT array)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- 2. Backfill existing image_url values into the new array column
UPDATE public.products
  SET image_urls = ARRAY[image_url]
  WHERE image_url IS NOT NULL AND image_url != '' AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);

-- 3. Add cost price for profit calculation
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;
