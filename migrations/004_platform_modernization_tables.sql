-- ═══════════════════════════════════════════════════════
-- Zapkart Database Migration - 004_platform_modernization_tables.sql
-- Platform Modernization: New tables and columns for authentication,
-- notifications, AI, pricing, and product variants
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- 1. CATEGORY COMMISSIONS TABLE
-- Variable commission rates per category (3% - 20%)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.category_commissions (
  category_id UUID PRIMARY KEY REFERENCES public.categories(id) ON DELETE CASCADE,
  commission_rate NUMERIC(5, 4) NOT NULL CHECK (commission_rate >= 0.03 AND commission_rate <= 0.20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_category_commissions_category_id 
  ON public.category_commissions(category_id);

-- RLS Policies
ALTER TABLE public.category_commissions ENABLE ROW LEVEL SECURITY;

-- Admins can manage commission rates
CREATE POLICY "Admins can manage commission rates" ON public.category_commissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- All authenticated users can view commission rates
CREATE POLICY "Authenticated users can view commission rates" ON public.category_commissions
  FOR SELECT USING (auth.role() = 'authenticated');

COMMENT ON TABLE public.category_commissions IS 'Category-specific commission rates ranging from 3% to 20%';
COMMENT ON COLUMN public.category_commissions.commission_rate IS 'Commission rate as decimal (0.03 = 3%, 0.20 = 20%)';


-- ═══════════════════════════════════════════════════════
-- 2. PRODUCT VARIANTS TABLE
-- Product variations (size, color, flavor) with independent pricing
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.product_variants (
  variant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku VARCHAR(100) UNIQUE NOT NULL,
  option_name VARCHAR(50) NOT NULL, -- e.g., "size", "color", "flavor"
  option_value VARCHAR(100) NOT NULL, -- e.g., "Large", "Red", "Chocolate"
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id 
  ON public.product_variants(product_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_sku 
  ON public.product_variants(sku);

CREATE INDEX IF NOT EXISTS idx_product_variants_option 
  ON public.product_variants(option_name, option_value);

-- RLS Policies
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Store owners can manage their product variants
CREATE POLICY "Store owners can manage their product variants" ON public.product_variants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id 
        AND p.store_id IN (
          SELECT store_id FROM public.users WHERE id = auth.uid()
        )
    )
  );

-- All authenticated users can view variants
CREATE POLICY "Authenticated users can view variants" ON public.product_variants
  FOR SELECT USING (auth.role() = 'authenticated');

COMMENT ON TABLE public.product_variants IS 'Product variations with independent pricing and inventory';
COMMENT ON COLUMN public.product_variants.option_name IS 'Variant attribute name (size, color, flavor, etc.)';
COMMENT ON COLUMN public.product_variants.option_value IS 'Specific value for the variant attribute';


-- ═══════════════════════════════════════════════════════
-- 3. UPDATE ORDER_ITEMS TABLE
-- Add new pricing breakdown columns
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS platform_markup_amount NUMERIC(10, 2) DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 4) DEFAULT 0.18,
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(variant_id) ON DELETE SET NULL;

-- Index for variant lookups in orders
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id 
  ON public.order_items(variant_id);

COMMENT ON COLUMN public.order_items.platform_markup_amount IS 'Fixed INR 1.00 platform markup per item';
COMMENT ON COLUMN public.order_items.commission_rate IS 'Category commission rate applied (3-20%)';
COMMENT ON COLUMN public.order_items.commission_amount IS 'Calculated commission amount for this item';
COMMENT ON COLUMN public.order_items.variant_id IS 'Reference to specific product variant if applicable';


-- ═══════════════════════════════════════════════════════
-- 4. UPDATE ORDERS TABLE
-- Add distance-based delivery fee and rider payout columns
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC(6, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_base_payout NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surge_multiplier NUMERIC(3, 2) DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS rider_final_payout NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_delivery_margin NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_delivery_fee NUMERIC(10, 2) DEFAULT 0;

-- Index for distance-based queries
CREATE INDEX IF NOT EXISTS idx_orders_distance_km 
  ON public.orders(distance_km);

COMMENT ON COLUMN public.orders.distance_km IS 'Delivery distance in kilometers (Haversine formula)';
COMMENT ON COLUMN public.orders.rider_base_payout IS 'Base payout before surge: ₹25/₹40/₹60 based on distance';
COMMENT ON COLUMN public.orders.surge_multiplier IS 'Surge pricing multiplier (default 1.00)';
COMMENT ON COLUMN public.orders.rider_final_payout IS 'Final rider payout: base_payout * surge_multiplier';
COMMENT ON COLUMN public.orders.platform_delivery_margin IS 'Platform profit margin: ₹10/₹15/₹20 based on distance';
COMMENT ON COLUMN public.orders.total_delivery_fee IS 'Customer delivery fee: rider_payout + platform_margin';


-- ═══════════════════════════════════════════════════════
-- 5. DEVICE TOKENS TABLE
-- Store FCM and Expo push notification tokens
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.device_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  token_type VARCHAR(20) NOT NULL CHECK (token_type IN ('fcm', 'expo')),
  device_type VARCHAR(20) NOT NULL CHECK (device_type IN ('ios', 'android', 'web')),
  app_type VARCHAR(20) NOT NULL CHECK (app_type IN ('store', 'rider', 'customer', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token, app_type)
);

-- Indexes for fast token lookups
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id 
  ON public.device_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_device_tokens_token 
  ON public.device_tokens(token);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_app 
  ON public.device_tokens(user_id, app_type);

-- RLS Policies
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can manage their own device tokens
CREATE POLICY "Users can manage their own device tokens" ON public.device_tokens
  FOR ALL USING (user_id = auth.uid());

COMMENT ON TABLE public.device_tokens IS 'Push notification device tokens for FCM and Expo';
COMMENT ON COLUMN public.device_tokens.token_type IS 'Token provider: fcm (Firebase) or expo (Expo Push)';
COMMENT ON COLUMN public.device_tokens.app_type IS 'Application type: store, rider, customer, or admin';


-- ═══════════════════════════════════════════════════════
-- 6. AI QUERY LOGS TABLE
-- Track AI shopping assistant usage
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_query_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  query_type VARCHAR(20) NOT NULL CHECK (query_type IN ('text', 'image', 'voice')),
  query_text TEXT,
  response_time_ms INTEGER NOT NULL,
  products_recommended BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_ai_query_logs_user_id 
  ON public.ai_query_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_query_logs_created_at 
  ON public.ai_query_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_query_logs_query_type 
  ON public.ai_query_logs(query_type);

-- RLS Policies
ALTER TABLE public.ai_query_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all AI logs
CREATE POLICY "Admins can view all AI logs" ON public.ai_query_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Users can view their own AI logs
CREATE POLICY "Users can view their own AI logs" ON public.ai_query_logs
  FOR SELECT USING (user_id = auth.uid());

COMMENT ON TABLE public.ai_query_logs IS 'Logging for AI shopping assistant queries (text, image, voice)';
COMMENT ON COLUMN public.ai_query_logs.query_type IS 'Input method: text, image, or voice';
COMMENT ON COLUMN public.ai_query_logs.response_time_ms IS 'AI service response time in milliseconds';


-- ═══════════════════════════════════════════════════════
-- 7. OTP LOGS TABLE
-- Track OTP send/verify operations for security auditing
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.otp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_last_4 VARCHAR(4) NOT NULL, -- Last 4 digits only for privacy
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('send', 'verify')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failure')),
  reason TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Index for security monitoring
CREATE INDEX IF NOT EXISTS idx_otp_logs_timestamp 
  ON public.otp_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_otp_logs_phone_status 
  ON public.otp_logs(phone_last_4, status);

-- RLS Policies
ALTER TABLE public.otp_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view OTP logs
CREATE POLICY "Only admins can view OTP logs" ON public.otp_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

COMMENT ON TABLE public.otp_logs IS 'Security audit log for OTP operations (phone numbers masked)';
COMMENT ON COLUMN public.otp_logs.phone_last_4 IS 'Last 4 digits of phone number for privacy compliance';


-- ═══════════════════════════════════════════════════════
-- 8. NOTIFICATION LOGS TABLE
-- Track push notification delivery status
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for monitoring and analytics
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id 
  ON public.notification_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_notification_logs_timestamp 
  ON public.notification_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_type 
  ON public.notification_logs(notification_type);

-- RLS Policies
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all notification logs
CREATE POLICY "Admins can view all notification logs" ON public.notification_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

COMMENT ON TABLE public.notification_logs IS 'Push notification delivery tracking and monitoring';
COMMENT ON COLUMN public.notification_logs.notification_type IS 'Type of notification: new_order, rider_assignment, order_status, etc.';


-- ═══════════════════════════════════════════════════════
-- 9. BACKFILL DEFAULT COMMISSION RATES
-- Set 18% default commission for existing categories
-- ═══════════════════════════════════════════════════════

INSERT INTO public.category_commissions (category_id, commission_rate)
SELECT id, 0.18
FROM public.categories
WHERE id NOT IN (SELECT category_id FROM public.category_commissions)
ON CONFLICT (category_id) DO NOTHING;


-- ═══════════════════════════════════════════════════════
-- 10. CREATE UPDATED_AT TRIGGERS
-- Automatically update updated_at timestamps
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to category_commissions
DROP TRIGGER IF EXISTS update_category_commissions_updated_at ON public.category_commissions;
CREATE TRIGGER update_category_commissions_updated_at
  BEFORE UPDATE ON public.category_commissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Apply trigger to product_variants
DROP TRIGGER IF EXISTS update_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Apply trigger to device_tokens
DROP TRIGGER IF EXISTS update_device_tokens_updated_at ON public.device_tokens;
CREATE TRIGGER update_device_tokens_updated_at
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ═══════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════

-- Verify table creation
SELECT 
  'category_commissions' as table_name, count(*) as row_count FROM public.category_commissions
UNION ALL
SELECT 'product_variants', count(*) FROM public.product_variants
UNION ALL
SELECT 'device_tokens', count(*) FROM public.device_tokens
UNION ALL
SELECT 'ai_query_logs', count(*) FROM public.ai_query_logs
UNION ALL
SELECT 'otp_logs', count(*) FROM public.otp_logs
UNION ALL
SELECT 'notification_logs', count(*) FROM public.notification_logs;
