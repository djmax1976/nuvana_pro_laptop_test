-- ============================================================================
-- Disable FORCE ROW LEVEL SECURITY on clients table
-- ============================================================================
-- The FORCE option makes RLS apply even to the table owner. Since our app
-- connects as the database owner and uses connection pooling, the session
-- variable app.current_user_id may not persist correctly across connections.
-- By removing FORCE, the database owner (our app) can bypass RLS policies,
-- while non-owner roles would still be subject to RLS.
--
-- This is a workaround for Prisma connection pooling which doesn't guarantee
-- the same connection is used for SET and subsequent queries.
-- ============================================================================

ALTER TABLE clients NO FORCE ROW LEVEL SECURITY;
