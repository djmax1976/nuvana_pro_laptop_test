-- Migration: Normalize Cashier Soft-Delete Semantics
--
-- PURPOSE:
-- This migration normalizes the soft-delete semantics for the cashiers table to ensure
-- consistency between is_active and disabled_at fields.
--
-- SEMANTICS (after migration):
-- - disabled_at IS NULL = cashier is active (authoritative field for filtering)
-- - disabled_at IS NOT NULL = cashier is soft-deleted
-- - is_active is a denormalized boolean: true when disabled_at IS NULL, false when disabled_at IS NOT NULL
--
-- NORMALIZATION RULES:
-- 1. If is_active=true AND disabled_at IS NULL → No change (already correct)
-- 2. If is_active=true AND disabled_at IS NOT NULL → Set disabled_at=NULL (fix inconsistency)
-- 3. If is_active=false AND disabled_at IS NULL → Set disabled_at=updated_at (fix inconsistency)
-- 4. If is_active=false AND disabled_at IS NOT NULL → No change (already correct)
--
-- After this migration, all application code should:
-- - Filter by disabled_at IS NULL (not is_active) for consistency
-- - Set both fields atomically when toggling soft-delete state

-- Step 1: Add index on disabled_at if it doesn't exist (for query performance)
CREATE INDEX IF NOT EXISTS "cashiers_disabled_at_idx" ON "cashiers"("disabled_at");

-- Step 2: Normalize rows where is_active=true but disabled_at IS NOT NULL
-- These should have disabled_at=NULL
UPDATE "cashiers"
SET "disabled_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "is_active" = true
  AND "disabled_at" IS NOT NULL;

-- Step 3: Normalize rows where is_active=false but disabled_at IS NULL
-- These should have disabled_at set to updated_at (or created_at if updated_at is null)
UPDATE "cashiers"
SET "disabled_at" = COALESCE("updated_at", "created_at", CURRENT_TIMESTAMP),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "is_active" = false
  AND "disabled_at" IS NULL;

-- Step 4: Verify consistency (this will fail if there are still inconsistencies)
-- Note: This is a validation query that will not modify data
-- If this query returns any rows, there's a data integrity issue
DO $$
DECLARE
  inconsistent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO inconsistent_count
  FROM "cashiers"
  WHERE ("is_active" = true AND "disabled_at" IS NOT NULL)
     OR ("is_active" = false AND "disabled_at" IS NULL);
  
  IF inconsistent_count > 0 THEN
    RAISE EXCEPTION 'Data normalization failed: % rows still have inconsistent is_active/disabled_at values', inconsistent_count;
  END IF;
END $$;

