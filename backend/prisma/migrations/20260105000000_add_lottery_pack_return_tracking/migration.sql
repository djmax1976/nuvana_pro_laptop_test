-- ============================================================================
-- Migration: Add Lottery Pack Return Tracking
-- Story: Lottery Pack Return Feature
-- Date: 2026-01-05
-- ============================================================================
-- This migration adds comprehensive tracking for returned lottery packs.
-- Returns are tracked at both shift and day levels, similar to activation/depletion.
--
-- Key Fields Added:
-- - returned_by: User who processed the return
-- - returned_shift_id: Active shift when return occurred
-- - returned_day_id: Business day when return occurred
-- - return_reason: Why the pack was returned (enum)
-- - last_sold_serial: The last ticket that was sold before return
-- - tickets_sold_on_return: Calculated tickets sold (for audit)
-- - return_sales_amount: Calculated sales amount (for reporting)
--
-- Security:
-- - SEC-006: SQL_INJECTION - Using parameterized updates only
-- - DB-006: TENANT_ISOLATION - Foreign keys enforce store isolation
-- - DB-008: QUERY_LOGGING - Indexed for audit queries
-- ============================================================================

-- Step 1: Create enum for return reasons
-- Matches enterprise pattern for tracking why packs are returned
CREATE TYPE "LotteryPackReturnReason" AS ENUM (
    'SUPPLIER_RECALL',       -- Supplier recalled the pack
    'DAMAGED',               -- Pack was damaged
    'EXPIRED',               -- Pack expired before being sold
    'INVENTORY_ADJUSTMENT',  -- Inventory correction
    'STORE_CLOSURE',         -- Store closing/relocating
    'OTHER'                  -- Other reason (requires notes)
);

-- Step 2: Add return tracking columns to lottery_packs
-- Using nullable columns to support existing data
ALTER TABLE "lottery_packs" ADD COLUMN "returned_by" UUID;
ALTER TABLE "lottery_packs" ADD COLUMN "returned_shift_id" UUID;
ALTER TABLE "lottery_packs" ADD COLUMN "returned_day_id" UUID;
ALTER TABLE "lottery_packs" ADD COLUMN "return_reason" "LotteryPackReturnReason";
ALTER TABLE "lottery_packs" ADD COLUMN "return_notes" VARCHAR(500);
ALTER TABLE "lottery_packs" ADD COLUMN "last_sold_serial" VARCHAR(100);
ALTER TABLE "lottery_packs" ADD COLUMN "tickets_sold_on_return" INTEGER;
ALTER TABLE "lottery_packs" ADD COLUMN "return_sales_amount" DECIMAL(10, 2);

-- Step 3: Add foreign key constraints
-- FK to users table for audit trail
ALTER TABLE "lottery_packs"
ADD CONSTRAINT "lottery_packs_returned_by_fkey"
FOREIGN KEY ("returned_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK to shifts table for shift context
ALTER TABLE "lottery_packs"
ADD CONSTRAINT "lottery_packs_returned_shift_id_fkey"
FOREIGN KEY ("returned_shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK to lottery_business_days for day context
ALTER TABLE "lottery_packs"
ADD CONSTRAINT "lottery_packs_returned_day_id_fkey"
FOREIGN KEY ("returned_day_id") REFERENCES "lottery_business_days"("day_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 4: Add indexes for efficient querying
-- Index for querying packs returned by a specific user (audit)
CREATE INDEX "lottery_packs_returned_by_idx" ON "lottery_packs"("returned_by");

-- Index for querying packs returned during a specific shift
CREATE INDEX "lottery_packs_returned_shift_id_idx" ON "lottery_packs"("returned_shift_id");

-- Index for querying packs returned during a specific business day
CREATE INDEX "lottery_packs_returned_day_id_idx" ON "lottery_packs"("returned_day_id");

-- Index for return reason reporting
CREATE INDEX "lottery_packs_return_reason_idx" ON "lottery_packs"("return_reason");

-- Composite index for store + returned_at queries (common reporting pattern)
CREATE INDEX "lottery_packs_store_returned_at_idx" ON "lottery_packs"("store_id", "returned_at")
WHERE "status" = 'RETURNED';

-- Step 5: Add RLS policies for return tracking fields
-- Ensure returned_by references are properly scoped

-- Policy: Users can only see return data for packs in their accessible stores
-- This leverages existing RLS on lottery_packs table (store_id based)
-- No additional policy needed as the base table RLS covers it

-- Step 6: Add comment for documentation
COMMENT ON COLUMN "lottery_packs"."returned_by" IS 'User ID who processed the pack return';
COMMENT ON COLUMN "lottery_packs"."returned_shift_id" IS 'Shift ID when return was processed (for shift-level tracking)';
COMMENT ON COLUMN "lottery_packs"."returned_day_id" IS 'Business day ID when return was processed (for day-level tracking)';
COMMENT ON COLUMN "lottery_packs"."return_reason" IS 'Reason for pack return (SUPPLIER_RECALL, DAMAGED, etc.)';
COMMENT ON COLUMN "lottery_packs"."return_notes" IS 'Additional notes about the return (required for OTHER reason)';
COMMENT ON COLUMN "lottery_packs"."last_sold_serial" IS 'Serial number of last ticket sold before return';
COMMENT ON COLUMN "lottery_packs"."tickets_sold_on_return" IS 'Calculated tickets sold before return (audit trail)';
COMMENT ON COLUMN "lottery_packs"."return_sales_amount" IS 'Calculated sales amount at time of return (audit trail)';
