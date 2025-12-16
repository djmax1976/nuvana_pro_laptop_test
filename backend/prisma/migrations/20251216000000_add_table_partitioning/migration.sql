-- Migration: Add Table Partitioning for transactions and audit_logs
-- Purpose: Implement RANGE partitioning by month for high-volume tables
-- This enables efficient data management, faster queries, and easier archival
--
-- IMPORTANT: PostgreSQL cannot convert regular tables to partitioned tables in-place.
-- This migration creates new partitioned tables, migrates data, and replaces the originals.

-- ============================================================================
-- PART 1: TRANSACTIONS TABLE PARTITIONING
-- ============================================================================

-- Step 1.1: Drop RLS policies on child tables that reference transactions
-- These must be dropped BEFORE renaming transactions to transactions_old
DROP POLICY IF EXISTS "transaction_line_item_select_policy" ON "transaction_line_items";
DROP POLICY IF EXISTS "transaction_line_item_insert_policy" ON "transaction_line_items";
DROP POLICY IF EXISTS "transaction_line_item_update_policy" ON "transaction_line_items";
DROP POLICY IF EXISTS "transaction_line_item_delete_policy" ON "transaction_line_items";
DROP POLICY IF EXISTS "transaction_payment_select_policy" ON "transaction_payments";
DROP POLICY IF EXISTS "transaction_payment_insert_policy" ON "transaction_payments";
DROP POLICY IF EXISTS "transaction_payment_update_policy" ON "transaction_payments";
DROP POLICY IF EXISTS "transaction_payment_delete_policy" ON "transaction_payments";

-- Step 1.2: Drop foreign key constraints referencing transactions
ALTER TABLE "transaction_line_items" DROP CONSTRAINT IF EXISTS "transaction_line_items_transaction_id_fkey";
ALTER TABLE "transaction_payments" DROP CONSTRAINT IF EXISTS "transaction_payments_transaction_id_fkey";

-- Step 1.3: Drop indexes on original transactions table
DROP INDEX IF EXISTS "transactions_store_id_idx";
DROP INDEX IF EXISTS "transactions_shift_id_idx";
DROP INDEX IF EXISTS "transactions_cashier_id_idx";
DROP INDEX IF EXISTS "transactions_pos_terminal_id_idx";
DROP INDEX IF EXISTS "transactions_timestamp_idx";
DROP INDEX IF EXISTS "transactions_public_id_idx";

-- Step 1.4: Rename original table
ALTER TABLE "transactions" RENAME TO "transactions_old";
ALTER INDEX "transactions_pkey" RENAME TO "transactions_old_pkey";
ALTER INDEX "transactions_public_id_key" RENAME TO "transactions_old_public_id_key";

-- Step 1.5: Drop RLS policies on old table (they reference the table name)
DROP POLICY IF EXISTS "transaction_select_policy" ON "transactions_old";
DROP POLICY IF EXISTS "transaction_insert_policy" ON "transactions_old";
DROP POLICY IF EXISTS "transaction_update_policy" ON "transactions_old";
DROP POLICY IF EXISTS "transaction_delete_policy" ON "transactions_old";

-- Step 1.6: Create new partitioned transactions table
CREATE TABLE "transactions" (
    "transaction_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "pos_terminal_id" UUID,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "public_id" VARCHAR(30) NOT NULL,
    -- Primary key MUST include partition key for partitioned tables
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("transaction_id", "timestamp")
) PARTITION BY RANGE ("timestamp");

-- Step 1.7: Create default partition for any data outside defined ranges
CREATE TABLE "transactions_default" PARTITION OF "transactions" DEFAULT;

-- Step 1.8: Create partitions for historical and future months
-- Historical partitions (for any existing data)
CREATE TABLE "transactions_y2024m01" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE "transactions_y2024m02" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE "transactions_y2024m03" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE "transactions_y2024m04" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE "transactions_y2024m05" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE "transactions_y2024m06" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE "transactions_y2024m07" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE "transactions_y2024m08" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE "transactions_y2024m09" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE "transactions_y2024m10" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE "transactions_y2024m11" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE "transactions_y2024m12" PARTITION OF "transactions"
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- 2025 partitions
CREATE TABLE "transactions_y2025m01" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE "transactions_y2025m02" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE "transactions_y2025m03" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE "transactions_y2025m04" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE "transactions_y2025m05" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE "transactions_y2025m06" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE "transactions_y2025m07" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE "transactions_y2025m08" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE "transactions_y2025m09" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE "transactions_y2025m10" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE "transactions_y2025m11" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE "transactions_y2025m12" PARTITION OF "transactions"
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- 2026 partitions (future-proofing)
CREATE TABLE "transactions_y2026m01" PARTITION OF "transactions"
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE "transactions_y2026m02" PARTITION OF "transactions"
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE "transactions_y2026m03" PARTITION OF "transactions"
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE "transactions_y2026m04" PARTITION OF "transactions"
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE "transactions_y2026m05" PARTITION OF "transactions"
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE "transactions_y2026m06" PARTITION OF "transactions"
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Step 1.8: Create unique constraint on public_id (must include partition key)
CREATE UNIQUE INDEX "transactions_public_id_key" ON "transactions"("public_id", "timestamp");

