-- ============================================================================
-- ROLLBACK: Phase 3 Index Optimization
-- ============================================================================
--
-- Purpose: Remove indexes created by Phase 3 migration
-- Usage: Run manually if migration needs to be reverted
--
-- Enterprise Standards Applied:
-- - DB-004: INDEXING - Document index changes and rollback procedures
--
-- WARNING:
-- - Index removal is quick but will immediately impact query performance
-- - Ensure you have a valid reason before running this rollback
-- - Consider the performance implications on production systems
--
-- To Execute:
--   psql -h HOST -U USER -d DATABASE -f ROLLBACK.sql
--
-- Or via Prisma:
--   npx prisma db execute --file ./prisma/migrations/20260107000000_phase_3_index_optimization/ROLLBACK.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: Remove Primary Composite Indexes
-- ============================================================================

DROP INDEX IF EXISTS "idx_lottery_packs_store_status_bin";
DROP INDEX IF EXISTS "idx_shifts_store_status_day_summary";

-- ============================================================================
-- SECTION 2: Remove Partial Indexes
-- ============================================================================

DROP INDEX IF EXISTS "idx_lottery_packs_store_depleted";
DROP INDEX IF EXISTS "idx_lottery_packs_store_returned";
DROP INDEX IF EXISTS "idx_lottery_packs_store_activated";
DROP INDEX IF EXISTS "idx_lottery_business_days_store_closed";

-- ============================================================================
-- SECTION 3: Remove Audit Log Index
-- ============================================================================

DROP INDEX IF EXISTS "idx_audit_logs_table_record";

COMMIT;

-- ============================================================================
-- ROLLBACK COMPLETE
-- ============================================================================
-- Total indexes removed: 7
--
-- Post-Rollback Steps:
-- 1. Monitor query performance for regressions
-- 2. Update pg_stat_user_tables to check for increased sequential scans:
--    SELECT relname, seq_scan, idx_scan FROM pg_stat_user_tables
--    WHERE relname IN ('lottery_packs', 'shifts', 'lottery_business_days', 'audit_logs');
-- 3. If performance degrades significantly, re-apply the migration
-- ============================================================================
