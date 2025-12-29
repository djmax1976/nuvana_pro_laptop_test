-- Migration: Add Mark Sold Approval Tracking
-- Story: Pack Activation Pre-Sold Dual-Authentication Flow
--
-- Purpose: Track manager approval when cashiers need to mark a pack as pre-sold during activation.
-- This enables audit trail showing:
--   1. Who activated the pack (cashier)
--   2. Who approved marking the pack as pre-sold (manager)
--
-- This parallels the serial_override approval pattern for enterprise-grade dual-auth compliance.

-- Add mark sold approval columns to lottery_packs table
ALTER TABLE lottery_packs
ADD COLUMN IF NOT EXISTS mark_sold_approved_by UUID REFERENCES users(user_id),
ADD COLUMN IF NOT EXISTS mark_sold_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS mark_sold_reason VARCHAR(500);

-- Add index for approval lookups (partial index for non-null values)
CREATE INDEX IF NOT EXISTS idx_lottery_packs_mark_sold_approved_by
ON lottery_packs(mark_sold_approved_by)
WHERE mark_sold_approved_by IS NOT NULL;

-- Add comments explaining the columns for documentation
COMMENT ON COLUMN lottery_packs.mark_sold_approved_by IS 'Manager who approved marking the pack as pre-sold during activation. Required when activated_by user does not have LOTTERY_MARK_SOLD permission.';
COMMENT ON COLUMN lottery_packs.mark_sold_approved_at IS 'Timestamp when the mark-sold approval was granted by manager.';
COMMENT ON COLUMN lottery_packs.mark_sold_reason IS 'Optional reason for marking pack as pre-sold (e.g., "Pack sold before bin placement", "Tickets already distributed").';
