-- ═══════════════════════════════════════════════════════
-- Zapkart Database Migration - 002_rider_locations.sql
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rider_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    lat NUMERIC NOT NULL,
    lng NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.rider_locations ENABLE ROW LEVEL SECURITY;

-- Create Policy for all operations (bypassable by service_role key used by backend)
CREATE POLICY admin_all_rider_locations ON public.rider_locations FOR ALL USING (TRUE);

-- Indexes for efficient fetching of latest rider coordinates
CREATE INDEX IF NOT EXISTS idx_rider_locations_order ON public.rider_locations (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_locations_rider ON public.rider_locations (rider_id, created_at DESC);