-- Step 1.9: Create indexes on partitioned table (indexes are created on each partition automatically)
CREATE INDEX "transactions_store_id_idx" ON "transactions"("store_id");
CREATE INDEX "transactions_shift_id_idx" ON "transactions"("shift_id");
CREATE INDEX "transactions_cashier_id_idx" ON "transactions"("cashier_id");
CREATE INDEX "transactions_pos_terminal_id_idx" ON "transactions"("pos_terminal_id");
CREATE INDEX "transactions_timestamp_idx" ON "transactions"("timestamp");
CREATE INDEX "transactions_public_id_idx" ON "transactions"("public_id");
-- Composite index for common query patterns
CREATE INDEX "transactions_store_timestamp_idx" ON "transactions"("store_id", "timestamp");

-- Step 1.10: Migrate data from old table to new partitioned table
INSERT INTO "transactions"
SELECT * FROM "transactions_old";

-- Step 1.11: Re-add foreign key constraints (note: FK to partitioned table works)
-- Foreign keys FROM transactions TO other tables
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_shift_id_fkey"
    FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cashier_id_fkey"
    FOREIGN KEY ("cashier_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pos_terminal_id_fkey"
    FOREIGN KEY ("pos_terminal_id") REFERENCES "pos_terminals"("pos_terminal_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys TO transactions from other tables
-- Note: FK referencing partitioned table requires the partition key in the reference
-- Since transaction_line_items and transaction_payments only have transaction_id,
-- we need to add timestamp column or use a different approach

-- For now, we'll keep the child tables without FK constraints and rely on application-level integrity
-- This is a common pattern with partitioned tables
-- Alternative: Add timestamp to child tables (more complex migration)

-- Step 1.12: Enable RLS on partitioned table
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;

-- Step 1.13: Create RLS policies for transactions
CREATE POLICY "transaction_select_policy" ON "transactions"
    FOR SELECT
    USING (
        (app.is_system_admin() = true)
        OR (store_id = app.get_user_store_id())
        OR (store_id IN (
            SELECT s.store_id FROM stores s
            WHERE s.company_id = app.get_user_company_id()
        ))
    );

CREATE POLICY "transaction_insert_policy" ON "transactions"
    FOR INSERT
    WITH CHECK (
        (app.is_system_admin() = true)
        OR (store_id = app.get_user_store_id())
        OR (store_id IN (
            SELECT s.store_id FROM stores s
            WHERE s.company_id = app.get_user_company_id()
        ))
    );

CREATE POLICY "transaction_update_policy" ON "transactions"
    FOR UPDATE
    USING (
        (app.is_system_admin() = true)
        OR (store_id = app.get_user_store_id())
        OR (store_id IN (
            SELECT s.store_id FROM stores s
            WHERE s.company_id = app.get_user_company_id()
        ))
    );

CREATE POLICY "transaction_delete_policy" ON "transactions"
    FOR DELETE
    USING (
        (app.is_system_admin() = true)
        OR (store_id = app.get_user_store_id())
        OR (store_id IN (
            SELECT s.store_id FROM stores s
            WHERE s.company_id = app.get_user_company_id()
        ))
    );

-- Step 1.14: Drop old transactions table
DROP TABLE "transactions_old";

-- ============================================================================
-- PART 2: AUDIT_LOGS TABLE PARTITIONING
-- ============================================================================

-- Step 2.1: Rename original table
ALTER TABLE "audit_logs" RENAME TO "audit_logs_old";
ALTER INDEX "audit_logs_pkey" RENAME TO "audit_logs_old_pkey";

-- Step 2.2: Drop indexes on original audit_logs table
DROP INDEX IF EXISTS "audit_logs_user_id_idx";
DROP INDEX IF EXISTS "audit_logs_table_name_idx";
DROP INDEX IF EXISTS "audit_logs_timestamp_idx";

-- Step 2.3: Drop RLS policies on old table
DROP POLICY IF EXISTS "audit_log_select_policy" ON "audit_logs_old";
DROP POLICY IF EXISTS "audit_log_insert_policy" ON "audit_logs_old";
DROP POLICY IF EXISTS "audit_log_delete_policy" ON "audit_logs_old";

-- Step 2.4: Create new partitioned audit_logs table
CREATE TABLE "audit_logs" (
    "log_id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "table_name" VARCHAR(100) NOT NULL,
    "record_id" UUID NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "reason" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Primary key MUST include partition key
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("log_id", "timestamp")
) PARTITION BY RANGE ("timestamp");

-- Step 2.5: Create default partition
CREATE TABLE "audit_logs_default" PARTITION OF "audit_logs" DEFAULT;

-- Step 2.6: Create partitions for audit_logs
-- Historical partitions
CREATE TABLE "audit_logs_y2024m01" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE "audit_logs_y2024m02" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE "audit_logs_y2024m03" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE "audit_logs_y2024m04" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE "audit_logs_y2024m05" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE "audit_logs_y2024m06" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE "audit_logs_y2024m07" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE "audit_logs_y2024m08" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE "audit_logs_y2024m09" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE "audit_logs_y2024m10" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE "audit_logs_y2024m11" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE "audit_logs_y2024m12" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- 2025 partitions
CREATE TABLE "audit_logs_y2025m01" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE "audit_logs_y2025m02" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE "audit_logs_y2025m03" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE "audit_logs_y2025m04" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE "audit_logs_y2025m05" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE "audit_logs_y2025m06" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE "audit_logs_y2025m07" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE "audit_logs_y2025m08" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE "audit_logs_y2025m09" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE "audit_logs_y2025m10" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE "audit_logs_y2025m11" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE "audit_logs_y2025m12" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- 2026 partitions
CREATE TABLE "audit_logs_y2026m01" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE "audit_logs_y2026m02" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE "audit_logs_y2026m03" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE "audit_logs_y2026m04" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE "audit_logs_y2026m05" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE "audit_logs_y2026m06" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Step 2.7: Create indexes on partitioned audit_logs table
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_table_name_idx" ON "audit_logs"("table_name");
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");
CREATE INDEX "audit_logs_record_id_idx" ON "audit_logs"("record_id");
-- Composite indexes for common query patterns
CREATE INDEX "audit_logs_table_timestamp_idx" ON "audit_logs"("table_name", "timestamp");
CREATE INDEX "audit_logs_user_timestamp_idx" ON "audit_logs"("user_id", "timestamp");

-- Step 2.8: Migrate data from old table
INSERT INTO "audit_logs"
SELECT * FROM "audit_logs_old";

-- Step 2.9: Re-add foreign key constraint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 2.10: Enable RLS on partitioned table
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

-- Step 2.11: Create RLS policies for audit_logs
CREATE POLICY "audit_log_select_policy" ON "audit_logs"
    FOR SELECT
    USING (
        (app.is_system_admin() = true)
        OR (user_id::text = current_setting('app.current_user_id', true))
        OR (EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = audit_logs.user_id
            AND (ur.company_id = app.get_user_company_id() OR ur.store_id = app.get_user_store_id())
        ))
    );

CREATE POLICY "audit_log_insert_policy" ON "audit_logs"
    FOR INSERT
    WITH CHECK (app.is_system_admin() = true);

CREATE POLICY "audit_log_delete_policy" ON "audit_logs"
    FOR DELETE
    USING (app.is_system_admin() = true);

-- Step 2.12: Drop old audit_logs table
DROP TABLE "audit_logs_old";

-- ============================================================================
-- PART 3: CREATE PARTITION MANAGEMENT FUNCTION
-- ============================================================================

-- Function to create new monthly partitions
-- Should be called periodically (e.g., monthly cron job) to create future partitions
CREATE OR REPLACE FUNCTION create_monthly_partitions(
    p_table_name TEXT,
    p_start_date DATE,
    p_end_date DATE
) RETURNS void AS $$
DECLARE
    v_partition_name TEXT;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_start_date := date_trunc('month', p_start_date)::DATE;

    WHILE v_start_date < p_end_date LOOP
        v_end_date := (v_start_date + INTERVAL '1 month')::DATE;
        v_partition_name := p_table_name || '_y' ||
                          to_char(v_start_date, 'YYYY') || 'm' ||
                          to_char(v_start_date, 'MM');

        -- Check if partition already exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = v_partition_name
            AND n.nspname = 'public'
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                v_partition_name,
                p_table_name,
                v_start_date,
                v_end_date
            );
            RAISE NOTICE 'Created partition: %', v_partition_name;
        END IF;

        v_start_date := v_end_date;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 4: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on partitioned tables to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "transactions" TO app_user;
