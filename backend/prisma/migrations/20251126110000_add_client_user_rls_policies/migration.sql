-- ============================================================================
-- Row-Level Security (RLS) Policies for Client Users
-- Story: 2-9-client-dashboard-foundation-and-authentication
-- ============================================================================
-- This migration updates RLS policies to support the User-Ownership model
-- where client users (is_client_user = true) can see companies they own
-- and stores within those companies.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create Helper Function to Check if User is a Client User
-- ============================================================================

CREATE OR REPLACE FUNCTION app.is_client_user()
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_is_client_user BOOLEAN;
BEGIN
  -- Get current user_id from session variable (set by application)
  v_user_id := current_setting('app.current_user_id', true)::UUID;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if user has is_client_user = true
  SELECT is_client_user INTO v_is_client_user
  FROM users
  WHERE user_id = v_user_id;

  RETURN COALESCE(v_is_client_user, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 2: Create Helper Function to Get Owned Companies for Client User
-- ============================================================================

-- Function returns array of company_ids owned by the current user
CREATE OR REPLACE FUNCTION app.get_owned_company_ids()
RETURNS UUID[] AS $$
DECLARE
  v_user_id UUID;
  v_company_ids UUID[];
BEGIN
  -- Get current user_id from session variable
  v_user_id := current_setting('app.current_user_id', true)::UUID;

  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;

  -- Get all company_ids owned by this user
  SELECT ARRAY_AGG(company_id) INTO v_company_ids
  FROM companies
  WHERE owner_user_id = v_user_id
    AND deleted_at IS NULL;

  RETURN COALESCE(v_company_ids, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 3: Update Company RLS Policies
-- ============================================================================

-- Drop existing company policies
DROP POLICY IF EXISTS company_select_policy ON companies;
DROP POLICY IF EXISTS company_update_policy ON companies;

-- Recreate company_select_policy with client user support
-- Client users can see companies they own
CREATE POLICY company_select_policy ON companies
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
    OR (app.is_client_user() = TRUE AND owner_user_id::text = current_setting('app.current_user_id', true))
  );

-- Recreate company_update_policy with client user support
-- Client users can update companies they own
CREATE POLICY company_update_policy ON companies
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
    OR (app.is_client_user() = TRUE AND owner_user_id::text = current_setting('app.current_user_id', true))
  );

-- ============================================================================
-- STEP 4: Update Store RLS Policies
-- ============================================================================

-- Drop existing store policies
DROP POLICY IF EXISTS store_select_policy ON stores;
DROP POLICY IF EXISTS store_update_policy ON stores;
DROP POLICY IF EXISTS store_insert_policy ON stores;
DROP POLICY IF EXISTS store_delete_policy ON stores;

-- Recreate store_select_policy with client user support
-- Client users can see stores in companies they own
CREATE POLICY store_select_policy ON stores
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
    OR store_id = app.get_user_store_id()
    OR (app.is_client_user() = TRUE AND company_id = ANY(app.get_owned_company_ids()))
  );

-- Recreate store_insert_policy with client user support
-- Client users can create stores in companies they own
CREATE POLICY store_insert_policy ON stores
  FOR INSERT
  WITH CHECK (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
    OR (app.is_client_user() = TRUE AND company_id = ANY(app.get_owned_company_ids()))
  );

-- Recreate store_update_policy with client user support
-- Client users can update stores in companies they own
CREATE POLICY store_update_policy ON stores
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
    OR store_id = app.get_user_store_id()
    OR (app.is_client_user() = TRUE AND company_id = ANY(app.get_owned_company_ids()))
  );

-- Recreate store_delete_policy with client user support
-- Client users can delete stores in companies they own
CREATE POLICY store_delete_policy ON stores
  FOR DELETE
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
    OR (app.is_client_user() = TRUE AND company_id = ANY(app.get_owned_company_ids()))
  );

-- ============================================================================
-- STEP 5: Grant Permissions on Helper Functions
-- ============================================================================

-- Grant execute permissions to app_user (used for RLS-aware queries)
GRANT EXECUTE ON FUNCTION app.is_client_user() TO app_user;
GRANT EXECUTE ON FUNCTION app.get_owned_company_ids() TO app_user;
