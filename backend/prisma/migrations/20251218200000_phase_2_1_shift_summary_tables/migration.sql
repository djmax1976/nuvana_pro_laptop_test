-- Phase 2.1: Shift Summary Tables
-- Creates pre-aggregated summary tables for shift-level reporting
-- This migration is part of the Shift & Day Summary Implementation Plan

-- ============================================================================
-- SHIFT SUMMARY TABLE - Main shift summary with all pre-calculated totals
-- ============================================================================
CREATE TABLE IF NOT EXISTS "shift_summaries" (
    "shift_summary_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,

    -- Timing
    "shift_opened_at" TIMESTAMPTZ(6) NOT NULL,
    "shift_closed_at" TIMESTAMPTZ(6) NOT NULL,
    "shift_duration_mins" INTEGER NOT NULL,

    -- Personnel
    "opened_by_user_id" UUID NOT NULL,
    "closed_by_user_id" UUID NOT NULL,
    "cashier_user_id" UUID,

    -- Sales Totals
    "gross_sales" DECIMAL(14,2) NOT NULL,
    "returns_total" DECIMAL(12,2) NOT NULL,
    "discounts_total" DECIMAL(12,2) NOT NULL,
    "net_sales" DECIMAL(14,2) NOT NULL,

    -- Tax
    "tax_collected" DECIMAL(12,2) NOT NULL,
    "tax_exempt_sales" DECIMAL(12,2) NOT NULL,
    "taxable_sales" DECIMAL(14,2) NOT NULL,

    -- Transaction Counts
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "void_count" INTEGER NOT NULL DEFAULT 0,
    "refund_count" INTEGER NOT NULL DEFAULT 0,
    "no_sale_count" INTEGER NOT NULL DEFAULT 0,

    -- Item Counts
    "items_sold_count" INTEGER NOT NULL DEFAULT 0,
    "items_returned_count" INTEGER NOT NULL DEFAULT 0,

    -- Averages
    "avg_transaction" DECIMAL(10,2) NOT NULL,
    "avg_items_per_txn" DECIMAL(6,2) NOT NULL,

    -- Cash Drawer Reconciliation
    "opening_cash" DECIMAL(10,2) NOT NULL,
    "closing_cash" DECIMAL(10,2) NOT NULL,
    "expected_cash" DECIMAL(10,2) NOT NULL,
    "cash_variance" DECIMAL(10,2) NOT NULL,
    "variance_percentage" DECIMAL(5,2) NOT NULL,
    "variance_approved" BOOLEAN NOT NULL DEFAULT false,
    "variance_approved_by" UUID,
    "variance_approved_at" TIMESTAMPTZ(6),
    "variance_reason" VARCHAR(500),

    -- Lottery Totals (optional)
    "lottery_sales" DECIMAL(12,2),
    "lottery_cashes" DECIMAL(12,2),
    "lottery_net" DECIMAL(12,2),
    "lottery_packs_sold" INTEGER,
    "lottery_tickets_sold" INTEGER,

    -- Fuel (optional)
    "fuel_gallons" DECIMAL(12,3),
    "fuel_sales" DECIMAL(12,2),

    -- Future-proofing
    "extra_data" JSONB,

    -- Metadata
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_summaries_pkey" PRIMARY KEY ("shift_summary_id")
);

-- Unique constraint: one summary per shift
CREATE UNIQUE INDEX IF NOT EXISTS "shift_summaries_shift_id_key" ON "shift_summaries"("shift_id");

-- Performance indexes
CREATE INDEX IF NOT EXISTS "shift_summaries_store_business_date_idx" ON "shift_summaries"("store_id", "business_date");
CREATE INDEX IF NOT EXISTS "shift_summaries_business_date_idx" ON "shift_summaries"("business_date");
CREATE INDEX IF NOT EXISTS "shift_summaries_store_closed_at_idx" ON "shift_summaries"("store_id", "shift_closed_at");
CREATE INDEX IF NOT EXISTS "shift_summaries_opened_by_idx" ON "shift_summaries"("opened_by_user_id");
CREATE INDEX IF NOT EXISTS "shift_summaries_closed_by_idx" ON "shift_summaries"("closed_by_user_id");

