-- Phase 3.1: Day Summary Tables
-- This migration creates the DaySummary and related child tables for daily aggregation.
-- These tables aggregate all shift summaries for a single business day at a store.

-- ============================================================================
-- Create DaySummaryStatus enum
-- ============================================================================

CREATE TYPE "DaySummaryStatus" AS ENUM ('OPEN', 'PENDING_CLOSE', 'CLOSED');

-- ============================================================================
-- Create DaySummary table
-- ============================================================================

CREATE TABLE "day_summaries" (
    "day_summary_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,

    -- Shift counts
    "shift_count" INTEGER NOT NULL DEFAULT 0,

    -- Timing
    "first_shift_opened" TIMESTAMPTZ(6),
    "last_shift_closed" TIMESTAMPTZ(6),

    -- Sales totals (aggregated from all shifts)
    "gross_sales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "returns_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discounts_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_sales" DECIMAL(14,2) NOT NULL DEFAULT 0,

    -- Tax
    "tax_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_exempt_sales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxable_sales" DECIMAL(14,2) NOT NULL DEFAULT 0,

    -- Transaction counts
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "void_count" INTEGER NOT NULL DEFAULT 0,
    "refund_count" INTEGER NOT NULL DEFAULT 0,
    "customer_count" INTEGER NOT NULL DEFAULT 0,

    -- Item counts
    "items_sold_count" INTEGER NOT NULL DEFAULT 0,
    "items_returned_count" INTEGER NOT NULL DEFAULT 0,

    -- Averages
    "avg_transaction" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avg_items_per_txn" DECIMAL(6,2) NOT NULL DEFAULT 0,

    -- Cash reconciliation (aggregated)
    "total_opening_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_closing_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_expected_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_cash_variance" DECIMAL(10,2) NOT NULL DEFAULT 0,

    -- Lottery (optional)
    "lottery_sales" DECIMAL(12,2),
    "lottery_cashes" DECIMAL(12,2),
    "lottery_net" DECIMAL(12,2),
    "lottery_packs_sold" INTEGER,
    "lottery_tickets_sold" INTEGER,

    -- Fuel (optional)
    "fuel_gallons" DECIMAL(14,3),
    "fuel_sales" DECIMAL(14,2),

    -- Status & closing
    "status" "DaySummaryStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,

    -- Manager notes
    "notes" TEXT,

    -- Future-proofing
    "extra_data" JSONB,

    -- Metadata
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_summaries_pkey" PRIMARY KEY ("day_summary_id")
);

-- ============================================================================
-- Create DayTenderSummary table
-- ============================================================================

CREATE TABLE "day_tender_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "day_summary_id" UUID NOT NULL,

    -- Tender identification
    "tender_type_id" UUID NOT NULL,
    "tender_code" VARCHAR(50) NOT NULL,
    "tender_display_name" VARCHAR(100) NOT NULL,

    -- Totals
    "total_amount" DECIMAL(14,2) NOT NULL,
    "transaction_count" INTEGER NOT NULL,

    -- Refund breakdown
    "refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refund_count" INTEGER NOT NULL DEFAULT 0,

    -- Net
    "net_amount" DECIMAL(14,2) NOT NULL,

    -- Metadata
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_tender_summaries_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Create DayDepartmentSummary table
-- ============================================================================

CREATE TABLE "day_department_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "day_summary_id" UUID NOT NULL,

    -- Department identification
    "department_id" UUID NOT NULL,
    "department_code" VARCHAR(50) NOT NULL,
    "department_name" VARCHAR(100) NOT NULL,

    -- Sales totals
    "gross_sales" DECIMAL(14,2) NOT NULL,
    "returns_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discounts_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_sales" DECIMAL(14,2) NOT NULL,

    -- Tax
    "tax_collected" DECIMAL(12,2) NOT NULL,

    -- Counts
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "items_sold_count" INTEGER NOT NULL DEFAULT 0,
    "items_returned_count" INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_department_summaries_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Create DayTaxSummary table
