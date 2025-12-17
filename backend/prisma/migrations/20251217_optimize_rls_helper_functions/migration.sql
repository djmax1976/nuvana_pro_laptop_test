-- ============================================================================
-- Optimize RLS Helper Functions for Performance
-- Story: Enterprise-Grade Auth/RBAC Optimization - Phase 2
-- ============================================================================
-- This migration updates RLS helper functions to use session variables
-- set by the application layer from JWT claims, eliminating the circular
-- dependency where helper functions query user_roles table which itself
-- has RLS policies.
--
-- BEFORE: app.is_system_admin() queries user_roles -> triggers RLS -> calls app.is_system_admin()
-- AFTER:  app.is_system_admin() reads session variable set from JWT (no DB query)
-- ============================================================================

-- ============================================================================
-- STEP 1: Update is_system_admin() to use session variable
-- ============================================================================
-- Instead of querying database, read from session variable set by application
-- Falls back to database query if session variable not set (backward compatibility)

CREATE OR REPLACE FUNCTION app.is_system_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_is_admin TEXT;
  v_user_id UUID;
  v_is_admin_db BOOLEAN;
BEGIN
  -- First, try to get from session variable (fast path - set by application from JWT)
  v_is_admin := current_setting('app.is_admin', true);

  IF v_is_admin IS NOT NULL AND v_is_admin != '' THEN
    RETURN v_is_admin = 'true';
  END IF;

  -- Fallback: Query database (slow path - for backward compatibility)
  -- This path is used when session variable is not set
  v_user_id := current_setting('app.current_user_id', true)::UUID;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if user has SUPERADMIN role with SYSTEM scope
  -- Note: This query doesn't trigger RLS recursion because we check
  -- user_id directly, which is allowed by the escape hatch in user_roles RLS policy
  SELECT EXISTS(
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.role_id
    WHERE ur.user_id = v_user_id
      AND r.scope = 'SYSTEM'
      AND r.code = 'SUPERADMIN'
  ) INTO v_is_admin_db;

  RETURN COALESCE(v_is_admin_db, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 2: Update get_user_company_id() to use session variable
-- ============================================================================
-- Read company_ids from session variable, return first one
-- Falls back to database query if not set

CREATE OR REPLACE FUNCTION app.get_user_company_id()
RETURNS UUID AS $$
DECLARE
  v_company_ids TEXT;
  v_company_id UUID;
  v_user_id UUID;
BEGIN
  -- First, try to get from session variable (fast path)
  v_company_ids := current_setting('app.company_ids', true);

  IF v_company_ids IS NOT NULL AND v_company_ids != '' THEN
    -- Return first company_id from comma-separated list
    v_company_id := split_part(v_company_ids, ',', 1)::UUID;
    RETURN v_company_id;
  END IF;

  -- Fallback: Query database (slow path)
  v_user_id := current_setting('app.current_user_id', true)::UUID;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Find COMPANY scope role for this user
  SELECT ur.company_id INTO v_company_id
  FROM user_roles ur
  JOIN roles r ON ur.role_id = r.role_id
  WHERE ur.user_id = v_user_id
    AND r.scope = 'COMPANY'
    AND ur.company_id IS NOT NULL
  LIMIT 1;

  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 3: Update get_user_store_id() to use session variable
-- ============================================================================
-- Read store_ids from session variable, return first one
-- Falls back to database query if not set

CREATE OR REPLACE FUNCTION app.get_user_store_id()
RETURNS UUID AS $$
DECLARE
  v_store_ids TEXT;
  v_store_id UUID;
  v_user_id UUID;
BEGIN
  -- First, try to get from session variable (fast path)
  v_store_ids := current_setting('app.store_ids', true);

  IF v_store_ids IS NOT NULL AND v_store_ids != '' THEN
    -- Return first store_id from comma-separated list
    v_store_id := split_part(v_store_ids, ',', 1)::UUID;
    RETURN v_store_id;
  END IF;

  -- Fallback: Query database (slow path)
  v_user_id := current_setting('app.current_user_id', true)::UUID;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Find STORE scope role for this user
  SELECT ur.store_id INTO v_store_id
  FROM user_roles ur
  JOIN roles r ON ur.role_id = r.role_id
  WHERE ur.user_id = v_user_id
    AND r.scope = 'STORE'
    AND ur.store_id IS NOT NULL
  LIMIT 1;

  RETURN v_store_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 4: Add new helper function to check if user has access to specific company
-- ============================================================================
-- This function checks if a company_id is in the user's company_ids list
-- More efficient than the old approach for multi-company access checks

CREATE OR REPLACE FUNCTION app.user_has_company_access(check_company_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_company_ids TEXT;
  v_is_admin BOOLEAN;
BEGIN
  -- System admins have access to all companies
  v_is_admin := app.is_system_admin();
  IF v_is_admin THEN
    RETURN TRUE;
  END IF;

  -- Check if company_id is in user's company_ids list
  v_company_ids := current_setting('app.company_ids', true);

  IF v_company_ids IS NOT NULL AND v_company_ids != '' THEN
    RETURN check_company_id::TEXT = ANY(string_to_array(v_company_ids, ','));
  END IF;

  -- Fallback: Check via get_user_company_id
  RETURN app.get_user_company_id() = check_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 5: Add new helper function to check if user has access to specific store
-- ============================================================================
-- This function checks if a store_id is in the user's store_ids list
-- or if user has company-level access to the store's company

CREATE OR REPLACE FUNCTION app.user_has_store_access(check_store_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_store_ids TEXT;
  v_company_ids TEXT;
  v_store_company_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- System admins have access to all stores
  v_is_admin := app.is_system_admin();
  IF v_is_admin THEN
    RETURN TRUE;
  END IF;

  -- Check if store_id is in user's store_ids list (direct store access)
  v_store_ids := current_setting('app.store_ids', true);
  IF v_store_ids IS NOT NULL AND v_store_ids != '' THEN
    IF check_store_id::TEXT = ANY(string_to_array(v_store_ids, ',')) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Check if user has company-level access to this store
  v_company_ids := current_setting('app.company_ids', true);
  IF v_company_ids IS NOT NULL AND v_company_ids != '' THEN
    -- Get the store's company_id
    SELECT company_id INTO v_store_company_id
    FROM stores
    WHERE store_id = check_store_id;

    IF v_store_company_id IS NOT NULL THEN
      RETURN v_store_company_id::TEXT = ANY(string_to_array(v_company_ids, ','));
    END IF;
  END IF;

  -- Fallback: Use old logic
  RETURN app.get_user_store_id() = check_store_id
         OR app.get_user_company_id() = (SELECT company_id FROM stores WHERE store_id = check_store_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 6: Add comments documenting the session variables
-- ============================================================================

COMMENT ON FUNCTION app.is_system_admin() IS
'Returns TRUE if user is a system admin. Uses app.is_admin session variable (fast path)
or queries database (slow path). Set app.is_admin from JWT claims for best performance.';

COMMENT ON FUNCTION app.get_user_company_id() IS
'Returns first company_id the user has access to. Uses app.company_ids session variable (fast path)
or queries database (slow path). Set app.company_ids from JWT claims for best performance.';

COMMENT ON FUNCTION app.get_user_store_id() IS
'Returns first store_id the user has access to. Uses app.store_ids session variable (fast path)
or queries database (slow path). Set app.store_ids from JWT claims for best performance.';

COMMENT ON FUNCTION app.user_has_company_access(UUID) IS
'Returns TRUE if user has access to the specified company_id. Checks app.company_ids session variable.';

COMMENT ON FUNCTION app.user_has_store_access(UUID) IS
'Returns TRUE if user has access to the specified store_id. Checks both direct store access
and company-level access via app.store_ids and app.company_ids session variables.';
