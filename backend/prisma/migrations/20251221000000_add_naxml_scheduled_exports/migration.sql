-- ============================================================================
-- Add NAXML Scheduled Export Tables Migration
-- ============================================================================
-- This migration adds tables for scheduled NAXML exports functionality.
-- Enables stores to configure automated export schedules for POS data.
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Export Type enum for scheduled exports (create only if not exists)
DO $$ BEGIN
  CREATE TYPE "NAXMLExportType" AS ENUM (
    'DEPARTMENTS',
    'TENDER_TYPES',
    'TAX_RATES',
    'PRICE_BOOK',
    'FULL_SYNC'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Scheduled Export Status enum (create only if not exists)
DO $$ BEGIN
  CREATE TYPE "ScheduledExportStatus" AS ENUM (
    'ACTIVE',
    'PAUSED',
    'DISABLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- NAXML SCHEDULED EXPORT TABLE
-- ============================================================================
-- Configuration for automated NAXML export schedules.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "naxml_scheduled_export" (
  -- Primary identification
  "schedule_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  "store_id" UUID NOT NULL REFERENCES "stores"("store_id") ON DELETE CASCADE,
  "pos_integration_id" UUID NOT NULL REFERENCES "pos_integrations"("pos_integration_id") ON DELETE CASCADE,

  -- Export configuration
  "export_type" "NAXMLExportType" NOT NULL,
  "export_name" VARCHAR(255) NOT NULL,
  "maintenance_type" VARCHAR(20) NOT NULL DEFAULT 'Full',

  -- Schedule configuration (cron-style)
  "cron_expression" VARCHAR(50) NOT NULL,
  "timezone" VARCHAR(50) NOT NULL DEFAULT 'America/New_York',

  -- Output configuration
  "output_path" VARCHAR(500),
  "file_name_pattern" VARCHAR(255) NOT NULL DEFAULT '{type}_{date}_{time}.xml',

  -- Scheduling state
  "status" "ScheduledExportStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_run_at" TIMESTAMPTZ,
  "next_run_at" TIMESTAMPTZ,
  "last_status" "NAXMLFileStatus",
  "last_error" TEXT,

  -- Statistics
  "run_count" INTEGER NOT NULL DEFAULT 0,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "failure_count" INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  "created_by" UUID REFERENCES "users"("user_id") ON DELETE SET NULL,
  "metadata" JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS "idx_naxml_sched_export_store" ON "naxml_scheduled_export"("store_id");
CREATE INDEX IF NOT EXISTS "idx_naxml_sched_export_pos_integration" ON "naxml_scheduled_export"("pos_integration_id");
CREATE INDEX IF NOT EXISTS "idx_naxml_sched_export_status_next_run" ON "naxml_scheduled_export"("status", "next_run_at");
CREATE INDEX IF NOT EXISTS "idx_naxml_sched_export_type" ON "naxml_scheduled_export"("export_type");

-- Comment for documentation
COMMENT ON TABLE "naxml_scheduled_export" IS
  'Configuration for automated NAXML export schedules. Each store can have
   multiple scheduled exports for different export types (departments, taxes, etc.).';

-- ============================================================================
-- NAXML SCHEDULED EXPORT LOG TABLE
-- ============================================================================
-- History of scheduled export runs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "naxml_scheduled_export_log" (
  -- Primary identification
  "log_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  "schedule_id" UUID NOT NULL REFERENCES "naxml_scheduled_export"("schedule_id") ON DELETE CASCADE,
  "store_id" UUID NOT NULL REFERENCES "stores"("store_id") ON DELETE CASCADE,

  -- Timing
  "started_at" TIMESTAMPTZ NOT NULL,
  "completed_at" TIMESTAMPTZ,
  "duration_ms" INTEGER,

  -- Status
  "status" "NAXMLFileStatus" NOT NULL,
  "error_code" VARCHAR(50),
  "error_message" TEXT,

  -- Export details
  "export_type" "NAXMLExportType" NOT NULL,
  "maintenance_type" VARCHAR(20) NOT NULL,
  "record_count" INTEGER,
  "file_size_bytes" BIGINT,
  "file_hash" VARCHAR(64),
  "output_path" VARCHAR(500),

  -- Trigger info
  "trigger_type" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',

  -- Metadata
  "metadata" JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS "idx_naxml_sched_export_log_schedule" ON "naxml_scheduled_export_log"("schedule_id", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_naxml_sched_export_log_store" ON "naxml_scheduled_export_log"("store_id", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_naxml_sched_export_log_status" ON "naxml_scheduled_export_log"("status");

-- Comment for documentation
COMMENT ON TABLE "naxml_scheduled_export_log" IS
  'History of scheduled export runs. Each row represents one execution of a
   scheduled export, including timing, status, and output details.';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE "naxml_scheduled_export" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "naxml_scheduled_export_log" ENABLE ROW LEVEL SECURITY;

-- RLS policy for naxml_scheduled_export: Users can see schedules for stores they can access
DROP POLICY IF EXISTS "naxml_scheduled_export_store_access" ON "naxml_scheduled_export";
CREATE POLICY "naxml_scheduled_export_store_access" ON "naxml_scheduled_export"
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
      WHERE s."store_id" = "naxml_scheduled_export"."store_id"
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

-- RLS policy for naxml_scheduled_export_log: Same access pattern
DROP POLICY IF EXISTS "naxml_scheduled_export_log_store_access" ON "naxml_scheduled_export_log";
CREATE POLICY "naxml_scheduled_export_log_store_access" ON "naxml_scheduled_export_log"
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
      WHERE s."store_id" = "naxml_scheduled_export_log"."store_id"
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

-- Manage policy for scheduled exports (store managers and admins can modify)
DROP POLICY IF EXISTS "naxml_scheduled_export_manage" ON "naxml_scheduled_export";
CREATE POLICY "naxml_scheduled_export_manage" ON "naxml_scheduled_export"
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

-- Add trigger to naxml_scheduled_export
DROP TRIGGER IF EXISTS "update_naxml_scheduled_export_updated_at" ON "naxml_scheduled_export";
CREATE TRIGGER "update_naxml_scheduled_export_updated_at"
  BEFORE UPDATE ON "naxml_scheduled_export"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
