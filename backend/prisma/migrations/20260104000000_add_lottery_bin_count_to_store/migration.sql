-- Migration: Add lottery_bin_count to stores table
-- Purpose: Store the configured number of lottery bins for each store
-- Owner sets this value via client dashboard, system auto-syncs bin rows
--
-- Enterprise Standards:
-- - DB-001: ORM_USAGE - Field managed via Prisma ORM
-- - DB-006: TENANT_ISOLATION - Store-level setting, inherits existing RLS
-- - SEC-014: INPUT_VALIDATION - Range enforced at application level (0-200)

-- Add lottery_bin_count column to stores table
-- Nullable to allow gradual migration (null = not configured yet)
ALTER TABLE "stores" ADD COLUMN "lottery_bin_count" INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN "stores"."lottery_bin_count" IS 'Number of lottery bins configured for this store. Valid range: 0-200. Null means not configured.';