-- Foreign keys
ALTER TABLE "shift_summaries" ADD CONSTRAINT "shift_summaries_shift_id_fkey"
    FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_summaries" ADD CONSTRAINT "shift_summaries_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_summaries" ADD CONSTRAINT "shift_summaries_opened_by_fkey"
    FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift_summaries" ADD CONSTRAINT "shift_summaries_closed_by_fkey"
    FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift_summaries" ADD CONSTRAINT "shift_summaries_cashier_fkey"
    FOREIGN KEY ("cashier_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shift_summaries" ADD CONSTRAINT "shift_summaries_variance_approver_fkey"
    FOREIGN KEY ("variance_approved_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- SHIFT TENDER SUMMARY TABLE - One row per payment method used during shift
-- ============================================================================
CREATE TABLE IF NOT EXISTS "shift_tender_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_summary_id" UUID NOT NULL,
    "tender_type_id" UUID NOT NULL,
    "tender_code" VARCHAR(50) NOT NULL,
    "tender_display_name" VARCHAR(100) NOT NULL,

    -- Totals
    "total_amount" DECIMAL(12,2) NOT NULL,
    "transaction_count" INTEGER NOT NULL,

    -- Refund Breakdown
    "refund_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "refund_count" INTEGER NOT NULL DEFAULT 0,

    -- Net
    "net_amount" DECIMAL(12,2) NOT NULL,

    -- Metadata
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_tender_summaries_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one row per tender type per shift
CREATE UNIQUE INDEX IF NOT EXISTS "shift_tender_summaries_shift_tender_key"
    ON "shift_tender_summaries"("shift_summary_id", "tender_type_id");

-- Performance indexes
CREATE INDEX IF NOT EXISTS "shift_tender_summaries_tender_code_idx" ON "shift_tender_summaries"("tender_code");
CREATE INDEX IF NOT EXISTS "shift_tender_summaries_shift_summary_idx" ON "shift_tender_summaries"("shift_summary_id");

-- Foreign keys
ALTER TABLE "shift_tender_summaries" ADD CONSTRAINT "shift_tender_summaries_shift_summary_fkey"
    FOREIGN KEY ("shift_summary_id") REFERENCES "shift_summaries"("shift_summary_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_tender_summaries" ADD CONSTRAINT "shift_tender_summaries_tender_type_fkey"
    FOREIGN KEY ("tender_type_id") REFERENCES "tender_types"("tender_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- SHIFT DEPARTMENT SUMMARY TABLE - One row per department with sales
-- ============================================================================
CREATE TABLE IF NOT EXISTS "shift_department_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_summary_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "department_code" VARCHAR(50) NOT NULL,
    "department_name" VARCHAR(100) NOT NULL,

    -- Sales Totals
    "gross_sales" DECIMAL(12,2) NOT NULL,
    "returns_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discounts_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "net_sales" DECIMAL(12,2) NOT NULL,

    -- Tax
    "tax_collected" DECIMAL(10,2) NOT NULL,

    -- Counts
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "items_sold_count" INTEGER NOT NULL DEFAULT 0,
    "items_returned_count" INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_department_summaries_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one row per department per shift
CREATE UNIQUE INDEX IF NOT EXISTS "shift_department_summaries_shift_dept_key"
    ON "shift_department_summaries"("shift_summary_id", "department_id");

-- Performance indexes
CREATE INDEX IF NOT EXISTS "shift_department_summaries_dept_code_idx" ON "shift_department_summaries"("department_code");
CREATE INDEX IF NOT EXISTS "shift_department_summaries_shift_summary_idx" ON "shift_department_summaries"("shift_summary_id");

-- Foreign keys
ALTER TABLE "shift_department_summaries" ADD CONSTRAINT "shift_department_summaries_shift_summary_fkey"
    FOREIGN KEY ("shift_summary_id") REFERENCES "shift_summaries"("shift_summary_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_department_summaries" ADD CONSTRAINT "shift_department_summaries_department_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- SHIFT TAX SUMMARY TABLE - One row per tax rate applied during shift
-- ============================================================================
CREATE TABLE IF NOT EXISTS "shift_tax_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_summary_id" UUID NOT NULL,
    "tax_rate_id" UUID NOT NULL,
    "tax_code" VARCHAR(50) NOT NULL,
    "tax_display_name" VARCHAR(100) NOT NULL,
    "tax_rate_snapshot" DECIMAL(6,5) NOT NULL,

    -- Totals
    "taxable_amount" DECIMAL(12,2) NOT NULL,
    "tax_collected" DECIMAL(10,2) NOT NULL,
    "exempt_amount" DECIMAL(12,2) NOT NULL,

    -- Counts
    "transaction_count" INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_tax_summaries_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one row per tax rate per shift
CREATE UNIQUE INDEX IF NOT EXISTS "shift_tax_summaries_shift_tax_key"
    ON "shift_tax_summaries"("shift_summary_id", "tax_rate_id");

-- Performance indexes
CREATE INDEX IF NOT EXISTS "shift_tax_summaries_tax_code_idx" ON "shift_tax_summaries"("tax_code");
CREATE INDEX IF NOT EXISTS "shift_tax_summaries_shift_summary_idx" ON "shift_tax_summaries"("shift_summary_id");

-- Foreign keys
ALTER TABLE "shift_tax_summaries" ADD CONSTRAINT "shift_tax_summaries_shift_summary_fkey"
    FOREIGN KEY ("shift_summary_id") REFERENCES "shift_summaries"("shift_summary_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_tax_summaries" ADD CONSTRAINT "shift_tax_summaries_tax_rate_fkey"
    FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("tax_rate_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- SHIFT HOURLY SUMMARY TABLE - Hourly breakdown within a shift
-- ============================================================================
CREATE TABLE IF NOT EXISTS "shift_hourly_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_summary_id" UUID NOT NULL,
    "hour_start" TIMESTAMPTZ(6) NOT NULL,
    "hour_number" INTEGER NOT NULL,

    -- Totals
    "gross_sales" DECIMAL(10,2) NOT NULL,
    "net_sales" DECIMAL(10,2) NOT NULL,
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "items_sold_count" INTEGER NOT NULL DEFAULT 0,

    -- Averages
    "avg_transaction" DECIMAL(8,2) NOT NULL,

    -- Metadata
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_hourly_summaries_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one row per hour per shift
CREATE UNIQUE INDEX IF NOT EXISTS "shift_hourly_summaries_shift_hour_key"
    ON "shift_hourly_summaries"("shift_summary_id", "hour_number");

-- Performance indexes
CREATE INDEX IF NOT EXISTS "shift_hourly_summaries_shift_summary_idx" ON "shift_hourly_summaries"("shift_summary_id");
CREATE INDEX IF NOT EXISTS "shift_hourly_summaries_hour_start_idx" ON "shift_hourly_summaries"("hour_start");

-- Foreign keys
ALTER TABLE "shift_hourly_summaries" ADD CONSTRAINT "shift_hourly_summaries_shift_summary_fkey"
    FOREIGN KEY ("shift_summary_id") REFERENCES "shift_summaries"("shift_summary_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- COMMENTS - Documentation for the tables
-- ============================================================================
COMMENT ON TABLE "shift_summaries" IS 'Pre-aggregated shift summary created when shift is closed. Primary source for shift reports.';
COMMENT ON TABLE "shift_tender_summaries" IS 'Payment method breakdown per shift. One row per tender type used.';
COMMENT ON TABLE "shift_department_summaries" IS 'Department sales breakdown per shift. One row per department with activity.';
COMMENT ON TABLE "shift_tax_summaries" IS 'Tax collection breakdown per shift. One row per tax rate applied.';
COMMENT ON TABLE "shift_hourly_summaries" IS 'Hourly breakdown of sales within a shift for time-based analysis.';
