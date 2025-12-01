-- AlterTable: Remove status field and add deleted_at for soft delete
-- AlterTable: Add unique constraint on device_id for global uniqueness

-- Step 1: Remove status index
DROP INDEX IF EXISTS "pos_terminals_status_idx";

-- Step 2: Set device_id to NULL for any duplicates to allow unique constraint
-- First, handle NULL device_ids by setting them to a unique value temporarily
UPDATE "pos_terminals" 
SET "device_id" = CONCAT('temp-', "pos_terminal_id"::text)
WHERE "device_id" IS NULL;

-- Step 3: Handle duplicate device_ids globally (across all stores)
-- Keep the first one (by created_at), nullify others
WITH ranked_terminals AS (
  SELECT 
    "pos_terminal_id",
    "device_id",
    ROW_NUMBER() OVER (PARTITION BY "device_id" ORDER BY "created_at") as rn
  FROM "pos_terminals"
  WHERE "device_id" IS NOT NULL
)
UPDATE "pos_terminals" pt
SET "device_id" = CONCAT('temp-', pt."pos_terminal_id"::text)
FROM ranked_terminals rt
WHERE pt."pos_terminal_id" = rt."pos_terminal_id" 
  AND rt.rn > 1;

-- Step 4: Set temp device_ids back to NULL (they'll be globally unique now)
UPDATE "pos_terminals" 
SET "device_id" = NULL
WHERE "device_id" LIKE 'temp-%';

-- Step 5: Add deleted_at column
ALTER TABLE "pos_terminals" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- Step 6: Remove status column
ALTER TABLE "pos_terminals" DROP COLUMN "status";

-- Step 7: Add unique constraint on device_id for global uniqueness
-- This ensures device_id is unique across all stores (allows NULL, but if set, must be globally unique)
CREATE UNIQUE INDEX "pos_terminals_device_id_key" ON "pos_terminals"("device_id") 
WHERE "device_id" IS NOT NULL;

-- Step 8: Add index on deleted_at for soft delete queries
CREATE INDEX "pos_terminals_deleted_at_idx" ON "pos_terminals"("deleted_at");

