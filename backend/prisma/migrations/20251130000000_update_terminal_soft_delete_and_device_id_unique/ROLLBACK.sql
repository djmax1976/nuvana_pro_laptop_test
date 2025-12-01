-- ROLLBACK SCRIPT for migration 20251130000000_update_terminal_soft_delete_and_device_id_unique
-- 
-- WARNING: Only run this if you need to rollback the migration.
-- This script restores the status column from the backup table.
--
-- Prerequisites:
-- 1. The backup table pos_terminals_status_backup must exist
-- 2. The status column must still exist in pos_terminals (if it was dropped, recreate it first)

-- Step 1: Restore status column if it was dropped (uncomment if needed)
-- ALTER TABLE "pos_terminals" ADD COLUMN "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE';

-- Step 2: Restore status values from backup
UPDATE "pos_terminals" pt
SET "status" = psb."status"
FROM "pos_terminals_status_backup" psb
WHERE pt."pos_terminal_id" = psb."pos_terminal_id";

-- Step 3: Set status to ACTIVE for any terminals that don't have a backup entry
-- (This handles any new terminals created after the migration)
UPDATE "pos_terminals"
SET "status" = CASE 
  WHEN "deleted_at" IS NULL THEN 'ACTIVE'
  ELSE 'INACTIVE'
END
WHERE "pos_terminal_id" NOT IN (SELECT "pos_terminal_id" FROM "pos_terminals_status_backup");

-- Step 4: Recreate status index
CREATE INDEX IF NOT EXISTS "pos_terminals_status_idx" ON "pos_terminals"("status");

-- Step 5: Remove deleted_at column (optional - you may want to keep it)
-- ALTER TABLE "pos_terminals" DROP COLUMN IF EXISTS "deleted_at";

-- Step 6: Remove unique constraint on device_id
DROP INDEX IF EXISTS "pos_terminals_device_id_key";

-- Step 7: Remove deleted_at index
DROP INDEX IF EXISTS "pos_terminals_deleted_at_idx";

-- Step 8: Clean up backup table (optional - keep for safety)
-- DROP TABLE IF EXISTS "pos_terminals_status_backup";

