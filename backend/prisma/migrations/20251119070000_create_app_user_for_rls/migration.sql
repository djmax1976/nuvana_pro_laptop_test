-- ============================================================================
-- Create Application User for RLS Testing
-- Story: 2-3-row-level-security-rls-policies (Fix)
-- ============================================================================
-- PostgreSQL superusers (like 'postgres') bypass all RLS policies.
-- To properly enforce RLS, we need a non-superuser application role.
-- This migration creates an 'app_user' role that respects RLS policies.
-- ============================================================================

-- Create application user role (non-superuser)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'app_user_password';
  END IF;
END $$;

-- Grant necessary permissions to app_user
GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA app TO app_user;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_user;

-- Grant sequence permissions for auto-generated IDs
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Grant execute on RLS helper functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_user;
