-- Add stripe_session_id column to pagos table for webhook idempotency
-- Run this in Supabase SQL Editor or via: supabase db push

ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS metodo_stripe TEXT;

-- Index for fast duplicate-check in webhook
CREATE INDEX IF NOT EXISTS idx_pagos_stripe_session_id
  ON pagos(gym_id, stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Comment
COMMENT ON COLUMN pagos.stripe_session_id IS 'Stripe Checkout Session ID or Invoice ID — used for webhook idempotency';
