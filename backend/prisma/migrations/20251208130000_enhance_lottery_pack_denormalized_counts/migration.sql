-- Enhance LotteryPack model with denormalized ticket counts
-- Story 6.13: Lottery Database Enhancements & Bin Management
-- Adds tickets_sold_count and last_sold_at fields, indexes for optimized bin display queries

-- Step 1: Add tickets_sold_count field with default value
ALTER TABLE "lottery_packs" 
    ADD COLUMN IF NOT EXISTS "tickets_sold_count" INTEGER NOT NULL DEFAULT 0;

-- Step 2: Add last_sold_at field (nullable, for cache invalidation tracking)
ALTER TABLE "lottery_packs" 
    ADD COLUMN IF NOT EXISTS "last_sold_at" TIMESTAMPTZ(6);

-- Step 3: Add composite index for optimized bin display queries
CREATE INDEX IF NOT EXISTS "lottery_packs_current_bin_id_status_idx" 
    ON "lottery_packs"("current_bin_id", "status");

-- Step 4: Create partial index for active packs only (optimized for bin display)
-- This index only includes ACTIVE packs, making queries faster when filtering by status
CREATE INDEX IF NOT EXISTS "lottery_packs_current_bin_id_status_active_idx" 
    ON "lottery_packs"("current_bin_id", "status") 
    WHERE "status" = 'ACTIVE';

-- Note: tickets_sold_count will be maintained via triggers or application logic
-- last_sold_at will be updated when tickets are sold to track cache invalidation
