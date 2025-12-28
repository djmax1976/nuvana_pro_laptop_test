-- Migration: Add Serial Override Approval Tracking
-- Story: Pack Activation Dual-Authentication Flow
--
-- Purpose: Track manager approval when cashiers need to change starting serial
-- This enables audit trail showing both:
--   1. Who activated the pack (cashier)
--   2. Who approved the serial override (manager)

-- Add serial override approval columns to lottery_packs table
ALTER TABLE lottery_packs
ADD COLUMN IF NOT EXISTS serial_override_approved_by UUID REFERENCES users(user_id),
ADD COLUMN IF NOT EXISTS serial_override_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS serial_override_reason VARCHAR(500);

-- Add index for approval lookups
CREATE INDEX IF NOT EXISTS idx_lottery_packs_serial_override_approved_by
ON lottery_packs(serial_override_approved_by)
WHERE serial_override_approved_by IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN lottery_packs.serial_override_approved_by IS 'Manager who approved changing the starting serial from default (0). Required when activated_by user does not have LOTTERY_SERIAL_OVERRIDE permission.';
COMMENT ON COLUMN lottery_packs.serial_override_approved_at IS 'Timestamp when the serial override was approved by manager.';
COMMENT ON COLUMN lottery_packs.serial_override_reason IS 'Optional reason for the serial override (e.g., "Pack already partially sold").';
