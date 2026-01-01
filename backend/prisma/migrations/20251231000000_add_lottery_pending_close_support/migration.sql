-- Add Two-Phase Commit Support for Atomic Day Close
-- Story: MyStore Day Close Atomic Transaction
--
-- This migration adds support for atomic day close where lottery close
-- and day close happen in a single transaction with the same timestamp.
--
-- Status Flow:
--   OPEN -> PENDING_CLOSE -> CLOSED
--                        \-> OPEN (if day close cancelled/times out)
--
-- The PENDING_CLOSE status holds lottery closings data temporarily
-- until the day close is confirmed in Step 3 of the wizard.

-- Add pending close columns to lottery_business_days
ALTER TABLE lottery_business_days
ADD COLUMN IF NOT EXISTS pending_close_data jsonb,
ADD COLUMN IF NOT EXISTS pending_close_by uuid,
ADD COLUMN IF NOT EXISTS pending_close_at timestamptz,
ADD COLUMN IF NOT EXISTS pending_close_expires_at timestamptz;

-- Add foreign key constraint for pending_close_by
ALTER TABLE lottery_business_days
DROP CONSTRAINT IF EXISTS lottery_business_days_pending_close_by_fkey;

ALTER TABLE lottery_business_days
ADD CONSTRAINT lottery_business_days_pending_close_by_fkey
FOREIGN KEY (pending_close_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- Create index for cleanup job to find expired pending states
CREATE INDEX IF NOT EXISTS idx_lottery_business_days_pending_cleanup
ON lottery_business_days (status, pending_close_expires_at)
WHERE status = 'PENDING_CLOSE';

-- Create index on pending_close_by for user lookups
CREATE INDEX IF NOT EXISTS idx_lottery_business_days_pending_close_by
ON lottery_business_days (pending_close_by)
WHERE pending_close_by IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN lottery_business_days.pending_close_data IS
'Two-phase commit: JSONB storing lottery closings while in PENDING_CLOSE status. Structure: { closings: [{pack_id, closing_serial}], entry_method, authorized_by_user_id? }';

COMMENT ON COLUMN lottery_business_days.pending_close_by IS
'Two-phase commit: User who initiated the pending close (scanned lottery in Step 1)';

COMMENT ON COLUMN lottery_business_days.pending_close_at IS
'Two-phase commit: Timestamp when pending close was initiated';

COMMENT ON COLUMN lottery_business_days.pending_close_expires_at IS
'Two-phase commit: Expiration time for pending state. Expired pending states are automatically reverted to OPEN by cleanup job. Default: 1 hour from pending_close_at';