-- ============================================================================

CREATE TABLE "day_tax_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "day_summary_id" UUID NOT NULL,

    -- Tax identification
    "tax_rate_id" UUID NOT NULL,
    "tax_code" VARCHAR(50) NOT NULL,
    "tax_display_name" VARCHAR(100) NOT NULL,
    "tax_rate_snapshot" DECIMAL(6,5) NOT NULL,

    -- Totals
    "taxable_amount" DECIMAL(14,2) NOT NULL,
    "tax_collected" DECIMAL(12,2) NOT NULL,
    "exempt_amount" DECIMAL(14,2) NOT NULL,

    -- Counts
    "transaction_count" INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_tax_summaries_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Create DayHourlySummary table
-- ============================================================================

CREATE TABLE "day_hourly_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "day_summary_id" UUID NOT NULL,

    -- Time period
    "hour_start" TIMESTAMPTZ(6) NOT NULL,
    "hour_number" INTEGER NOT NULL,

    -- Totals
    "gross_sales" DECIMAL(12,2) NOT NULL,
    "net_sales" DECIMAL(12,2) NOT NULL,
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "items_sold_count" INTEGER NOT NULL DEFAULT 0,

    -- Averages
    "avg_transaction" DECIMAL(10,2) NOT NULL,

    -- Metadata
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_hourly_summaries_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Add Foreign Key constraints for DaySummary
-- ============================================================================

