-- Migration: Add pos_merchandise_code to transaction_line_items
-- Description: Adds the pos_merchandise_code field to store the merchandise code
--              from POS systems (e.g., MerchandiseCode from PJR files)
-- This field was missing from the Phase 1.5 migration

-- =============================================================================
-- Add pos_merchandise_code column to transaction_line_items
-- =============================================================================

ALTER TABLE "transaction_line_items" ADD COLUMN IF NOT EXISTS "pos_merchandise_code" VARCHAR(50);

-- Index for merchandise code lookups
CREATE INDEX IF NOT EXISTS "transaction_line_items_pos_merchandise_code_idx"
    ON "transaction_line_items"("pos_merchandise_code");
