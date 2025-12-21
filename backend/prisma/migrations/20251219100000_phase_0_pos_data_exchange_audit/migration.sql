-- ============================================================================
-- Phase 0: POS Data Exchange Audit Infrastructure (MANDATORY)
-- ============================================================================
-- This migration creates:
-- 1. PosDataExchangeAudit table for regulatory compliance
-- 2. Enums for exchange types, data categories, and retention policies
-- 3. RLS policies for audit access control
-- 4. Indexes for performance
--
-- CRITICAL: All POS data exchanges MUST create a record in this table.
-- This table provides complete audit trail for regulatory compliance.
-- DO NOT SKIP: Any adapter that processes data without updating this table
-- is in violation of data privacy requirements.
-- ============================================================================

-- ============================================================================
-- ENUMS (with IF NOT EXISTS using DO block)
-- ============================================================================

-- POS Exchange Type enum
DO $$ BEGIN
    CREATE TYPE "POSExchangeType" AS ENUM (
        'FILE_IMPORT',
        'FILE_EXPORT',
        'API_REQUEST',
        'API_RESPONSE',
        'WEBHOOK',
        'SYNC_OPERATION'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- POS Data Category enum
DO $$ BEGIN
    CREATE TYPE "POSDataCategory" AS ENUM (
        'TRANSACTION',
        'PRICEBOOK',
        'DEPARTMENT',
        'TENDER_TYPE',
        'TAX_RATE',
        'EMPLOYEE',
        'CASHIER',
        'INVENTORY',
        'FINANCIAL',
        'PII',
        'SYSTEM_CONFIG'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- POS Audit Status enum
DO $$ BEGIN
    CREATE TYPE "POSAuditStatus" AS ENUM (
        'PENDING',
        'PROCESSING',
        'SUCCESS',
        'PARTIAL',
        'FAILED',
        'REJECTED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- POS Data Retention Policy enum
DO $$ BEGIN
    CREATE TYPE "POSRetentionPolicy" AS ENUM (
        'STANDARD',        -- 7 years (default for financial)
        'EXTENDED',        -- 10 years
        'PERMANENT',       -- Never expires
        'PII_RESTRICTED'   -- 2 years or upon request
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- POS DATA EXCHANGE AUDIT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pos_data_exchange_audit" (
    -- Primary identification
    "audit_id" UUID NOT NULL DEFAULT gen_random_uuid(),

    -- Foreign keys for context
    "store_id" UUID NOT NULL,
    "pos_integration_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,

    -- Exchange identification
    "exchange_id" VARCHAR(100) NOT NULL,
    "exchange_type" "POSExchangeType" NOT NULL,

    -- Data flow direction and classification
    "direction" VARCHAR(10) NOT NULL,
    "data_category" "POSDataCategory" NOT NULL,
    "contains_pii" BOOLEAN NOT NULL DEFAULT false,
    "contains_financial" BOOLEAN NOT NULL DEFAULT false,

    -- Source and destination tracking
    "source_system" VARCHAR(100) NOT NULL,
    "source_identifier" VARCHAR(255),
    "destination_system" VARCHAR(100) NOT NULL,
    "destination_identifier" VARCHAR(255),

    -- Data metrics
    "record_count" INTEGER,
    "data_size_bytes" BIGINT,
    "file_hash" VARCHAR(128),

    -- Processing status
    "status" "POSAuditStatus" NOT NULL DEFAULT 'PENDING',
    "error_code" VARCHAR(50),
    "error_message" TEXT,

    -- Data retention and compliance
    "retention_policy" "POSRetentionPolicy" NOT NULL DEFAULT 'STANDARD',
    "retention_expires_at" TIMESTAMPTZ(6),
    "jurisdiction" VARCHAR(50) DEFAULT 'US',

    -- Consent and access tracking
    "data_subject_consent" BOOLEAN,
    "accessed_by_user_id" UUID,
    "access_reason" VARCHAR(255),

    -- Timestamps
    "initiated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Metadata for extensibility
    "metadata" JSONB DEFAULT '{}'::jsonb,

    CONSTRAINT "pos_data_exchange_audit_pkey" PRIMARY KEY ("audit_id"),
    CONSTRAINT "pos_data_exchange_audit_direction_check" CHECK ("direction" IN ('INBOUND', 'OUTBOUND'))
);

-- ============================================================================
-- INDEXES - Performance Optimization
-- ============================================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS "idx_pos_audit_store_date"
    ON "pos_data_exchange_audit"("store_id", "initiated_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_pos_audit_company_date"
    ON "pos_data_exchange_audit"("company_id", "initiated_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_pos_audit_exchange_id"
    ON "pos_data_exchange_audit"("exchange_id");

-- Status tracking (partial index for non-success cases)
CREATE INDEX IF NOT EXISTS "idx_pos_audit_status"
    ON "pos_data_exchange_audit"("status")
    WHERE "status" != 'SUCCESS';

-- PII tracking for compliance reports (partial index)
CREATE INDEX IF NOT EXISTS "idx_pos_audit_pii"
    ON "pos_data_exchange_audit"("contains_pii")
    WHERE "contains_pii" = true;

-- Retention cleanup (partial index for records with expiry)
CREATE INDEX IF NOT EXISTS "idx_pos_audit_retention"
    ON "pos_data_exchange_audit"("retention_expires_at")
    WHERE "retention_expires_at" IS NOT NULL;

-- Compliance indexes
CREATE INDEX IF NOT EXISTS "idx_pos_audit_data_category"
    ON "pos_data_exchange_audit"("data_category", "initiated_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_pos_audit_jurisdiction"
    ON "pos_data_exchange_audit"("jurisdiction");

-- Integration tracking
CREATE INDEX IF NOT EXISTS "idx_pos_audit_integration"
    ON "pos_data_exchange_audit"("pos_integration_id", "initiated_at" DESC);

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE "pos_data_exchange_audit" ADD CONSTRAINT "pos_audit_store_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "pos_data_exchange_audit" ADD CONSTRAINT "pos_audit_integration_fkey"
    FOREIGN KEY ("pos_integration_id") REFERENCES "pos_integrations"("pos_integration_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "pos_data_exchange_audit" ADD CONSTRAINT "pos_audit_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "pos_data_exchange_audit" ADD CONSTRAINT "pos_audit_user_fkey"
    FOREIGN KEY ("accessed_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on audit table
ALTER TABLE pos_data_exchange_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_data_exchange_audit FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies for POSDataExchangeAudit
-- ============================================================================

-- Policy: System Admins can see all audit records
-- Users can see audit records for stores in their company
-- Store-scoped users can see audit records for their store
CREATE POLICY pos_audit_select_policy ON pos_data_exchange_audit
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR EXISTS (
      SELECT 1 FROM stores s
      WHERE s.store_id = pos_data_exchange_audit.store_id
        AND (
          s.company_id = app.get_user_company_id()
          OR s.store_id = app.get_user_store_id()
        )
    )
  );

-- Policy: Only system processes and admins can insert audit records
-- Company/Store users can insert for their accessible stores
CREATE POLICY pos_audit_insert_policy ON pos_data_exchange_audit
  FOR INSERT
  WITH CHECK (
    app.is_system_admin() = TRUE
    OR EXISTS (
      SELECT 1 FROM stores s
      WHERE s.store_id = pos_data_exchange_audit.store_id
        AND (
          s.company_id = app.get_user_company_id()
          OR s.store_id = app.get_user_store_id()
        )
    )
  );

-- Policy: Only system admins can update audit records
-- This maintains audit integrity
CREATE POLICY pos_audit_update_policy ON pos_data_exchange_audit
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR EXISTS (
      SELECT 1 FROM stores s
      WHERE s.store_id = pos_data_exchange_audit.store_id
        AND (
          s.company_id = app.get_user_company_id()
          OR s.store_id = app.get_user_store_id()
        )
    )
  );

-- Policy: Only system admins can delete audit records (for retention cleanup)
-- Audit records are immutable for compliance
CREATE POLICY pos_audit_delete_policy ON pos_data_exchange_audit
  FOR DELETE
  USING (app.is_system_admin() = TRUE);

-- ============================================================================
-- Grant permissions to app_user
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON pos_data_exchange_audit TO app_user;

-- ============================================================================
-- Documentation comment
-- ============================================================================

COMMENT ON TABLE pos_data_exchange_audit IS
  'MANDATORY audit table for all POS data exchanges. Required for regulatory compliance.
   All adapters MUST create audit records before processing any data.
   Failure to update this table is a compliance violation.

   Retention Policies:
   - STANDARD: 7 years (financial records)
   - EXTENDED: 10 years
   - PERMANENT: Never expires
   - PII_RESTRICTED: 2 years or upon data subject request';