ALTER TABLE "day_summaries" ADD CONSTRAINT "day_summaries_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "day_summaries" ADD CONSTRAINT "day_summaries_closed_by_fkey"
    FOREIGN KEY ("closed_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Add Foreign Key constraints for DayTenderSummary
-- ============================================================================

ALTER TABLE "day_tender_summaries" ADD CONSTRAINT "day_tender_summaries_day_summary_id_fkey"
    FOREIGN KEY ("day_summary_id") REFERENCES "day_summaries"("day_summary_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "day_tender_summaries" ADD CONSTRAINT "day_tender_summaries_tender_type_id_fkey"
    FOREIGN KEY ("tender_type_id") REFERENCES "tender_types"("tender_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Add Foreign Key constraints for DayDepartmentSummary
-- ============================================================================

ALTER TABLE "day_department_summaries" ADD CONSTRAINT "day_department_summaries_day_summary_id_fkey"
    FOREIGN KEY ("day_summary_id") REFERENCES "day_summaries"("day_summary_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "day_department_summaries" ADD CONSTRAINT "day_department_summaries_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Add Foreign Key constraints for DayTaxSummary
-- ============================================================================

ALTER TABLE "day_tax_summaries" ADD CONSTRAINT "day_tax_summaries_day_summary_id_fkey"
    FOREIGN KEY ("day_summary_id") REFERENCES "day_summaries"("day_summary_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "day_tax_summaries" ADD CONSTRAINT "day_tax_summaries_tax_rate_id_fkey"
    FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("tax_rate_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Add Foreign Key constraints for DayHourlySummary
-- ============================================================================

ALTER TABLE "day_hourly_summaries" ADD CONSTRAINT "day_hourly_summaries_day_summary_id_fkey"
    FOREIGN KEY ("day_summary_id") REFERENCES "day_summaries"("day_summary_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Add Unique constraints
-- ============================================================================

-- One day summary per store per business date
CREATE UNIQUE INDEX "day_summaries_store_id_business_date_key"
    ON "day_summaries"("store_id", "business_date");

-- One tender summary per day per tender type
CREATE UNIQUE INDEX "day_tender_summaries_day_summary_id_tender_type_id_key"
    ON "day_tender_summaries"("day_summary_id", "tender_type_id");

-- One department summary per day per department
CREATE UNIQUE INDEX "day_department_summaries_day_summary_id_department_id_key"
    ON "day_department_summaries"("day_summary_id", "department_id");

-- One tax summary per day per tax rate
CREATE UNIQUE INDEX "day_tax_summaries_day_summary_id_tax_rate_id_key"
    ON "day_tax_summaries"("day_summary_id", "tax_rate_id");

-- One hourly summary per day per hour
CREATE UNIQUE INDEX "day_hourly_summaries_day_summary_id_hour_number_key"
    ON "day_hourly_summaries"("day_summary_id", "hour_number");

-- ============================================================================
-- Add Performance indexes
-- ============================================================================

-- DaySummary indexes
CREATE INDEX "day_summaries_store_id_business_date_idx" ON "day_summaries"("store_id", "business_date");
CREATE INDEX "day_summaries_business_date_idx" ON "day_summaries"("business_date");
CREATE INDEX "day_summaries_status_idx" ON "day_summaries"("status");

-- DayTenderSummary indexes
CREATE INDEX "day_tender_summaries_tender_code_idx" ON "day_tender_summaries"("tender_code");
CREATE INDEX "day_tender_summaries_day_summary_id_idx" ON "day_tender_summaries"("day_summary_id");

-- DayDepartmentSummary indexes
CREATE INDEX "day_department_summaries_department_code_idx" ON "day_department_summaries"("department_code");
CREATE INDEX "day_department_summaries_day_summary_id_idx" ON "day_department_summaries"("day_summary_id");

-- DayTaxSummary indexes
CREATE INDEX "day_tax_summaries_tax_code_idx" ON "day_tax_summaries"("tax_code");
CREATE INDEX "day_tax_summaries_day_summary_id_idx" ON "day_tax_summaries"("day_summary_id");

-- DayHourlySummary indexes
CREATE INDEX "day_hourly_summaries_day_summary_id_idx" ON "day_hourly_summaries"("day_summary_id");
CREATE INDEX "day_hourly_summaries_hour_start_idx" ON "day_hourly_summaries"("hour_start");

-- ============================================================================
-- Add trigger for updated_at on day_summaries
-- ============================================================================

CREATE OR REPLACE FUNCTION update_day_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER day_summaries_updated_at_trigger
    BEFORE UPDATE ON "day_summaries"
    FOR EACH ROW
    EXECUTE FUNCTION update_day_summaries_updated_at();

-- ============================================================================
-- Add RLS policies for tenant isolation
-- ============================================================================

-- Enable RLS on all day summary tables
ALTER TABLE "day_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "day_tender_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "day_department_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "day_tax_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "day_hourly_summaries" ENABLE ROW LEVEL SECURITY;

-- DaySummary policies - inherit from store access
CREATE POLICY "day_summaries_tenant_isolation" ON "day_summaries"
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "stores" s
            WHERE s.store_id = "day_summaries".store_id
            AND (
                -- Super admin sees all
                current_setting('app.user_role', true) = 'SUPER_ADMIN'
                OR
                -- Company owner sees their stores
                (current_setting('app.user_role', true) = 'CLIENT_OWNER' AND s.company_id::text = current_setting('app.company_id', true))
                OR
                -- Store manager sees their store
                (current_setting('app.user_role', true) = 'STORE_MANAGER' AND s.store_id::text = current_setting('app.store_id', true))
                OR
                -- Store user sees their store
                (current_setting('app.user_role', true) = 'CLIENT_USER' AND s.store_id::text = current_setting('app.store_id', true))
            )
        )
    );

-- DayTenderSummary policies - inherit from parent day_summary
CREATE POLICY "day_tender_summaries_tenant_isolation" ON "day_tender_summaries"
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "day_summaries" ds
            JOIN "stores" s ON s.store_id = ds.store_id
            WHERE ds.day_summary_id = "day_tender_summaries".day_summary_id
            AND (
                current_setting('app.user_role', true) = 'SUPER_ADMIN'
                OR (current_setting('app.user_role', true) = 'CLIENT_OWNER' AND s.company_id::text = current_setting('app.company_id', true))
                OR (current_setting('app.user_role', true) = 'STORE_MANAGER' AND s.store_id::text = current_setting('app.store_id', true))
                OR (current_setting('app.user_role', true) = 'CLIENT_USER' AND s.store_id::text = current_setting('app.store_id', true))
            )
        )
    );

-- DayDepartmentSummary policies
CREATE POLICY "day_department_summaries_tenant_isolation" ON "day_department_summaries"
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "day_summaries" ds
            JOIN "stores" s ON s.store_id = ds.store_id
            WHERE ds.day_summary_id = "day_department_summaries".day_summary_id
            AND (
                current_setting('app.user_role', true) = 'SUPER_ADMIN'
                OR (current_setting('app.user_role', true) = 'CLIENT_OWNER' AND s.company_id::text = current_setting('app.company_id', true))
                OR (current_setting('app.user_role', true) = 'STORE_MANAGER' AND s.store_id::text = current_setting('app.store_id', true))
                OR (current_setting('app.user_role', true) = 'CLIENT_USER' AND s.store_id::text = current_setting('app.store_id', true))
            )
        )
    );

-- DayTaxSummary policies
CREATE POLICY "day_tax_summaries_tenant_isolation" ON "day_tax_summaries"
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "day_summaries" ds
            JOIN "stores" s ON s.store_id = ds.store_id
            WHERE ds.day_summary_id = "day_tax_summaries".day_summary_id
            AND (
                current_setting('app.user_role', true) = 'SUPER_ADMIN'
                OR (current_setting('app.user_role', true) = 'CLIENT_OWNER' AND s.company_id::text = current_setting('app.company_id', true))
                OR (current_setting('app.user_role', true) = 'STORE_MANAGER' AND s.store_id::text = current_setting('app.store_id', true))
                OR (current_setting('app.user_role', true) = 'CLIENT_USER' AND s.store_id::text = current_setting('app.store_id', true))
            )
        )
    );

