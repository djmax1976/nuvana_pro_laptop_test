-- Enhance LotteryBin model with display order and active status
-- Story 6.13: Lottery Database Enhancements & Bin Management
-- Adds display_order and is_active fields, indexes, and constraints

-- Step 1: Add display_order field with default value
ALTER TABLE "lottery_bins" 
    ADD COLUMN IF NOT EXISTS "display_order" INTEGER NOT NULL DEFAULT 0;

-- Step 2: Add is_active field with default value
ALTER TABLE "lottery_bins" 
    ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Step 3: Add CHECK constraint for display_order >= 0
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'lottery_bins_display_order_non_negative_check'
    ) THEN
        ALTER TABLE "lottery_bins"
            ADD CONSTRAINT "lottery_bins_display_order_non_negative_check"
            CHECK (display_order >= 0);
    END IF;
END $$;

-- Step 4: Add composite indexes for optimized queries
CREATE INDEX IF NOT EXISTS "lottery_bins_store_id_is_active_idx" 
    ON "lottery_bins"("store_id", "is_active");
    
CREATE INDEX IF NOT EXISTS "lottery_bins_store_id_display_order_idx" 
    ON "lottery_bins"("store_id", "display_order");
    
CREATE INDEX IF NOT EXISTS "lottery_bins_store_id_name_idx" 
    ON "lottery_bins"("store_id", "name");

-- Note: UNIQUE constraint on (store_id, display_order) is handled at application level
-- to allow flexibility in bin management (e.g., temporary duplicates during reordering)
