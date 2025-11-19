-- ============================================================================
-- Force Row-Level Security on All Tables
-- Story: 2-3-row-level-security-rls-policies (Fix)
-- ============================================================================
-- This migration forces RLS to apply even to the table owner role.
-- Without FORCE ROW LEVEL SECURITY, the table owner bypasses RLS policies.
-- ============================================================================

-- Force RLS on existing tables (from original RLS migration)
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
ALTER TABLE stores FORCE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Force RLS on new tables (from shift/transaction migration)
ALTER TABLE shifts FORCE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_terminals FORCE ROW LEVEL SECURITY;
ALTER TABLE transaction_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE transaction_payments FORCE ROW LEVEL SECURITY;
