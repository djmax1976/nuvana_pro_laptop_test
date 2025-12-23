-- Phase 2.4: Add Tax Rate Tracking to Transaction Line Items
-- This enables proper tax rate aggregation in ShiftTaxSummary

-- =============================================================================
-- ADD TAX RATE FIELDS TO TRANSACTION LINE ITEMS
-- =============================================================================
-- These fields track which tax rate was applied to each line item at transaction time.
-- All fields are optional for backward compatibility with existing data.

-- Add tax_rate_id foreign key (nullable for backward compatibility)
ALTER TABLE "transaction_line_items"
ADD COLUMN "tax_rate_id" UUID;

-- Add denormalized tax_rate_code for historical accuracy
-- This captures the code at transaction time, even if the tax rate is later modified
ALTER TABLE "transaction_line_items"
ADD COLUMN "tax_rate_code" VARCHAR(50);

-- Add denormalized tax_rate_value (the actual rate percentage at transaction time)
-- Stored as Decimal(6,5) to support rates like 0.08250 (8.25%)
ALTER TABLE "transaction_line_items"
ADD COLUMN "tax_rate_value" DECIMAL(6, 5);

-- =============================================================================
-- FOREIGN KEY CONSTRAINT
-- =============================================================================
-- Add FK to tax_rates table with ON DELETE SET NULL
-- This ensures line items remain valid even if a tax rate is deleted
ALTER TABLE "transaction_line_items"
ADD CONSTRAINT "transaction_line_items_tax_rate_id_fkey"
FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("tax_rate_id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- INDEXES FOR QUERY PERFORMANCE
-- =============================================================================
-- Index for FK lookups and joins
CREATE INDEX "transaction_line_items_tax_rate_id_idx"
ON "transaction_line_items"("tax_rate_id");

-- Index for filtering by tax rate code (useful for reports)
CREATE INDEX "transaction_line_items_tax_rate_code_idx"
ON "transaction_line_items"("tax_rate_code");

-- =============================================================================
-- RLS POLICIES
-- =============================================================================
-- The transaction_line_items table already has RLS policies through its parent
-- transaction relationship. No additional policies needed for tax_rate fields.

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================
COMMENT ON COLUMN "transaction_line_items"."tax_rate_id" IS
'FK to tax_rates table. The tax rate applied to this line item. NULL for historical data or tax-exempt items.';

COMMENT ON COLUMN "transaction_line_items"."tax_rate_code" IS
'Denormalized copy of tax_rate.code at transaction time. Preserved for historical accuracy even if tax rate is modified.';

COMMENT ON COLUMN "transaction_line_items"."tax_rate_value" IS
'Denormalized tax rate percentage at transaction time (e.g., 0.08250 for 8.25%). Used for aggregation when tax_rate_id is not set.';
