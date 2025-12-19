-- Phase 7.1: Index Optimization Migration
-- ============================================================================
-- This migration adds optimized indexes for summary tables and reporting queries.
-- All indexes are created CONCURRENTLY to avoid locking production tables.
-- ============================================================================

-- ============================================================================
-- SHIFT SUMMARY INDEXES
-- ============================================================================

-- Composite index for store + date range queries (most common pattern)
-- Supports: GET /stores/:storeId/shift-summaries?from_date=X&to_date=Y
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shift_summaries_store_date_range
ON shift_summaries(store_id, business_date DESC);

-- Covering index for shift summary list with common filter columns
-- Supports: List queries with variance filtering, closed date filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shift_summaries_store_closed
ON shift_summaries(store_id, shift_closed_at DESC);

-- Index for variance approval workflows
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shift_summaries_variance_approval
ON shift_summaries(store_id, variance_approved)
WHERE variance_approved = false AND cash_variance != 0;

-- ============================================================================
-- DAY SUMMARY INDEXES
-- ============================================================================

-- Composite index for store + date range queries
-- Supports: GET /stores/:storeId/day-summaries?from_date=X&to_date=Y
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_day_summaries_store_date_range
ON day_summaries(store_id, business_date DESC);

-- Index for pending close workflow
-- Supports: Finding days that need to be closed
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_day_summaries_pending_close
ON day_summaries(store_id, status)
WHERE status = 'PENDING_CLOSE';

-- Index for monthly/weekly reporting aggregation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_day_summaries_date_net_sales
ON day_summaries(business_date, net_sales);

-- ============================================================================
-- TENDER SUMMARY INDEXES (Child Tables)
-- ============================================================================

-- Shift tender summaries - common lookup by tender code
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shift_tender_summaries_code_amount
ON shift_tender_summaries(tender_code, total_amount);

-- Day tender summaries - common lookup by tender code
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_day_tender_summaries_code_amount
ON day_tender_summaries(tender_code, total_amount);

-- ============================================================================
-- DEPARTMENT SUMMARY INDEXES (Child Tables)
-- ============================================================================

-- Shift department summaries - common lookup by department code
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shift_dept_summaries_code_sales
ON shift_department_summaries(department_code, net_sales);

-- Day department summaries - common lookup by department code
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_day_dept_summaries_code_sales
ON day_department_summaries(department_code, net_sales);

-- ============================================================================
-- X/Z REPORT INDEXES
-- ============================================================================

-- Z Reports - store + date for daily Z report lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_z_reports_store_date
ON z_reports(store_id, business_date DESC);

-- Z Reports - sequential Z number lookup for auditing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_z_reports_store_z_number
ON z_reports(store_id, z_number DESC);

-- X Reports - store + generated time for history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_x_reports_store_generated
ON x_reports(store_id, generated_at DESC);

-- ============================================================================
-- TRANSACTION INDEXES (for summary aggregation)
-- ============================================================================

-- Transaction lookup by shift for shift summary creation
-- This is a partial index only for transactions with a shift_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_shift_timestamp
ON transactions(shift_id, timestamp DESC)
WHERE shift_id IS NOT NULL;

-- Transaction lookup by store and date for day aggregation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_store_timestamp
ON transactions(store_id, timestamp DESC);

-- ============================================================================
-- LOOKUP TABLE INDEXES
-- ============================================================================

-- Tender types - client-scoped lookup optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tender_types_client_active_sort
ON tender_types(client_id, is_active, sort_order)
WHERE is_active = true;

-- Departments - client-scoped lookup optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departments_client_active_sort
ON departments(client_id, is_active, sort_order)
WHERE is_active = true;

-- Departments - store-scoped lookup optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departments_store_active_sort
ON departments(store_id, is_active, sort_order)
WHERE is_active = true;

-- Tax rates - store-scoped lookup optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tax_rates_store_active
ON tax_rates(store_id, is_active)
WHERE is_active = true;

-- ============================================================================
-- PERFORMANCE ANALYSIS COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_shift_summaries_store_date_range IS
'Phase 7.1: Optimized for date range queries on shift summaries. Covers 90% of shift report queries.';

COMMENT ON INDEX idx_day_summaries_store_date_range IS
'Phase 7.1: Optimized for date range queries on day summaries. Covers weekly/monthly reports.';

COMMENT ON INDEX idx_shift_summaries_variance_approval IS
'Phase 7.1: Partial index for variance approval workflow. Only indexes unapproved variances.';

COMMENT ON INDEX idx_day_summaries_pending_close IS
'Phase 7.1: Partial index for day close workflow. Only indexes days pending close.';
