-- Migration: Add Transaction POS Fields (Phase 5.6)
-- Description: Adds POS-specific fields to transactions table for enhanced
--              transaction identification, flags, linked transactions, and file tracking

-- =============================================================================
-- 1. POS Transaction Identification Fields
-- =============================================================================

-- Original transaction ID from POS system (e.g., TransactionID from PJR file)
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "pos_transaction_id" VARCHAR(50);

-- Store location ID from POS (different from our internal store_id UUID)
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "pos_store_id" VARCHAR(50);

-- Business date from POS (may differ from transaction timestamp date)
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "business_date" DATE;

-- Register/terminal ID from POS (e.g., RegisterID)
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "pos_register_id" VARCHAR(20);

-- Till/drawer ID from POS (e.g., TillID)
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "pos_till_id" VARCHAR(20);

-- POS cashier code (denormalized from POS, may differ from cashier_id user)
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "pos_cashier_code" VARCHAR(20);

-- =============================================================================
-- 2. POS Transaction Flags
-- =============================================================================

-- Training mode flag - transactions for training purposes
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "is_training_mode" BOOLEAN NOT NULL DEFAULT false;

-- Outside sales flag - sale initiated at pump (not inside store)
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "is_outside_sale" BOOLEAN NOT NULL DEFAULT false;

-- Offline flag - transaction captured while POS was offline
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "is_offline" BOOLEAN NOT NULL DEFAULT false;

-- Suspended/voided transaction
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "is_suspended" BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- 3. Linked Transaction Fields
-- =============================================================================

-- For prepay transactions, links to the original prepay transaction
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "linked_transaction_id" VARCHAR(50);

-- Link reason (e.g., "fuelPrepay", "return", "void")
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "link_reason" VARCHAR(50);

-- =============================================================================
-- 4. POS File Tracking Fields
-- =============================================================================

-- Source file name for audit trail
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "source_file" VARCHAR(255);

-- File hash for deduplication
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "source_file_hash" VARCHAR(64);

-- =============================================================================
-- 5. Indexes for new fields
-- =============================================================================

-- Index for POS transaction ID lookups
CREATE INDEX IF NOT EXISTS "transactions_pos_transaction_id_idx" ON "transactions"("pos_transaction_id");

-- Index for business date queries
CREATE INDEX IF NOT EXISTS "transactions_business_date_idx" ON "transactions"("business_date");

-- Index for source file hash (deduplication)
CREATE INDEX IF NOT EXISTS "transactions_source_file_hash_idx" ON "transactions"("source_file_hash");

-- =============================================================================
-- 6. TransactionLineItem Additional Fields (Phase 5.6)
-- =============================================================================

-- Item type enum for categorizing line items
DO $$ BEGIN
    CREATE TYPE "TransactionItemType" AS ENUM ('MERCHANDISE', 'FUEL', 'LOTTERY', 'PREPAID', 'SERVICE', 'FEE', 'DISCOUNT', 'TAX', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add item_type column with default
ALTER TABLE "transaction_line_items" ADD COLUMN IF NOT EXISTS "item_type" "TransactionItemType" NOT NULL DEFAULT 'MERCHANDISE';

-- Fuel-specific fields for line items
ALTER TABLE "transaction_line_items" ADD COLUMN IF NOT EXISTS "fuel_grade_id" UUID;
ALTER TABLE "transaction_line_items" ADD COLUMN IF NOT EXISTS "pos_fuel_grade_id" VARCHAR(10);
ALTER TABLE "transaction_line_items" ADD COLUMN IF NOT EXISTS "fuel_position_id" UUID;
ALTER TABLE "transaction_line_items" ADD COLUMN IF NOT EXISTS "pos_fuel_position_id" VARCHAR(10);
ALTER TABLE "transaction_line_items" ADD COLUMN IF NOT EXISTS "fuel_service_level" VARCHAR(20);
ALTER TABLE "transaction_line_items" ADD COLUMN IF NOT EXISTS "fuel_price_tier" VARCHAR(20);
ALTER TABLE "transaction_line_items" ADD COLUMN IF NOT EXISTS "fuel_regular_price" DECIMAL(10,4);

-- Line status from POS (normal, cancel, void)
ALTER TABLE "transaction_line_items" ADD COLUMN IF NOT EXISTS "line_status" VARCHAR(20) NOT NULL DEFAULT 'normal';

-- Index for item type filtering
CREATE INDEX IF NOT EXISTS "transaction_line_items_item_type_idx" ON "transaction_line_items"("item_type");
