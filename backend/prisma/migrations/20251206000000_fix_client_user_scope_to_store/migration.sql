-- Fix CLIENT_USER role scope: COMPANY -> STORE
--
-- ISSUE: CLIENT_USER was incorrectly set to COMPANY scope in migration 20251126140425
-- This allowed store login users to access ALL stores in a company instead of only their assigned store.
--
-- BUSINESS RULE: CLIENT_USER is a store login credential for physical terminal authentication.
-- It authenticates a specific physical device at a specific store location.
-- Each store login MUST only have access to its own store's MyStore Dashboard.
--
-- SECURITY: This is a tenant isolation fix - prevents cross-store data access.
-- See: OWASP Multi-Tenancy Security, DB-006 TENANT_ISOLATION
--
-- DATA INTEGRITY CHECK:
-- All existing CLIENT_USER user_roles should already have store_id set (from store.ts:3639)
-- This migration does NOT delete any data - it corrects the Role.scope to match intended behavior.

-- Verify all CLIENT_USER user_roles have store_id (safety check - will fail migration if violated)
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO invalid_count
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.role_id
    WHERE r.code = 'CLIENT_USER'
      AND ur.store_id IS NULL;

    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'DATA INTEGRITY ERROR: Found % CLIENT_USER user_roles without store_id. These must be fixed before migration.', invalid_count;
    END IF;
END $$;

-- Update CLIENT_USER role scope from COMPANY to STORE
-- This enables proper RBAC enforcement via rbac.service.ts STORE scope logic (lines 238-296)
UPDATE roles
SET scope = 'STORE',
    description = 'Store login credential for physical terminal authentication - grants access only to assigned store''s dashboard',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'CLIENT_USER';

-- Log the change for audit purposes
DO $$
BEGIN
    RAISE NOTICE 'CLIENT_USER scope updated from COMPANY to STORE - store isolation now enforced';
END $$;