GRANT SELECT, INSERT ON "audit_logs" TO app_user;

-- Grant permissions on all partition tables
DO $$
DECLARE
    partition_table RECORD;
BEGIN
    FOR partition_table IN
        SELECT c.relname as table_name
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        JOIN pg_class p ON p.oid = i.inhparent
        WHERE p.relname IN ('transactions', 'audit_logs')
    LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', partition_table.table_name);
    END LOOP;
END $$;

-- ============================================================================
-- PART 5: ADD COMMENTS
-- ============================================================================

COMMENT ON TABLE "transactions" IS 'Partitioned table for POS transactions. Partitioned by month on timestamp column for efficient querying and data lifecycle management.';
COMMENT ON TABLE "audit_logs" IS 'Partitioned table for audit trail logs. Partitioned by month on timestamp column for efficient querying and compliance retention.';

COMMENT ON FUNCTION create_monthly_partitions(TEXT, DATE, DATE) IS 'Utility function to create new monthly partitions for tables. Call periodically to ensure future partitions exist.';

-- ============================================================================
-- PART 6: RECREATE RLS POLICIES FOR CHILD TABLES
-- ============================================================================

-- Recreate RLS policies for transaction_line_items (referencing new partitioned transactions table)
CREATE POLICY "transaction_line_item_select_policy" ON "transaction_line_items"
    FOR SELECT
    USING (
        (app.is_system_admin() = true)
        OR (transaction_id IN (
            SELECT t.transaction_id FROM transactions t
            WHERE t.store_id = app.get_user_store_id()
            OR t.store_id IN (
                SELECT s.store_id FROM stores s
                WHERE s.company_id = app.get_user_company_id()
            )
        ))
    );

