-- Migration: Add pos_type column to pos_terminals
-- Purpose: Add POSSystemType column to align with Prisma schema
-- This column is now the standard field; vendor_type is deprecated
--
-- Enterprise Standards Applied:
-- - DB-001: ORM_USAGE - Uses standard DDL within migration context
-- - The column uses the POSSystemType enum which already exists

-- Add pos_type column with default MANUAL_ENTRY
-- This matches the Prisma schema default
ALTER TABLE "pos_terminals" ADD COLUMN IF NOT EXISTS "pos_type" "POSSystemType" NOT NULL DEFAULT 'MANUAL_ENTRY';

-- Add index for pos_type filtering (matches Prisma schema @@index([pos_type]))
CREATE INDEX IF NOT EXISTS "pos_terminals_pos_type_idx" ON "pos_terminals"("pos_type");
