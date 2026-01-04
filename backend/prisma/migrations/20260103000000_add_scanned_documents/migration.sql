-- ============================================================================
-- Migration: Add Scanned Documents Table
-- Phase: Document Scanning / OCR Feature
-- Date: 2026-01-03
-- ============================================================================
-- This migration creates the scanned_documents table for storing OCR-processed
-- document metadata and linking to cloud storage (S3/R2).
--
-- ENTERPRISE TRACEABILITY:
-- Every scanned document can be traced back to:
-- - Store (tenant isolation)
-- - Company (parent organization)
-- - Business date (which day's report)
-- - Shift (which shift was active)
-- - Cashier (who was operating)
-- - User (who initiated the scan)
-- - Terminal (which device was used)
-- - Session (which cashier session)
--
-- This enables:
-- - Click-through from reports to original scanned document
-- - Full audit trail for compliance
-- - Debugging and error tracing
-- - Analytics on scanning patterns
--
-- Enterprise standards applied:
-- - DB-006: Tenant isolation via store_id/company_id with RLS policies
-- - SEC-015: Secure file tracking with hash verification
-- - LM-001: Comprehensive audit trail fields
-- ============================================================================

-- Create enum for document types
DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    'LOTTERY_SALES_REPORT',
    'LOTTERY_INVOICE_REPORT',
    'GAMING_REPORT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create enum for OCR processing status
DO $$ BEGIN
  CREATE TYPE ocr_status AS ENUM (
    'PENDING',
    'PREPROCESSING',
    'EXTRACTING',
    'AWAITING_VERIFICATION',
    'VERIFIED',
    'FAILED',
    'REJECTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create enum for storage provider
DO $$ BEGIN
  CREATE TYPE storage_provider AS ENUM (
    'S3',
    'R2',
    'LOCAL',
    'AZURE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create enum for entry method
DO $$ BEGIN
  CREATE TYPE scan_entry_method AS ENUM (
    'SCAN',
    'MANUAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- SCANNED DOCUMENTS TABLE
-- ============================================================================
-- Stores metadata for all scanned documents with COMPLETE traceability.
-- Actual files are stored in cloud storage (S3/R2), this table tracks the link.
--
-- QUERY PATTERNS SUPPORTED:
-- 1. "Show me the scanned document for store X on date Y"
--    → WHERE store_id = X AND business_date = Y
-- 2. "Who scanned this document?"
--    → JOIN users ON scanned_by_user_id, JOIN cashiers ON cashier_id
-- 3. "Show all documents scanned during shift Z"
--    → WHERE shift_id = Z
-- 4. "What terminal was used to scan this?"
--    → JOIN pos_terminals ON terminal_id
-- 5. "Get the original scan for this lottery report number"
--    → WHERE day_summary_id = X AND document_type = 'LOTTERY_SALES_REPORT'
-- ============================================================================

CREATE TABLE IF NOT EXISTS scanned_documents (
  -- Primary key
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ========== TENANT ISOLATION & HIERARCHY ==========
  -- DB-006: Complete tenant context for RLS and filtering
  store_id UUID NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,

  -- Document type (determines extraction rules)
  document_type document_type NOT NULL,

  -- ========== TEMPORAL CONTEXT ==========
  -- When does this document belong to?
  business_date DATE NOT NULL,
  -- Week ending date (for invoice reports - always Saturday)
  week_ending_date DATE,

  -- ========== OPERATIONAL CONTEXT ==========
  -- What was happening when this was scanned?

  -- Day Summary - links to the day close record
  day_summary_id UUID REFERENCES day_summaries(day_summary_id) ON DELETE SET NULL,

  -- Lottery Business Day - links to lottery day record
  lottery_day_id UUID,  -- Will add FK after checking if lottery_business_days exists

  -- Shift - which shift was open when scanned
  shift_id UUID REFERENCES shifts(shift_id) ON DELETE SET NULL,

  -- Cashier Session - which active session was used
  cashier_session_id UUID REFERENCES cashier_sessions(session_id) ON DELETE SET NULL,

  -- Terminal - which physical device was used
  terminal_id UUID REFERENCES pos_terminals(pos_terminal_id) ON DELETE SET NULL,

  -- Cashier - who was operating (authenticated via PIN)
  cashier_id UUID REFERENCES cashiers(cashier_id) ON DELETE SET NULL,

  -- ========== PROCESSING STATUS ==========
  status ocr_status NOT NULL DEFAULT 'PENDING',
  entry_method scan_entry_method NOT NULL DEFAULT 'SCAN',

  -- Processing timestamps for pipeline tracking
  preprocessing_started_at TIMESTAMPTZ,
  preprocessing_completed_at TIMESTAMPTZ,
  extraction_started_at TIMESTAMPTZ,
  extraction_completed_at TIMESTAMPTZ,

  -- Processing duration in milliseconds (for analytics)
  total_processing_time_ms INTEGER,

  -- ========== STORAGE INFORMATION ==========
  -- SEC-015: Files stored in cloud with UUID-based paths
  storage_provider storage_provider NOT NULL,
  storage_bucket VARCHAR(255) NOT NULL,
  storage_path VARCHAR(1000) NOT NULL,
  storage_region VARCHAR(50),

  -- Presigned URL caching (optimization)
  cached_presigned_url TEXT,
  cached_presigned_url_expires_at TIMESTAMPTZ,

  -- ========== FILE METADATA ==========
  original_filename VARCHAR(255) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  -- SEC-015: SHA-256 hash for file integrity verification
  file_hash VARCHAR(64) NOT NULL,

  -- Image metadata (for display and preprocessing)
  image_width INTEGER,
  image_height INTEGER,
  -- Was preprocessing applied?
  was_preprocessed BOOLEAN DEFAULT FALSE,
  preprocessing_operations JSONB,  -- ['deskew', 'contrast', 'sharpen']

  -- ========== EXTRACTED DATA ==========
  -- OCR-extracted wizard fields (raw from OCR, may have errors)
  ocr_wizard_fields JSONB,
  -- User-confirmed wizard fields (after verification)
  confirmed_wizard_fields JSONB,
  -- Full extracted report data for analytics
  extracted_data JSONB,
  -- Raw OCR text (for debugging and reprocessing)
  raw_ocr_text TEXT,
  -- OCR confidence score (0-100)
  confidence_score DECIMAL(5,2),
  -- Per-field confidence scores
  field_confidence_scores JSONB,

  -- ========== REPORT METADATA (extracted from document) ==========
  -- These fields are parsed from the scanned document for validation
  report_date DATE,
  report_date_string VARCHAR(50),  -- Original date string from report (for debugging)
  retailer_id VARCHAR(50),
  report_type_string VARCHAR(100),  -- Original report type string from header

  -- ========== DATE VALIDATION ==========
  -- Was the report date validated against expected business date?
  date_validation_passed BOOLEAN,
  date_validation_error TEXT,

  -- ========== AUDIT TRAIL - WHO ==========
  -- User who initiated the scan (logged in user)
  scanned_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  -- User who verified/confirmed the data
  verified_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  -- User who rejected the document (if rejected)
  rejected_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

  -- ========== AUDIT TRAIL - WHEN ==========
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  -- ========== AUDIT TRAIL - WHY (rejection) ==========
  rejection_reason TEXT,
  rejection_code VARCHAR(50),

  -- ========== CLIENT CONTEXT ==========
  -- IP address and user agent for security audit
  client_ip_address INET,
  client_user_agent TEXT,

  -- ========== REPROCESSING SUPPORT ==========
  -- Has this document been reprocessed?
  reprocessed_from_document_id UUID REFERENCES scanned_documents(document_id) ON DELETE SET NULL,
  reprocess_count INTEGER DEFAULT 0,

  -- ========== TIMESTAMPS ==========
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK to lottery_business_days if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lottery_business_days') THEN
    ALTER TABLE scanned_documents
    ADD CONSTRAINT scanned_documents_lottery_day_id_fkey
    FOREIGN KEY (lottery_day_id) REFERENCES lottery_business_days(day_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Primary access patterns (most frequent queries)
CREATE INDEX IF NOT EXISTS idx_scanned_docs_store_id ON scanned_documents(store_id);
CREATE INDEX IF NOT EXISTS idx_scanned_docs_company_id ON scanned_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_scanned_docs_business_date ON scanned_documents(business_date);
CREATE INDEX IF NOT EXISTS idx_scanned_docs_store_date ON scanned_documents(store_id, business_date);
CREATE INDEX IF NOT EXISTS idx_scanned_docs_store_type_date ON scanned_documents(store_id, document_type, business_date);

-- Status queries (for processing pipelines)
CREATE INDEX IF NOT EXISTS idx_scanned_docs_status ON scanned_documents(status);
CREATE INDEX IF NOT EXISTS idx_scanned_docs_store_status ON scanned_documents(store_id, status);
CREATE INDEX IF NOT EXISTS idx_scanned_docs_status_created ON scanned_documents(status, created_at) WHERE status IN ('PENDING', 'PREPROCESSING', 'EXTRACTING');

-- Document type queries
CREATE INDEX IF NOT EXISTS idx_scanned_docs_type ON scanned_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_scanned_docs_store_type ON scanned_documents(store_id, document_type);

-- Operational context queries (linking back from reports)
CREATE INDEX IF NOT EXISTS idx_scanned_docs_day_summary ON scanned_documents(day_summary_id) WHERE day_summary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scanned_docs_lottery_day ON scanned_documents(lottery_day_id) WHERE lottery_day_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scanned_docs_shift ON scanned_documents(shift_id) WHERE shift_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scanned_docs_cashier ON scanned_documents(cashier_id) WHERE cashier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scanned_docs_terminal ON scanned_documents(terminal_id) WHERE terminal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scanned_docs_session ON scanned_documents(cashier_session_id) WHERE cashier_session_id IS NOT NULL;

-- Audit trail queries
CREATE INDEX IF NOT EXISTS idx_scanned_docs_scanned_by ON scanned_documents(scanned_by_user_id);
CREATE INDEX IF NOT EXISTS idx_scanned_docs_scanned_at ON scanned_documents(scanned_at);
CREATE INDEX IF NOT EXISTS idx_scanned_docs_verified_by ON scanned_documents(verified_by_user_id) WHERE verified_by_user_id IS NOT NULL;

-- Storage queries (for cleanup/audit)
CREATE INDEX IF NOT EXISTS idx_scanned_docs_storage_path ON scanned_documents(storage_path);
CREATE INDEX IF NOT EXISTS idx_scanned_docs_file_hash ON scanned_documents(file_hash);

-- Date validation queries
CREATE INDEX IF NOT EXISTS idx_scanned_docs_date_validation ON scanned_documents(store_id, date_validation_passed) WHERE date_validation_passed = FALSE;

-- Composite index for the most common report lookup pattern
-- "Get the verified lottery sales report for store X on date Y"
CREATE INDEX IF NOT EXISTS idx_scanned_docs_report_lookup
ON scanned_documents(store_id, document_type, business_date, status)
WHERE status = 'VERIFIED';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- DB-006: Enforce tenant isolation at database level

ALTER TABLE scanned_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS scanned_documents_tenant_isolation ON scanned_documents;
DROP POLICY IF EXISTS scanned_documents_insert_policy ON scanned_documents;

-- Policy: Users can only see documents from stores they have access to
CREATE POLICY scanned_documents_tenant_isolation ON scanned_documents
  FOR ALL
  USING (
    -- System admins can see all
    app.is_system_admin()
    OR
    -- Users can see documents from their stores
    store_id = ANY(app.current_store_ids())
    OR
    -- Users can see documents from their companies
    company_id = ANY(app.current_company_ids())
  );

-- Policy: Insert requires store access
CREATE POLICY scanned_documents_insert_policy ON scanned_documents
  FOR INSERT
  WITH CHECK (
    app.is_system_admin()
    OR
    store_id = ANY(app.current_store_ids())
  );

-- ============================================================================
-- TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_scanned_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scanned_documents_updated_at_trigger ON scanned_documents;
CREATE TRIGGER scanned_documents_updated_at_trigger
  BEFORE UPDATE ON scanned_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_scanned_documents_updated_at();

-- ============================================================================
-- HELPER FUNCTION: Get scanned document for a lottery report
-- ============================================================================
-- Used when store owner clicks on lottery numbers to see original scan

CREATE OR REPLACE FUNCTION get_scanned_document_for_day(
  p_store_id UUID,
  p_business_date DATE,
  p_document_type document_type DEFAULT 'LOTTERY_SALES_REPORT'
)
RETURNS TABLE (
  document_id UUID,
  storage_path VARCHAR(1000),
  storage_bucket VARCHAR(255),
  storage_provider storage_provider,
  scanned_at TIMESTAMPTZ,
  scanned_by_user_id UUID,
  cashier_id UUID,
  shift_id UUID,
  confidence_score DECIMAL(5,2),
  confirmed_wizard_fields JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sd.document_id,
    sd.storage_path,
    sd.storage_bucket,
    sd.storage_provider,
    sd.scanned_at,
    sd.scanned_by_user_id,
    sd.cashier_id,
    sd.shift_id,
    sd.confidence_score,
    sd.confirmed_wizard_fields
  FROM scanned_documents sd
  WHERE sd.store_id = p_store_id
    AND sd.business_date = p_business_date
    AND sd.document_type = p_document_type
    AND sd.status = 'VERIFIED'
  ORDER BY sd.scanned_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE scanned_documents IS 'Enterprise-grade storage for OCR-scanned documents with complete traceability. Links to S3/cloud storage. Supports: store, company, date, shift, cashier, terminal, session tracking.';

COMMENT ON COLUMN scanned_documents.document_id IS 'Primary key - UUID for the scanned document record';
COMMENT ON COLUMN scanned_documents.store_id IS 'Tenant isolation - FK to stores table';
COMMENT ON COLUMN scanned_documents.company_id IS 'Parent company - FK to companies table (for company-level queries)';
COMMENT ON COLUMN scanned_documents.document_type IS 'Type of document scanned (determines extraction rules)';
COMMENT ON COLUMN scanned_documents.business_date IS 'The business date this report belongs to (for SALES reports)';
COMMENT ON COLUMN scanned_documents.week_ending_date IS 'Week ending Saturday (for INVOICE reports)';
COMMENT ON COLUMN scanned_documents.day_summary_id IS 'Links to day close record - enables "view original scan" from reports';
COMMENT ON COLUMN scanned_documents.lottery_day_id IS 'Links to lottery business day record';
COMMENT ON COLUMN scanned_documents.shift_id IS 'Which shift was active when document was scanned';
COMMENT ON COLUMN scanned_documents.cashier_session_id IS 'Which cashier session was active (PIN authenticated)';
COMMENT ON COLUMN scanned_documents.terminal_id IS 'Which physical terminal/device was used for scanning';
COMMENT ON COLUMN scanned_documents.cashier_id IS 'Which cashier performed the scan';
COMMENT ON COLUMN scanned_documents.status IS 'OCR processing status lifecycle';
COMMENT ON COLUMN scanned_documents.storage_provider IS 'Cloud storage provider (S3, R2, etc.)';
COMMENT ON COLUMN scanned_documents.storage_bucket IS 'S3 bucket name for the stored file';
COMMENT ON COLUMN scanned_documents.storage_path IS 'Path/key in cloud storage (UUID-based for security)';
COMMENT ON COLUMN scanned_documents.file_hash IS 'SHA-256 hash of original file for integrity verification';
COMMENT ON COLUMN scanned_documents.ocr_wizard_fields IS 'Raw OCR-extracted wizard fields (may have errors)';
COMMENT ON COLUMN scanned_documents.confirmed_wizard_fields IS 'User-confirmed wizard fields after verification';
COMMENT ON COLUMN scanned_documents.extracted_data IS 'Full extracted report data for analytics (JSONB)';
COMMENT ON COLUMN scanned_documents.confidence_score IS 'OCR confidence score (0-100)';
COMMENT ON COLUMN scanned_documents.date_validation_passed IS 'Whether report date matched expected business date';
COMMENT ON COLUMN scanned_documents.scanned_by_user_id IS 'User who initiated the scan (audit trail)';
COMMENT ON COLUMN scanned_documents.verified_by_user_id IS 'User who verified/confirmed extracted data (audit trail)';
COMMENT ON COLUMN scanned_documents.client_ip_address IS 'IP address of scanning client (security audit)';

COMMENT ON FUNCTION get_scanned_document_for_day IS 'Helper function to retrieve the verified scanned document for a specific store/date. Used when store owner clicks lottery numbers to view original scan.';
