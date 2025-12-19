-- ============================================================================
-- Phase 1.6: POS Integration & Auto-Onboarding
-- ============================================================================
-- This migration creates:
-- 1. POS Integration related enums
-- 2. POSIntegration table for store-to-POS connections
-- 3. POSSyncLog table for tracking sync history
-- 4. Updates to TenderType, Department, TaxRate for POS sync fields
-- 5. RLS policies for all new tables
-- ============================================================================

-- ============================================================================
-- ENUMS (with IF NOT EXISTS using DO block)
-- ============================================================================

-- POS System Type enum
DO $$ BEGIN
    CREATE TYPE "POSSystemType" AS ENUM (
        'GILBARCO_PASSPORT',
        'GILBARCO_COMMANDER',
        'VERIFONE_RUBY2',
        'VERIFONE_COMMANDER',
        'VERIFONE_SAPPHIRE',
        'CLOVER_REST',
        'ORACLE_SIMPHONY',
        'NCR_ALOHA',
        'LIGHTSPEED_REST',
        'SQUARE_REST',
        'TOAST_REST',
        'GENERIC_XML',
        'GENERIC_REST',
        'MANUAL_ENTRY'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- POS Auth Type enum
DO $$ BEGIN
    CREATE TYPE "POSAuthType" AS ENUM (
        'NONE',
        'API_KEY',
        'BASIC_AUTH',
        'OAUTH2',
        'CERTIFICATE',
        'CUSTOM'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- POS Sync Status enum
DO $$ BEGIN
    CREATE TYPE "POSSyncStatus" AS ENUM (
        'PENDING',
        'IN_PROGRESS',
        'SUCCESS',
        'PARTIAL_SUCCESS',
        'FAILED',
        'TIMEOUT',
        'AUTH_ERROR',
        'CONNECTION_ERROR'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- POS Sync Trigger enum
DO $$ BEGIN
    CREATE TYPE "POSSyncTrigger" AS ENUM (
        'SCHEDULED',
        'MANUAL',
        'INITIAL_SETUP',
        'RECONNECT',
        'WEBHOOK',
        'ENTITY_CHANGE'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- POS INTEGRATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pos_integrations" (
    "pos_integration_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "pos_type" "POSSystemType" NOT NULL,
    "pos_name" VARCHAR(100),
    "pos_version" VARCHAR(50),
    "pos_serial" VARCHAR(100),
    "host" VARCHAR(255) NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 8080,
    "use_ssl" BOOLEAN NOT NULL DEFAULT true,
    "timeout" INTEGER NOT NULL DEFAULT 30000,
    "auth_type" "POSAuthType" NOT NULL DEFAULT 'API_KEY',
    "auth_credentials" JSONB,
    "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sync_interval_mins" INTEGER NOT NULL DEFAULT 60,
    "sync_departments" BOOLEAN NOT NULL DEFAULT true,
    "sync_tender_types" BOOLEAN NOT NULL DEFAULT true,
    "sync_cashiers" BOOLEAN NOT NULL DEFAULT true,
    "sync_tax_rates" BOOLEAN NOT NULL DEFAULT true,
    "sync_products" BOOLEAN NOT NULL DEFAULT false,
    "last_sync_at" TIMESTAMPTZ(6),
    "last_sync_status" "POSSyncStatus",
    "last_sync_error" TEXT,
    "next_sync_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "pos_integrations_pkey" PRIMARY KEY ("pos_integration_id"),
    CONSTRAINT "pos_integrations_store_id_unique" UNIQUE ("store_id")
);

-- ============================================================================
-- POS SYNC LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pos_sync_logs" (
    "sync_log_id" UUID NOT NULL,
    "pos_integration_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "status" "POSSyncStatus" NOT NULL DEFAULT 'PENDING',
    "trigger_type" "POSSyncTrigger" NOT NULL DEFAULT 'MANUAL',
    "departments_synced" INTEGER NOT NULL DEFAULT 0,
    "tender_types_synced" INTEGER NOT NULL DEFAULT 0,
    "cashiers_synced" INTEGER NOT NULL DEFAULT 0,
    "tax_rates_synced" INTEGER NOT NULL DEFAULT 0,
    "entities_created" INTEGER NOT NULL DEFAULT 0,
    "entities_updated" INTEGER NOT NULL DEFAULT 0,
    "entities_deactivated" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(50),
    "error_message" TEXT,
    "error_details" JSONB,
    "triggered_by" UUID,

    CONSTRAINT "pos_sync_logs_pkey" PRIMARY KEY ("sync_log_id")
);

-- ============================================================================
-- UPDATES TO LOOKUP TABLES - Add POS integration fields
-- ============================================================================

-- TenderType - Add POS sync fields
DO $$ BEGIN
    ALTER TABLE "tender_types" ADD COLUMN "store_id" UUID;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tender_types" ADD COLUMN "pos_code" VARCHAR(50);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tender_types" ADD COLUMN "pos_source" "POSSystemType";
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tender_types" ADD COLUMN "last_synced_at" TIMESTAMPTZ(6);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Department - Add POS sync fields
DO $$ BEGIN
    ALTER TABLE "departments" ADD COLUMN "store_id" UUID;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "departments" ADD COLUMN "pos_code" VARCHAR(50);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "departments" ADD COLUMN "pos_source" "POSSystemType";
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "departments" ADD COLUMN "last_synced_at" TIMESTAMPTZ(6);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- TaxRate - Add POS sync fields
DO $$ BEGIN
    ALTER TABLE "tax_rates" ADD COLUMN "pos_code" VARCHAR(50);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tax_rates" ADD COLUMN "pos_source" "POSSystemType";
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tax_rates" ADD COLUMN "last_synced_at" TIMESTAMPTZ(6);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- ============================================================================
-- INDEXES - POS Integration Tables
-- ============================================================================

-- POSIntegration indexes
CREATE INDEX IF NOT EXISTS "pos_integrations_store_id_idx" ON "pos_integrations"("store_id");
CREATE INDEX IF NOT EXISTS "pos_integrations_is_active_sync_enabled_idx" ON "pos_integrations"("is_active", "sync_enabled");
CREATE INDEX IF NOT EXISTS "pos_integrations_next_sync_at_idx" ON "pos_integrations"("next_sync_at");
CREATE INDEX IF NOT EXISTS "pos_integrations_pos_type_idx" ON "pos_integrations"("pos_type");

-- POSSyncLog indexes
CREATE INDEX IF NOT EXISTS "pos_sync_logs_integration_id_idx" ON "pos_sync_logs"("pos_integration_id");
CREATE INDEX IF NOT EXISTS "pos_sync_logs_started_at_idx" ON "pos_sync_logs"("started_at" DESC);
CREATE INDEX IF NOT EXISTS "pos_sync_logs_status_idx" ON "pos_sync_logs"("status");
CREATE INDEX IF NOT EXISTS "pos_sync_logs_integration_status_idx" ON "pos_sync_logs"("pos_integration_id", "status");

-- Lookup table POS sync indexes
CREATE INDEX IF NOT EXISTS "tender_types_store_id_idx" ON "tender_types"("store_id");
CREATE INDEX IF NOT EXISTS "tender_types_pos_code_store_id_idx" ON "tender_types"("pos_code", "store_id");
CREATE INDEX IF NOT EXISTS "tender_types_pos_source_idx" ON "tender_types"("pos_source");

CREATE INDEX IF NOT EXISTS "departments_store_id_idx" ON "departments"("store_id");
CREATE INDEX IF NOT EXISTS "departments_pos_code_store_id_idx" ON "departments"("pos_code", "store_id");
CREATE INDEX IF NOT EXISTS "departments_pos_source_idx" ON "departments"("pos_source");

CREATE INDEX IF NOT EXISTS "tax_rates_pos_code_store_id_idx" ON "tax_rates"("pos_code", "store_id");
CREATE INDEX IF NOT EXISTS "tax_rates_pos_source_idx" ON "tax_rates"("pos_source");

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

-- POSIntegration foreign keys
DO $$ BEGIN
    ALTER TABLE "pos_integrations" ADD CONSTRAINT "pos_integrations_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "pos_integrations" ADD CONSTRAINT "pos_integrations_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- POSSyncLog foreign keys
DO $$ BEGIN
    ALTER TABLE "pos_sync_logs" ADD CONSTRAINT "pos_sync_logs_integration_id_fkey"
    FOREIGN KEY ("pos_integration_id") REFERENCES "pos_integrations"("pos_integration_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "pos_sync_logs" ADD CONSTRAINT "pos_sync_logs_triggered_by_fkey"
    FOREIGN KEY ("triggered_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Lookup table store_id foreign keys
DO $$ BEGIN
    ALTER TABLE "tender_types" ADD CONSTRAINT "tender_types_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "departments" ADD CONSTRAINT "departments_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on POS Integration tables
ALTER TABLE pos_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_integrations FORCE ROW LEVEL SECURITY;

ALTER TABLE pos_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sync_logs FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies for POSIntegration
-- ============================================================================

-- Policy: System Admins can see all integrations
-- Users can see integrations for stores in their company
-- Store-scoped users can see integrations for their store
CREATE POLICY pos_integration_select_policy ON pos_integrations
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR EXISTS (
      SELECT 1 FROM stores s
      WHERE s.store_id = pos_integrations.store_id
        AND (
          s.company_id = app.get_user_company_id()
          OR s.store_id = app.get_user_store_id()
        )
    )
  );

-- Policy: System Admins can insert any integration
-- Company-scoped users can insert for stores in their company
CREATE POLICY pos_integration_insert_policy ON pos_integrations
  FOR INSERT
  WITH CHECK (
    app.is_system_admin() = TRUE
    OR EXISTS (
      SELECT 1 FROM stores s
      WHERE s.store_id = pos_integrations.store_id
        AND s.company_id = app.get_user_company_id()
    )
  );

-- Policy: System Admins can update any integration
-- Company-scoped users can update for stores in their company
-- Store-scoped users can update their store's integration
CREATE POLICY pos_integration_update_policy ON pos_integrations
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR EXISTS (
      SELECT 1 FROM stores s
      WHERE s.store_id = pos_integrations.store_id
        AND (
          s.company_id = app.get_user_company_id()
          OR s.store_id = app.get_user_store_id()
        )
    )
  );

-- Policy: System Admins can delete any integration
-- Company-scoped users can delete for stores in their company
CREATE POLICY pos_integration_delete_policy ON pos_integrations
  FOR DELETE
  USING (
    app.is_system_admin() = TRUE
    OR EXISTS (
      SELECT 1 FROM stores s
      WHERE s.store_id = pos_integrations.store_id
        AND s.company_id = app.get_user_company_id()
    )
  );

-- ============================================================================
-- RLS Policies for POSSyncLog
-- ============================================================================

-- Policy: System Admins can see all sync logs
-- Users can see logs for integrations they have access to
CREATE POLICY pos_sync_log_select_policy ON pos_sync_logs
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR EXISTS (
      SELECT 1 FROM pos_integrations pi
      JOIN stores s ON s.store_id = pi.store_id
      WHERE pi.pos_integration_id = pos_sync_logs.pos_integration_id
        AND (
          s.company_id = app.get_user_company_id()
          OR s.store_id = app.get_user_store_id()
        )
    )
  );

-- Policy: Sync logs are created by the system/worker, not users directly
-- But allow users with access to the integration to create logs (for manual sync)
CREATE POLICY pos_sync_log_insert_policy ON pos_sync_logs
  FOR INSERT
  WITH CHECK (
    app.is_system_admin() = TRUE
    OR EXISTS (
      SELECT 1 FROM pos_integrations pi
      JOIN stores s ON s.store_id = pi.store_id
      WHERE pi.pos_integration_id = pos_sync_logs.pos_integration_id
        AND (
          s.company_id = app.get_user_company_id()
          OR s.store_id = app.get_user_store_id()
        )
    )
  );

-- Policy: Sync logs are updated by the system/worker
CREATE POLICY pos_sync_log_update_policy ON pos_sync_logs
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR EXISTS (
      SELECT 1 FROM pos_integrations pi
      JOIN stores s ON s.store_id = pi.store_id
      WHERE pi.pos_integration_id = pos_sync_logs.pos_integration_id
        AND (
          s.company_id = app.get_user_company_id()
          OR s.store_id = app.get_user_store_id()
        )
    )
  );

-- Policy: Sync logs are immutable (only system admin can delete for cleanup)
CREATE POLICY pos_sync_log_delete_policy ON pos_sync_logs
  FOR DELETE
  USING (app.is_system_admin() = TRUE);

-- ============================================================================
-- Grant permissions to app_user
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON pos_integrations TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_sync_logs TO app_user;
