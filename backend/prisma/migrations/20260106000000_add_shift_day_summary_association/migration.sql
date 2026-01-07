-- Migration: Add day_summary_id FK to shifts table
--
-- Purpose: Associate shifts with their correct business day (DaySummary)
--
-- Business Rule: A shift belongs to the business day that was ACTIVE (OPEN status)
-- when the shift was opened, regardless of when the shift is closed.
-- This correctly handles overnight operations where a business day started on
-- one calendar date may include shifts that were opened/closed on the next calendar date.
--
-- Example: If a business day starts on Jan 5th and remains open until Jan 6th at 8 AM,
-- any shift opened at 2 AM on Jan 6th belongs to the Jan 5th business day.
--
-- Enterprise Standards Applied:
-- - DB-001: ORM_USAGE - Schema change aligned with Prisma model
-- - DB-006: TENANT_ISOLATION - FK enforces data integrity within tenant scope
-- - DB-003: MIGRATIONS - Version controlled with clear rollback path

-- =============================================================================
-- STEP 1: Add nullable day_summary_id column to shifts table
-- =============================================================================
-- Adding as nullable first to allow existing data to be backfilled
-- Column will remain nullable to handle edge cases where day hasn't been created yet

ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS day_summary_id UUID;

-- =============================================================================
-- STEP 2: Add foreign key constraint with ON DELETE SET NULL
-- =============================================================================
-- Using SET NULL on delete to prevent cascading deletes of shifts if day summary is removed
-- This is a defensive pattern - day summaries should rarely be deleted

ALTER TABLE shifts
ADD CONSTRAINT fk_shifts_day_summary
FOREIGN KEY (day_summary_id)
REFERENCES day_summaries(day_summary_id)
ON DELETE SET NULL;

-- =============================================================================
-- STEP 3: Add index for efficient lookups
-- =============================================================================
-- This index supports:
-- 1. Fast lookup of shifts by day_summary_id
-- 2. Efficient grouping of shifts by business day
-- 3. Query optimization for day close reconciliation

CREATE INDEX IF NOT EXISTS idx_shifts_day_summary_id
ON shifts(day_summary_id)
WHERE day_summary_id IS NOT NULL;

-- =============================================================================
-- STEP 4: Composite index for store + day queries
-- =============================================================================
-- Optimizes the common query pattern: "Get all shifts for a store's business day"
-- This supports tenant isolation (store_id) with day summary filtering

CREATE INDEX IF NOT EXISTS idx_shifts_store_day_summary
ON shifts(store_id, day_summary_id)
WHERE day_summary_id IS NOT NULL;

-- =============================================================================
-- STEP 5: Update RLS policy to include day_summary_id access
-- =============================================================================
-- The existing RLS policies on shifts already enforce tenant isolation via store_id
-- No additional RLS changes needed since day_summary_id is an internal reference

-- =============================================================================
-- MIGRATION NOTES:
-- =============================================================================
-- After this migration runs, a backfill script must be executed to:
-- 1. Find the correct day_summary for each existing shift
-- 2. Update shifts with their proper day_summary_id
--
-- The backfill logic should:
-- - For each shift, find the DaySummary where:
--   a) store_id matches
--   b) business_date is the logical business date when the shift was opened
--   c) OR the shift was opened while that day was still OPEN
--
-- See: backend/scripts/backfill-shift-day-summary.ts
-- =============================================================================