-- DayHourlySummary policies
CREATE POLICY "day_hourly_summaries_tenant_isolation" ON "day_hourly_summaries"
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "day_summaries" ds
            JOIN "stores" s ON s.store_id = ds.store_id
            WHERE ds.day_summary_id = "day_hourly_summaries".day_summary_id
            AND (
                current_setting('app.user_role', true) = 'SUPER_ADMIN'
                OR (current_setting('app.user_role', true) = 'CLIENT_OWNER' AND s.company_id::text = current_setting('app.company_id', true))
                OR (current_setting('app.user_role', true) = 'STORE_MANAGER' AND s.store_id::text = current_setting('app.store_id', true))
                OR (current_setting('app.user_role', true) = 'CLIENT_USER' AND s.store_id::text = current_setting('app.store_id', true))
            )
        )
    );

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE "day_summaries" IS 'Daily aggregated summary of all shifts for a business day. Phase 3.1 of Shift & Day Summary implementation.';
COMMENT ON TABLE "day_tender_summaries" IS 'Daily payment method breakdown aggregated from all shifts. Phase 3.2.';
COMMENT ON TABLE "day_department_summaries" IS 'Daily department sales breakdown aggregated from all shifts. Phase 3.3.';
COMMENT ON TABLE "day_tax_summaries" IS 'Daily tax collection breakdown aggregated from all shifts. Phase 3.4.';
COMMENT ON TABLE "day_hourly_summaries" IS 'Daily hourly traffic breakdown aggregated from all shifts. Phase 3.5.';

COMMENT ON COLUMN "day_summaries"."status" IS 'OPEN = day in progress, PENDING_CLOSE = all shifts closed, CLOSED = day finalized';
COMMENT ON COLUMN "day_summaries"."business_date" IS 'The logical business day (may differ from calendar date based on store timezone/cutoff)';
