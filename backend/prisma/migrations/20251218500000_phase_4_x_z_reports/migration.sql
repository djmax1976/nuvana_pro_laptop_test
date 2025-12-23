-- Phase 4: X/Z Reports
-- Creates X Report and Z Report tables for mid-shift and end-of-shift reporting

-- ============================================================================
-- X REPORT - Mid-Shift Snapshot (Phase 4.1)
-- ============================================================================
-- Point-in-time snapshot of shift data generated on demand.
-- Multiple X Reports can be generated per shift for interim reporting.

CREATE TABLE x_reports (
    x_report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference
    shift_id UUID NOT NULL,
    store_id UUID NOT NULL,
    report_number INTEGER NOT NULL,

    -- Timing
    generated_at TIMESTAMPTZ(6) NOT NULL,
    generated_by UUID NOT NULL,

    -- Snapshot Data
    gross_sales DECIMAL(14, 2) NOT NULL,
    returns_total DECIMAL(12, 2) NOT NULL,
    discounts_total DECIMAL(12, 2) NOT NULL,
    net_sales DECIMAL(14, 2) NOT NULL,
    tax_collected DECIMAL(12, 2) NOT NULL,
    transaction_count INTEGER NOT NULL,

    -- Item Counts
    items_sold_count INTEGER NOT NULL DEFAULT 0,
    items_returned_count INTEGER NOT NULL DEFAULT 0,

    -- Cash Drawer State
    opening_cash DECIMAL(10, 2) NOT NULL,
    expected_cash DECIMAL(10, 2) NOT NULL,

    -- Breakdowns (JSONB)
    tender_breakdown JSONB NOT NULL,
    department_breakdown JSONB NOT NULL,

    -- Lottery (optional)
    lottery_sales DECIMAL(12, 2),
    lottery_cashes DECIMAL(12, 2),
    lottery_tickets_sold INTEGER,

    -- Printed/Exported Tracking
    was_printed BOOLEAN NOT NULL DEFAULT FALSE,
    print_count INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT x_reports_shift_id_fkey FOREIGN KEY (shift_id)
        REFERENCES shifts(shift_id) ON DELETE CASCADE,
    CONSTRAINT x_reports_store_id_fkey FOREIGN KEY (store_id)
        REFERENCES stores(store_id) ON DELETE CASCADE,
    CONSTRAINT x_reports_generated_by_fkey FOREIGN KEY (generated_by)
        REFERENCES users(user_id),
    CONSTRAINT x_reports_shift_report_unique UNIQUE (shift_id, report_number)
);

-- Indexes for X Reports
CREATE INDEX x_reports_shift_id_report_number_idx ON x_reports (shift_id, report_number);
CREATE INDEX x_reports_store_id_generated_at_idx ON x_reports (store_id, generated_at);
CREATE INDEX x_reports_generated_at_idx ON x_reports (generated_at);

-- ============================================================================
-- Z REPORT - End-of-Shift Final Snapshot (Phase 4.2)
-- ============================================================================
-- Permanent, immutable record of shift totals generated at shift close.
-- One Z Report per shift - represents the official, final shift record.

CREATE TABLE z_reports (
    z_report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference (unique constraints for one-to-one relationships)
    shift_id UUID NOT NULL UNIQUE,
    shift_summary_id UUID NOT NULL UNIQUE,
    store_id UUID NOT NULL,
    business_date DATE NOT NULL,

    -- Timing
    generated_at TIMESTAMPTZ(6) NOT NULL,
    generated_by UUID NOT NULL,

    -- Z Report Specific
    z_number INTEGER NOT NULL,

    -- Complete Snapshot Data (JSONB for archival)
    report_data JSONB NOT NULL,

    -- Printed/Exported Tracking
    was_printed BOOLEAN NOT NULL DEFAULT FALSE,
    print_count INTEGER NOT NULL DEFAULT 0,
    was_exported BOOLEAN NOT NULL DEFAULT FALSE,
    export_format VARCHAR(20),

    -- Digital Signature
    signature_hash VARCHAR(64),

    -- Metadata
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT z_reports_shift_id_fkey FOREIGN KEY (shift_id)
        REFERENCES shifts(shift_id) ON DELETE CASCADE,
    CONSTRAINT z_reports_shift_summary_id_fkey FOREIGN KEY (shift_summary_id)
        REFERENCES shift_summaries(shift_summary_id) ON DELETE CASCADE,
    CONSTRAINT z_reports_store_id_fkey FOREIGN KEY (store_id)
        REFERENCES stores(store_id) ON DELETE CASCADE,
    CONSTRAINT z_reports_generated_by_fkey FOREIGN KEY (generated_by)
        REFERENCES users(user_id),
    CONSTRAINT z_reports_store_z_number_unique UNIQUE (store_id, z_number)
);

-- Indexes for Z Reports
CREATE INDEX z_reports_store_id_z_number_idx ON z_reports (store_id, z_number);
CREATE INDEX z_reports_store_id_business_date_idx ON z_reports (store_id, business_date);
CREATE INDEX z_reports_generated_at_idx ON z_reports (generated_at);

-- Enable Row Level Security for both tables
ALTER TABLE x_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for X Reports
CREATE POLICY x_reports_select_policy ON x_reports
    FOR SELECT
    USING (
        store_id IN (
            SELECT store_id FROM stores WHERE company_id IN (
                SELECT company_id FROM users WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
            )
        )
    );

CREATE POLICY x_reports_insert_policy ON x_reports
    FOR INSERT
    WITH CHECK (
        store_id IN (
            SELECT store_id FROM stores WHERE company_id IN (
                SELECT company_id FROM users WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
            )
        )
    );

-- RLS Policies for Z Reports
CREATE POLICY z_reports_select_policy ON z_reports
    FOR SELECT
    USING (
        store_id IN (
            SELECT store_id FROM stores WHERE company_id IN (
                SELECT company_id FROM users WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
            )
        )
    );

CREATE POLICY z_reports_insert_policy ON z_reports
    FOR INSERT
    WITH CHECK (
        store_id IN (
            SELECT store_id FROM stores WHERE company_id IN (
                SELECT company_id FROM users WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
            )
        )
    );

-- Comments for documentation
COMMENT ON TABLE x_reports IS 'Phase 4.1: Mid-shift snapshots - multiple per shift for interim reporting';
COMMENT ON TABLE z_reports IS 'Phase 4.2: End-of-shift final snapshots - one per shift, immutable';
COMMENT ON COLUMN z_reports.z_number IS 'Sequential Z number per store for audit trail';
COMMENT ON COLUMN z_reports.report_data IS 'Complete frozen snapshot of shift summary data at close time';
COMMENT ON COLUMN z_reports.signature_hash IS 'SHA-256 hash of report_data for tamper detection';