CREATE POLICY "transaction_line_item_insert_policy" ON "transaction_line_items"
    FOR INSERT
    WITH CHECK (
        (app.is_system_admin() = true)
        OR (transaction_id IN (
            SELECT t.transaction_id FROM transactions t
            WHERE t.store_id = app.get_user_store_id()
            OR t.store_id IN (
                SELECT s.store_id FROM stores s
                WHERE s.company_id = app.get_user_company_id()
            )
        ))
    );

CREATE POLICY "transaction_line_item_update_policy" ON "transaction_line_items"
    FOR UPDATE
    USING (
        (app.is_system_admin() = true)
        OR (transaction_id IN (
            SELECT t.transaction_id FROM transactions t
            WHERE t.store_id = app.get_user_store_id()
            OR t.store_id IN (
                SELECT s.store_id FROM stores s
                WHERE s.company_id = app.get_user_company_id()
            )
        ))
    );

CREATE POLICY "transaction_line_item_delete_policy" ON "transaction_line_items"
    FOR DELETE
    USING (
        (app.is_system_admin() = true)
        OR (transaction_id IN (
            SELECT t.transaction_id FROM transactions t
            WHERE t.store_id = app.get_user_store_id()
            OR t.store_id IN (
                SELECT s.store_id FROM stores s
                WHERE s.company_id = app.get_user_company_id()
            )
        ))
    );

-- Recreate RLS policies for transaction_payments
CREATE POLICY "transaction_payment_select_policy" ON "transaction_payments"
    FOR SELECT
    USING (
        (app.is_system_admin() = true)
        OR (transaction_id IN (
            SELECT t.transaction_id FROM transactions t
            WHERE t.store_id = app.get_user_store_id()
            OR t.store_id IN (
                SELECT s.store_id FROM stores s
                WHERE s.company_id = app.get_user_company_id()
            )
        ))
    );

CREATE POLICY "transaction_payment_insert_policy" ON "transaction_payments"
    FOR INSERT
    WITH CHECK (
        (app.is_system_admin() = true)
        OR (transaction_id IN (
            SELECT t.transaction_id FROM transactions t
            WHERE t.store_id = app.get_user_store_id()
            OR t.store_id IN (
                SELECT s.store_id FROM stores s
                WHERE s.company_id = app.get_user_company_id()
            )
        ))
    );

CREATE POLICY "transaction_payment_update_policy" ON "transaction_payments"
    FOR UPDATE
    USING (
        (app.is_system_admin() = true)
        OR (transaction_id IN (
            SELECT t.transaction_id FROM transactions t
            WHERE t.store_id = app.get_user_store_id()
            OR t.store_id IN (
                SELECT s.store_id FROM stores s
                WHERE s.company_id = app.get_user_company_id()
            )
        ))
    );

CREATE POLICY "transaction_payment_delete_policy" ON "transaction_payments"
    FOR DELETE
    USING (
        (app.is_system_admin() = true)
        OR (transaction_id IN (
            SELECT t.transaction_id FROM transactions t
            WHERE t.store_id = app.get_user_store_id()
            OR t.store_id IN (
                SELECT s.store_id FROM stores s
                WHERE s.company_id = app.get_user_company_id()
            )
        ))
    );
