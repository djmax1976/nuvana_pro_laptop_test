-- Add cashier_id to lottery_shift_closings for direct cashier querying
-- This migration adds a nullable column, backfills from shifts table, then adds FK and index

-- Step 1: Add nullable column
ALTER TABLE "lottery_shift_closings" ADD COLUMN "cashier_id" UUID;

-- Step 2: Backfill from shifts table
-- All existing records get their cashier_id from the associated shift
UPDATE "lottery_shift_closings" lsc
SET "cashier_id" = s."cashier_id"
FROM "shifts" s
WHERE lsc."shift_id" = s."shift_id";

-- Step 3: Add foreign key constraint (nullable to allow SetNull on delete)
ALTER TABLE "lottery_shift_closings"
ADD CONSTRAINT "lottery_shift_closings_cashier_id_fkey"
FOREIGN KEY ("cashier_id") REFERENCES "cashiers"("cashier_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 4: Add index for efficient cashier-based queries
CREATE INDEX "lottery_shift_closings_cashier_id_idx" ON "lottery_shift_closings"("cashier_id");
