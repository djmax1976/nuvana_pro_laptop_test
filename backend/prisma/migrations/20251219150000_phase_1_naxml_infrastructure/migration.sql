-- ============================================================================
-- Phase 1: NAXML Core Infrastructure Migration
-- ============================================================================
-- This migration adds tables for NAXML file processing and file watcher
-- configuration to support NAXML-based POS integrations.
--
-- Related to: C-Store POS Adapter Implementation Plan - Phase 1
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- NAXML File Status enum
CREATE TYPE "NAXMLFileStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCESS',
  'PARTIAL',
  'FAILED',
  'SKIPPED'
);

-- NAXML File Direction enum
CREATE TYPE "NAXMLFileDirection" AS ENUM (
  'IMPORT',
  'EXPORT'
);

-- NAXML Document Type enum
CREATE TYPE "NAXMLDocumentType" AS ENUM (
  'PriceBookMaintenance',
  'TransactionDocument',
  'InventoryMovement',
  'EmployeeMaintenance',
  'TenderMaintenance',
  'DepartmentMaintenance',
  'TaxRateMaintenance',
  'Acknowledgment'
);

-- ============================================================================
-- NAXML FILE LOG TABLE
-- ============================================================================
-- Tracks all NAXML files processed by the system for auditing and
-- duplicate detection.
-- ============================================================================

CREATE TABLE "naxml_file_log" (
  -- Primary identification
  "file_log_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  "store_id" UUID NOT NULL REFERENCES "stores"("store_id") ON DELETE CASCADE,
  "pos_integration_id" UUID NOT NULL REFERENCES "pos_integrations"("pos_integration_id") ON DELETE CASCADE,

  -- File information
  "file_name" VARCHAR(255) NOT NULL,
  "file_type" "NAXMLDocumentType" NOT NULL,
  "direction" "NAXMLFileDirection" NOT NULL,
  "status" "NAXMLFileStatus" NOT NULL DEFAULT 'PENDING',

  -- Processing metrics
  "record_count" INTEGER,
  "file_size_bytes" BIGINT NOT NULL,
  "processing_time_ms" INTEGER,

  -- Error tracking
  "error_code" VARCHAR(50),
  "error_message" TEXT,

  -- Duplicate detection
  "file_hash" VARCHAR(64) NOT NULL, -- SHA-256 hash

  -- File paths
  "source_path" VARCHAR(500),
  "processed_path" VARCHAR(500),

  -- Timestamps
  "processed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metadata for extensibility
  "metadata" JSONB DEFAULT '{}'::jsonb
);

-- Performance indexes
CREATE INDEX "idx_naxml_file_log_store" ON "naxml_file_log"("store_id", "created_at" DESC);
CREATE INDEX "idx_naxml_file_log_pos_integration" ON "naxml_file_log"("pos_integration_id", "created_at" DESC);
CREATE INDEX "idx_naxml_file_log_status" ON "naxml_file_log"("status") WHERE "status" != 'SUCCESS';
CREATE INDEX "idx_naxml_file_log_hash" ON "naxml_file_log"("file_hash");
CREATE INDEX "idx_naxml_file_log_type" ON "naxml_file_log"("file_type", "created_at" DESC);

-- Composite index for duplicate detection per store
CREATE UNIQUE INDEX "idx_naxml_file_log_unique_hash" ON "naxml_file_log"("store_id", "file_hash");

-- Comment for documentation
COMMENT ON TABLE "naxml_file_log" IS
  'Tracks all NAXML files processed by the system. Used for auditing,
   duplicate detection, and processing history. Each file is uniquely
   identified by its SHA-256 hash within a store.';

-- ============================================================================
-- POS FILE WATCHER CONFIG TABLE
-- ============================================================================
-- Stores configuration for file watchers that monitor directories for
-- new NAXML files.
-- ============================================================================

CREATE TABLE "pos_file_watcher_config" (
  -- Primary identification
  "config_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  "store_id" UUID NOT NULL REFERENCES "stores"("store_id") ON DELETE CASCADE,
  "pos_integration_id" UUID NOT NULL REFERENCES "pos_integrations"("pos_integration_id") ON DELETE CASCADE,

  -- Path configuration
  "watch_path" VARCHAR(500) NOT NULL,
  "processed_path" VARCHAR(500),
  "error_path" VARCHAR(500),

  -- File patterns (stored as JSON array of glob patterns)
  "file_patterns" JSONB NOT NULL DEFAULT '["*.xml", "TLog*.xml", "Dept*.xml"]'::jsonb,

  -- Polling configuration
  "poll_interval_seconds" INTEGER NOT NULL DEFAULT 60,

  -- Status
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_poll_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "last_error_at" TIMESTAMPTZ,

  -- Statistics
  "files_processed" INTEGER NOT NULL DEFAULT 0,
  "files_errored" INTEGER NOT NULL DEFAULT 0,
  "last_file_processed_at" TIMESTAMPTZ,

  -- Timestamps
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one watcher per store
  CONSTRAINT "uq_file_watcher_store" UNIQUE ("store_id")
);

