-- ============================================================================
-- Fix NAXML Scheduled Export Column Names
-- ============================================================================
-- This migration corrects column name mismatches between the initial migration
-- and the Prisma schema for the naxml_scheduled_export table.
-- ============================================================================

-- ============================================================================
-- RENAME COLUMNS TO MATCH PRISMA SCHEMA
-- ============================================================================

-- Rename status columns
ALTER TABLE "naxml_scheduled_export"
  RENAME COLUMN "last_status" TO "last_run_status";

ALTER TABLE "naxml_scheduled_export"
  RENAME COLUMN "last_error" TO "last_run_error";

-- Rename statistics columns
ALTER TABLE "naxml_scheduled_export"
  RENAME COLUMN "run_count" TO "total_runs";

ALTER TABLE "naxml_scheduled_export"
  RENAME COLUMN "success_count" TO "successful_runs";

ALTER TABLE "naxml_scheduled_export"
  RENAME COLUMN "failure_count" TO "failed_runs";

-- ============================================================================
-- ADD MISSING COLUMNS
-- ============================================================================

-- Add last execution details
ALTER TABLE "naxml_scheduled_export"
  ADD COLUMN IF NOT EXISTS "last_record_count" INTEGER;

ALTER TABLE "naxml_scheduled_export"
  ADD COLUMN IF NOT EXISTS "last_file_size" BIGINT;

-- Add notification settings
ALTER TABLE "naxml_scheduled_export"
  ADD COLUMN IF NOT EXISTS "notify_on_failure" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "naxml_scheduled_export"
  ADD COLUMN IF NOT EXISTS "notify_on_success" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "naxml_scheduled_export"
  ADD COLUMN IF NOT EXISTS "notify_emails" JSONB DEFAULT '[]'::jsonb;

-- ============================================================================
-- DROP FOREIGN KEY CONSTRAINT ON created_by (to match Prisma schema)
-- ============================================================================
-- The Prisma schema doesn't define a relation for created_by, just a UUID field

DO $$ BEGIN
  ALTER TABLE "naxml_scheduled_export"
    DROP CONSTRAINT IF EXISTS "naxml_scheduled_export_created_by_fkey";
EXCEPTION
  WHEN undefined_object THEN null;
END $$;
