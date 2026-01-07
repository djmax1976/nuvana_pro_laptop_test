-- Migration: Link lottery_business_days to day_summaries
--
-- Purpose: Add FK from lottery_business_days to day_summaries and remove the
-- unique constraint on (store_id, business_date) to allow multiple lottery days
-- per calendar date (essential for day close/new day workflow).
--
-- Business Rule: When a day is closed (e.g., at 12:03 PM), a NEW lottery_business_day
-- is created for the new business day. This means the same calendar date can have:
--   1. CLOSED lottery_business_day from the morning
--   2. OPEN lottery_business_day for the afternoon/evening
--
-- Problem Solved: Previously, lottery wizard would show "already closed" because it
-- looked up by calendar date. Now it should look up by status (OPEN/PENDING_CLOSE).
--
-- Enterprise Standards Applied:
-- - DB-001: ORM_USAGE - Schema change aligned with Prisma model
-- - DB-006: TENANT_ISOLATION - FK enforces data integrity; tenant scope via store_id
-- - DB-003: MIGRATIONS - Version controlled with rollback steps documented
-- - DB-005: BACKUP_SECURITY - Non-destructive; existing data preserved
--
-- Rollback Instructions:
-- 1. DROP INDEX IF EXISTS idx_lottery_business_days_day_summary_id;
-- 2. ALTER TABLE lottery_business_days DROP CONSTRAINT IF EXISTS fk_lottery_business_days_day_summary;
-- 3. ALTER TABLE lottery_business_days DROP COLUMN IF EXISTS day_summary_id;
-- 4. ALTER TABLE lottery_business_days ADD CONSTRAINT lottery_business_days_store_id_business_date_key UNIQUE (store_id, business_date);

-- =============================================================================
-- PHASE 1: Drop the unique constraint on (store_id, business_date)
-- =============================================================================
-- CRITICAL: This enables multiple lottery_business_days for same store+date
-- Essential for day close workflow where closed day + new open day coexist

-- First, check if the constraint/index exists and drop it
-- Prisma creates @@unique as a UNIQUE INDEX, not a constraint
-- Handle both cases for robustness
DO $$
BEGIN
    -- Try dropping as a constraint first (older Prisma versions or manual constraints)
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lottery_business_days_store_id_business_date_key'
        AND conrelid = 'lottery_business_days'::regclass
    ) THEN
        ALTER TABLE lottery_business_days
        DROP CONSTRAINT lottery_business_days_store_id_business_date_key;
        RAISE NOTICE 'Dropped unique constraint lottery_business_days_store_id_business_date_key';
    -- Try dropping as a unique index (current Prisma behavior)
    ELSIF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'lottery_business_days_store_id_business_date_key'
        AND tablename = 'lottery_business_days'
    ) THEN
        DROP INDEX lottery_business_days_store_id_business_date_key;
        RAISE NOTICE 'Dropped unique index lottery_business_days_store_id_business_date_key';
    ELSE
        RAISE NOTICE 'Neither constraint nor index lottery_business_days_store_id_business_date_key exists, skipping';
    END IF;
END $$;

-- =============================================================================
-- PHASE 2: Add non-unique index for backward-compatible lookups
-- =============================================================================
-- The old unique constraint served as an index. We add a regular index to
-- maintain query performance for lookups by store_id + business_date
-- This is a composite index that supports queries like:
--   WHERE store_id = X AND business_date = Y

CREATE INDEX IF NOT EXISTS idx_lottery_business_days_store_date
ON lottery_business_days(store_id, business_date);

-- =============================================================================
-- PHASE 3: Add day_summary_id column
-- =============================================================================
-- Adding as nullable to support:
-- 1. Existing records that need to be backfilled
-- 2. Edge cases during day transitions
-- 3. Orphan recovery scenarios

ALTER TABLE lottery_business_days
ADD COLUMN IF NOT EXISTS day_summary_id UUID;

-- =============================================================================
-- PHASE 4: Add foreign key constraint with ON DELETE SET NULL
-- =============================================================================
-- Using SET NULL on delete to prevent cascading deletes of lottery days if
-- day summary is removed. This is a defensive pattern - day summaries should
-- rarely be deleted, but if they are, we don't lose lottery data.

DO $$
BEGIN
    -- Add FK constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_lottery_business_days_day_summary'
        AND conrelid = 'lottery_business_days'::regclass
    ) THEN
        ALTER TABLE lottery_business_days
        ADD CONSTRAINT fk_lottery_business_days_day_summary
        FOREIGN KEY (day_summary_id)
        REFERENCES day_summaries(day_summary_id)
        ON DELETE SET NULL;
        RAISE NOTICE 'Added FK constraint fk_lottery_business_days_day_summary';
    ELSE
        RAISE NOTICE 'FK constraint fk_lottery_business_days_day_summary already exists, skipping';
    END IF;
END $$;

-- =============================================================================
-- PHASE 5: Add index on day_summary_id
-- =============================================================================
-- This index supports:
-- 1. Fast lookup of lottery days by day_summary_id
-- 2. Efficient joins between lottery_business_days and day_summaries
-- 3. Query optimization for coordinated day close operations

CREATE INDEX IF NOT EXISTS idx_lottery_business_days_day_summary_id
ON lottery_business_days(day_summary_id)
WHERE day_summary_id IS NOT NULL;

-- =============================================================================
-- PHASE 6: Add composite index for status-based lookups
-- =============================================================================
-- This index optimizes the NEW lookup pattern:
--   WHERE store_id = X AND status IN ('OPEN', 'PENDING_CLOSE')
-- This is the recommended way to find the "current" lottery day instead of
-- looking up by calendar date.

-- Note: The schema already has idx on (store_id, status) so we don't add it again
-- Just verifying it exists for the new query pattern

-- =============================================================================
-- MIGRATION VERIFICATION
-- =============================================================================
-- After migration, verify with:
--
-- 1. Check constraint was dropped:
--    SELECT conname FROM pg_constraint WHERE conrelid = 'lottery_business_days'::regclass;
--
-- 2. Check new column exists:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'lottery_business_days' AND column_name = 'day_summary_id';
--
-- 3. Check FK exists:
--    SELECT conname FROM pg_constraint
--    WHERE conname = 'fk_lottery_business_days_day_summary';
--
-- 4. Check index exists:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'lottery_business_days';

-- =============================================================================
-- BACKFILL REQUIRED
-- =============================================================================
-- After this migration runs, execute the backfill script:
-- npx ts-node backend/scripts/backfill-lottery-day-summary.ts
--
-- The backfill should:
-- 1. For each lottery_business_day, find matching day_summary by store_id + business_date
-- 2. Update lottery_business_day.day_summary_id with the match
-- 3. Log any orphans (lottery days without matching day summary)
--
-- See: backend/scripts/backfill-lottery-day-summary.ts
-- =============================================================================
