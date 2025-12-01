-- ROLLBACK SCRIPT for migration 20251130000000_update_terminal_soft_delete_and_device_id_unique
-- 
-- WARNING: Only run this if you need to rollback the migration.
-- This script restores the status column from the backup table.
--
-- Prerequisites:
-- 1. The backup table pos_terminals_status_backup must exist
-- 2. The status column must still exist in pos_terminals (if it was dropped, recreate it first)

-- Prerequisite validation: Check if backup table exists and has data
DO $$
DECLARE
    backup_table_exists BOOLEAN;
    backup_row_count INTEGER;
BEGIN
    -- Check if backup table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'pos_terminals_status_backup'
    ) INTO backup_table_exists;
    
    IF NOT backup_table_exists THEN
        RAISE EXCEPTION 'Prerequisite validation failed: Table pos_terminals_status_backup does not exist. Cannot proceed with rollback.';
    END IF;
    
    -- Check if backup table has at least one row
    SELECT COUNT(*) INTO backup_row_count
    FROM "pos_terminals_status_backup";
    
    IF backup_row_count = 0 THEN
        RAISE EXCEPTION 'Prerequisite validation failed: Table pos_terminals_status_backup exists but contains no rows. Cannot proceed with rollback.';
    END IF;
END $$;

-- Begin transaction
BEGIN;

-- Perform rollback operations within transaction
DO $$
DECLARE
    backup_row_count INTEGER;
    update_count INTEGER;
BEGIN
    -- Get backup row count for validation
    SELECT COUNT(*) INTO backup_row_count
    FROM "pos_terminals_status_backup";
    
    -- Step 1: Restore status column if it was dropped (uncomment if needed)
    -- ALTER TABLE "pos_terminals" ADD COLUMN "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE';

    -- Step 2: Restore status values from backup
    UPDATE "pos_terminals" pt
    SET "status" = psb."status"
    FROM "pos_terminals_status_backup" psb
    WHERE pt."pos_terminal_id" = psb."pos_terminal_id";
    
    GET DIAGNOSTICS update_count = ROW_COUNT;
    
    IF update_count = 0 AND backup_row_count > 0 THEN
        RAISE WARNING 'No rows were updated during status restoration. This may indicate a mismatch between pos_terminals and pos_terminals_status_backup.';
    END IF;

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
    
EXCEPTION
    WHEN OTHERS THEN
        -- On any error, raise descriptive exception
        -- Note: In PostgreSQL, transaction control statements (ROLLBACK) cannot be executed
        -- inside a DO block. When an exception occurs, the outer transaction is automatically
        -- aborted. The transaction must be explicitly rolled back after this script fails.
        RAISE EXCEPTION 'Rollback failed with error: %. Error state: %. The transaction has been aborted and must be rolled back. Execute ROLLBACK to complete the rollback.', SQLERRM, SQLSTATE;
END $$;

-- Commit transaction if all operations succeeded
-- If an exception occurred above, the transaction is in an aborted state
-- and this COMMIT will fail with an error indicating the transaction must be rolled back
COMMIT;

[request_verification]
