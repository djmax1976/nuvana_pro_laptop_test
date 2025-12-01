-- AlterTable: Remove status field and add deleted_at for soft delete
-- AlterTable: Add unique constraint on device_id (globally unique)
-- AlterTable: Add unique constraint on (store_id, device_id) for per-store uniqueness

-- Step 1: Remove status index
DROP INDEX IF EXISTS "pos_terminals_status_idx";

-- Step 2: Set device_id to NULL for any duplicates to allow unique constraint
-- First, handle NULL device_ids by setting them to a unique value temporarily
UPDATE "pos_terminals" 
SET "device_id" = CONCAT('temp-', "pos_terminal_id"::text)
WHERE "device_id" IS NULL;

-- Step 3: Handle duplicate device_ids within the same store
-- Keep the first one, nullify others
WITH ranked_terminals AS (
  SELECT 
    "pos_terminal_id",
    "device_id",
    ROW_NUMBER() OVER (PARTITION BY "store_id", "device_id" ORDER BY "created_at") as rn
  FROM "pos_terminals"
  WHERE "device_id" IS NOT NULL
)
UPDATE "pos_terminals" pt
SET "device_id" = CONCAT('temp-', pt."pos_terminal_id"::text)
FROM ranked_terminals rt
WHERE pt."pos_terminal_id" = rt."pos_terminal_id" 
  AND rt.rn > 1;

-- Step 4: Handle duplicate device_ids globally (across different stores)
-- Keep the first one globally, nullify others
WITH ranked_terminals AS (
  SELECT 
    "pos_terminal_id",
    "device_id",
    ROW_NUMBER() OVER (PARTITION BY "device_id" ORDER BY "created_at") as rn
  FROM "pos_terminals"
  WHERE "device_id" IS NOT NULL 
    AND "device_id" NOT LIKE 'temp-%'
)
UPDATE "pos_terminals" pt
SET "device_id" = CONCAT('temp-', pt."pos_terminal_id"::text)
FROM ranked_terminals rt
WHERE pt."pos_terminal_id" = rt."pos_terminal_id" 
  AND rt.rn > 1;

-- Step 5: Set temp device_ids back to NULL (they'll be unique now)
UPDATE "pos_terminals" 
SET "device_id" = NULL
WHERE "device_id" LIKE 'temp-%';

-- Step 6: Add deleted_at column
ALTER TABLE "pos_terminals" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- Step 7: Remove status column
ALTER TABLE "pos_terminals" DROP COLUMN "status";

-- Step 8: Add unique constraint on device_id (globally unique, but allows NULL)
-- Note: PostgreSQL allows multiple NULLs in a unique constraint
CREATE UNIQUE INDEX "pos_terminals_device_id_key" ON "pos_terminals"("device_id") 
WHERE "device_id" IS NOT NULL;

-- Step 9: Add unique constraint on (store_id, device_id) for per-store uniqueness
-- This ensures device_id is unique per store (allows NULL)
CREATE UNIQUE INDEX "pos_terminals_store_id_device_id_key" ON "pos_terminals"("store_id", "device_id") 
WHERE "device_id" IS NOT NULL;

-- Step 10: Add index on deleted_at for soft delete queries
CREATE INDEX "pos_terminals_deleted_at_idx" ON "pos_terminals"("deleted_at");

