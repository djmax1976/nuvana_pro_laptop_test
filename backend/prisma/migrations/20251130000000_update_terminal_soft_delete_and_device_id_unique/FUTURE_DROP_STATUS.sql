-- FUTURE MIGRATION: Remove status column from pos_terminals
-- 
-- IMPORTANT: This migration should ONLY be run after:
-- 1. Application code has been updated to use deleted_at instead of status
-- 2. All consumers/API clients have been notified and migrated
-- 3. A deprecation period has passed (recommended: 2-4 weeks minimum)
-- 4. Monitoring confirms no queries are using the status column
--
-- To use this migration:
-- 1. Rename this file to: YYYYMMDDHHMMSS_remove_pos_terminals_status_column/migration.sql
-- 2. Update the timestamp in the filename to the current date/time
-- 3. Review and adjust the migration as needed
-- 4. Run: npx prisma migrate deploy (or npx prisma migrate dev)
--
-- ROLLBACK: If you need to rollback, use the ROLLBACK.sql file from the previous migration

-- Step 1: Verify backup table exists and has data
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_terminals_status_backup') THEN
    RAISE EXCEPTION 'Backup table pos_terminals_status_backup does not exist. Cannot safely remove status column.';
  END IF;
END $$;

-- Step 2: Final backup check - ensure we have status for all terminals
-- This is a safety check before dropping the column
INSERT INTO "pos_terminals_status_backup" ("pos_terminal_id", "status")
SELECT "pos_terminal_id", "status"
FROM "pos_terminals"
WHERE "pos_terminal_id" NOT IN (SELECT "pos_terminal_id" FROM "pos_terminals_status_backup")
ON CONFLICT ("pos_terminal_id") DO NOTHING;

-- Step 3: Drop status index
DROP INDEX IF EXISTS "pos_terminals_status_idx";

-- Step 4: Drop status column
ALTER TABLE "pos_terminals" DROP COLUMN IF EXISTS "status";

-- Step 5: Optional: Clean up backup table after verification period
-- Uncomment after confirming the migration is stable (recommended: 30+ days)
-- DROP TABLE IF EXISTS "pos_terminals_status_backup";

