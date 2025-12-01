-- FUTURE MIGRATION: Remove status column from pos_terminals
-- 
-- IMPORTANT: This migration should ONLY be run after:
-- 1. Application code has been updated to use deleted_at instead of status
-- 2. All consumers/API clients have been notified and migrated
-- 3. A deprecation period has passed (recommended: 2-4 weeks minimum)
-- 4. Monitoring confirms no queries are using the status column
--
-- To use this migration:
-- 1. Create a new Prisma migration using: npx prisma migrate dev --create-only --name remove_pos_terminals_status_column
--    (This will create a properly timestamped migration directory in the migrations folder)
-- 2. Copy the SQL content from this file into the generated migration.sql file
-- 3. Review and adjust the migration as needed
-- 4. Apply the migration using: npx prisma migrate dev
--    (Or use npx prisma migrate deploy in production environments)
--
-- NOTE: Do NOT manually rename this file or create migration directories manually.
-- Prisma manages migration timestamps and tracking automatically. Manual file operations
-- will break Prisma's migration history tracking.
--
-- ROLLBACK: If you need to rollback, use the ROLLBACK.sql file from the previous migration

-- Step 1: Verify backup table exists and has required columns
DO $$
DECLARE
  table_exists BOOLEAN;
  has_pos_terminal_id BOOLEAN;
  has_status BOOLEAN;
  pos_terminal_id_type TEXT;
  status_type TEXT;
BEGIN
  -- Check if backup table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'pos_terminals_status_backup'
  ) INTO table_exists;
  
  IF NOT table_exists THEN
    RAISE EXCEPTION 'Backup table pos_terminals_status_backup does not exist. Cannot safely remove status column.';
  END IF;
  
  -- Check if pos_terminal_id column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'pos_terminals_status_backup' 
      AND column_name = 'pos_terminal_id'
  ) INTO has_pos_terminal_id;
  
  IF NOT has_pos_terminal_id THEN
    RAISE EXCEPTION 'Backup table pos_terminals_status_backup is missing required column: pos_terminal_id. Cannot safely remove status column.';
  END IF;
  
  -- Check if status column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'pos_terminals_status_backup' 
      AND column_name = 'status'
  ) INTO has_status;
  
  IF NOT has_status THEN
    RAISE EXCEPTION 'Backup table pos_terminals_status_backup is missing required column: status. Cannot safely remove status column.';
  END IF;
  
  -- Optionally validate data types
  SELECT data_type INTO pos_terminal_id_type
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'pos_terminals_status_backup' 
    AND column_name = 'pos_terminal_id';
  
  SELECT data_type INTO status_type
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'pos_terminals_status_backup' 
    AND column_name = 'status';
  
  -- Validate pos_terminal_id is integer type (uuid, integer, bigint are common)
  IF pos_terminal_id_type NOT IN ('uuid', 'integer', 'bigint', 'character varying') THEN
    RAISE EXCEPTION 'Backup table pos_terminals_status_backup has unexpected data type (%) for pos_terminal_id column. Expected: uuid, integer, bigint, or character varying. Cannot safely remove status column.', pos_terminal_id_type;
  END IF;
  
  -- Validate status is text/varchar type
  IF status_type NOT IN ('character varying', 'varchar', 'text', 'character') THEN
    RAISE EXCEPTION 'Backup table pos_terminals_status_backup has unexpected data type (%) for status column. Expected: character varying, varchar, text, or character. Cannot safely remove status column.', status_type;
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