-- Performance indexes
CREATE INDEX "idx_file_watcher_active" ON "pos_file_watcher_config"("is_active") WHERE "is_active" = true;
CREATE INDEX "idx_file_watcher_pos_integration" ON "pos_file_watcher_config"("pos_integration_id");

-- Comment for documentation
COMMENT ON TABLE "pos_file_watcher_config" IS
  'Configuration for POS file watchers that monitor directories for new
   NAXML files. Each store can have one active file watcher configuration.';

-- ============================================================================
-- ADD NAXML-SPECIFIC FIELDS TO POS_INTEGRATION
-- ============================================================================
-- Extend the existing pos_integrations table with NAXML-specific fields
-- ============================================================================

-- Add NAXML version field
ALTER TABLE "pos_integrations"
ADD COLUMN IF NOT EXISTS "naxml_version" VARCHAR(10) DEFAULT '3.4';

-- Add XML gateway path for file-based exchanges
ALTER TABLE "pos_integrations"
ADD COLUMN IF NOT EXISTS "xml_gateway_path" VARCHAR(500);

-- Add flag for generating acknowledgment files
ALTER TABLE "pos_integrations"
ADD COLUMN IF NOT EXISTS "generate_acknowledgments" BOOLEAN DEFAULT true;

-- Add connection mode to distinguish API vs file-based
ALTER TABLE "pos_integrations"
ADD COLUMN IF NOT EXISTS "connection_mode" VARCHAR(20) DEFAULT 'API'
CHECK ("connection_mode" IN ('API', 'FILE_EXCHANGE', 'HYBRID'));

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE "naxml_file_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_file_watcher_config" ENABLE ROW LEVEL SECURITY;

-- RLS policy for naxml_file_log: Users can only see file logs for stores they can access
CREATE POLICY "naxml_file_log_store_access" ON "naxml_file_log"
  FOR SELECT
  USING (
    "store_id" IN (
      SELECT ur."store_id"
      FROM "user_roles" ur
      WHERE ur."user_id" = current_setting('app.current_user_id', true)::uuid
        AND ur."store_id" IS NOT NULL
    )
    OR
    EXISTS (
      SELECT 1
      FROM "stores" s
      JOIN "user_roles" ur ON ur."company_id" = s."company_id"
      WHERE s."store_id" = "naxml_file_log"."store_id"
        AND ur."user_id" = current_setting('app.current_user_id', true)::uuid
    )
    OR
    EXISTS (
      SELECT 1
      FROM "users" u
      WHERE u."user_id" = current_setting('app.current_user_id', true)::uuid
        AND u."status" = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM "user_roles" ur
          JOIN "roles" r ON ur."role_id" = r."role_id"
          WHERE ur."user_id" = u."user_id"
            AND r."code" = 'SYSTEM_ADMIN'
        )
    )
  );

-- RLS policy for pos_file_watcher_config: Same access pattern
CREATE POLICY "file_watcher_config_store_access" ON "pos_file_watcher_config"
  FOR SELECT
  USING (
    "store_id" IN (
      SELECT ur."store_id"
      FROM "user_roles" ur
      WHERE ur."user_id" = current_setting('app.current_user_id', true)::uuid
        AND ur."store_id" IS NOT NULL
    )
    OR
    EXISTS (
      SELECT 1
      FROM "stores" s
      JOIN "user_roles" ur ON ur."company_id" = s."company_id"
      WHERE s."store_id" = "pos_file_watcher_config"."store_id"
        AND ur."user_id" = current_setting('app.current_user_id', true)::uuid
    )
    OR
    EXISTS (
      SELECT 1
      FROM "users" u
      WHERE u."user_id" = current_setting('app.current_user_id', true)::uuid
        AND u."status" = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM "user_roles" ur
          JOIN "roles" r ON ur."role_id" = r."role_id"
          WHERE ur."user_id" = u."user_id"
            AND r."code" = 'SYSTEM_ADMIN'
        )
    )
  );

-- Insert/Update/Delete policies for file watcher config (store managers and admins)
CREATE POLICY "file_watcher_config_manage" ON "pos_file_watcher_config"
  FOR ALL
  USING (
    "store_id" IN (
      SELECT ur."store_id"
      FROM "user_roles" ur
      JOIN "roles" r ON ur."role_id" = r."role_id"
      WHERE ur."user_id" = current_setting('app.current_user_id', true)::uuid
        AND ur."store_id" IS NOT NULL
        AND r."code" IN ('STORE_MANAGER', 'STORE_OWNER')
    )
    OR
    EXISTS (
      SELECT 1
      FROM "users" u
      WHERE u."user_id" = current_setting('app.current_user_id', true)::uuid
        AND u."status" = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM "user_roles" ur
          JOIN "roles" r ON ur."role_id" = r."role_id"
          WHERE ur."user_id" = u."user_id"
            AND r."code" = 'SYSTEM_ADMIN'
        )
    )
  );

-- ============================================================================
-- TRIGGER FOR UPDATED_AT
-- ============================================================================

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to pos_file_watcher_config
DROP TRIGGER IF EXISTS "update_pos_file_watcher_config_updated_at" ON "pos_file_watcher_config";
CREATE TRIGGER "update_pos_file_watcher_config_updated_at"
  BEFORE UPDATE ON "pos_file_watcher_config"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
