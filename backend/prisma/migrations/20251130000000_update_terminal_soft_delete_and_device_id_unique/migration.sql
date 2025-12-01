-- AlterTable: Migrate status field to deleted_at for soft delete (status column preserved for deprecation period)
-- AlterTable: Add unique constraint on device_id for global uniqueness
--
-- IMPORTANT: This migration preserves the status column for backward compatibility.
-- The status column will be removed in a future migration after a deprecation period.
-- Application code should migrate to using deleted_at instead of status.

-- Step 1: Create backup table for status column (for rollback safety)
CREATE TABLE IF NOT EXISTS "pos_terminals_status_backup" (
  "pos_terminal_id" UUID NOT NULL PRIMARY KEY,
  "status" VARCHAR(50) NOT NULL,
  "backup_created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Backup existing status values
INSERT INTO "pos_terminals_status_backup" ("pos_terminal_id", "status")
SELECT "pos_terminal_id", "status"
FROM "pos_terminals"
ON CONFLICT ("pos_terminal_id") DO NOTHING;

-- Step 3: Set device_id to NULL for any duplicates to allow unique constraint
-- First, handle NULL device_ids by setting them to a unique value temporarily
-- Use UUID-based temporary values to avoid collisions with existing device_ids
UPDATE "pos_terminals" 
SET "device_id" = 'temp-migration-' || gen_random_uuid()::text
WHERE "device_id" IS NULL;

-- Step 4: Handle duplicate device_ids globally (across all stores)
-- Keep the first one (by created_at), nullify others
-- Use UUID-based temporary values to avoid collisions with existing device_ids
WITH ranked_terminals AS (
  SELECT 
    "pos_terminal_id",
    "device_id",
    ROW_NUMBER() OVER (PARTITION BY "device_id" ORDER BY "created_at") as rn
  FROM "pos_terminals"
  WHERE "device_id" IS NOT NULL
    AND "device_id" NOT LIKE 'temp-migration-%'
)
UPDATE "pos_terminals" pt
SET "device_id" = 'temp-migration-' || gen_random_uuid()::text
FROM ranked_terminals rt
WHERE pt."pos_terminal_id" = rt."pos_terminal_id" 
  AND rt.rn > 1;

-- Step 5: Set temp device_ids back to NULL (they'll be globally unique now)
-- Only update the migration-specific temporary values to avoid affecting any real device_ids
UPDATE "pos_terminals" 
SET "device_id" = NULL
WHERE "device_id" LIKE 'temp-migration-%';

-- Step 6: Add deleted_at column
ALTER TABLE "pos_terminals" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- Step 7: Migrate status values to deleted_at
-- INACTIVE or MAINTENANCE status -> set deleted_at to updated_at (or current timestamp if updated_at is null)
-- ACTIVE status -> deleted_at remains NULL
UPDATE "pos_terminals"
SET "deleted_at" = COALESCE("updated_at", CURRENT_TIMESTAMP)
WHERE "status" IN ('INACTIVE', 'MAINTENANCE');

-- Step 8: Add unique constraint on device_id for global uniqueness
-- This ensures device_id is unique across all stores (allows NULL, but if set, must be globally unique)
CREATE UNIQUE INDEX "pos_terminals_device_id_key" ON "pos_terminals"("device_id") 
WHERE "device_id" IS NOT NULL;

-- Step 9: Add index on deleted_at for soft delete queries
CREATE INDEX "pos_terminals_deleted_at_idx" ON "pos_terminals"("deleted_at");

-- NOTE: Status column is NOT dropped in this migration.
-- It will be removed in a future migration after application code has been updated
-- and a deprecation period has passed. The status index is kept for now to maintain
-- query performance during the transition period.

