-- ============================================================================
-- Row-Level Security (RLS) Policies Migration
-- Story: 2-3-row-level-security-rls-policies
-- ============================================================================
-- This migration enables RLS on multi-tenant tables and creates policies
-- that filter rows based on user's assigned company_id or store_id from
-- UserRole table. System Admins (SUPERADMIN role) bypass RLS policies.
-- ============================================================================

-- ============================================================================
-- STEP 0: Create Application Schema for RLS Helper Functions
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app;

-- ============================================================================
-- STEP 1: Create Helper Functions for RLS Policies
-- ============================================================================

-- Function to get current user's company_id from UserRole table
-- Returns NULL if user has no COMPANY scope role
CREATE OR REPLACE FUNCTION app.get_user_company_id()
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_company_id UUID;
BEGIN
  -- Get current user_id from session variable (set by application)
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

-- Function to get current user's store_id from UserRole table
-- Returns NULL if user has no STORE scope role
CREATE OR REPLACE FUNCTION app.get_user_store_id()
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_store_id UUID;
BEGIN
  -- Get current user_id from session variable (set by application)
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

-- Function to check if current user is System Admin (SUPERADMIN role)
-- Returns TRUE if user has SUPERADMIN role with SYSTEM scope
CREATE OR REPLACE FUNCTION app.is_system_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Get current user_id from session variable (set by application)
  v_user_id := current_setting('app.current_user_id', true)::UUID;
  
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if user has SUPERADMIN role with SYSTEM scope
  SELECT EXISTS(
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.role_id
    WHERE ur.user_id = v_user_id
      AND r.scope = 'SYSTEM'
      AND r.code = 'SUPERADMIN'
  ) INTO v_is_admin;
  
  RETURN COALESCE(v_is_admin, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 2: Enable RLS on Multi-Tenant Tables
-- ============================================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 3: Create RLS Policies for Company Table
-- ============================================================================

-- Policy: Users can only see companies they are assigned to
-- System Admins can see all companies
CREATE POLICY company_select_policy ON companies
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
  );

-- Policy: Users can only insert companies if they are System Admin
-- (Company creation is typically restricted to System Admins)
CREATE POLICY company_insert_policy ON companies
  FOR INSERT
  WITH CHECK (app.is_system_admin() = TRUE);

-- Policy: Users can only update companies they are assigned to
-- System Admins can update all companies
CREATE POLICY company_update_policy ON companies
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
  );

-- Policy: Users can only delete companies if they are System Admin
CREATE POLICY company_delete_policy ON companies
  FOR DELETE
  USING (app.is_system_admin() = TRUE);

-- ============================================================================
-- STEP 4: Create RLS Policies for Store Table
-- ============================================================================

-- Policy: Users can see stores in their assigned company
-- System Admins can see all stores
-- Corporate Admins can see all stores in their company
CREATE POLICY store_select_policy ON stores
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
    OR store_id = app.get_user_store_id()
  );

-- Policy: Users can only insert stores in their assigned company
-- System Admins can insert stores in any company
CREATE POLICY store_insert_policy ON stores
  FOR INSERT
  WITH CHECK (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
  );

-- Policy: Users can only update stores in their assigned company
-- System Admins can update all stores
CREATE POLICY store_update_policy ON stores
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
    OR store_id = app.get_user_store_id()
  );

-- Policy: Users can only delete stores in their assigned company
-- System Admins can delete all stores
CREATE POLICY store_delete_policy ON stores
  FOR DELETE
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
  );

-- ============================================================================
-- STEP 5: Create RLS Policies for UserRole Table
-- ============================================================================

-- Policy: Users can see their own roles and roles in their company/store
-- System Admins can see all roles
CREATE POLICY user_role_select_policy ON user_roles
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR user_id::text = current_setting('app.current_user_id', true)
    OR company_id = app.get_user_company_id()
    OR store_id = app.get_user_store_id()
  );

-- Policy: Users can only insert roles in their assigned company/store
-- System Admins can insert any roles
CREATE POLICY user_role_insert_policy ON user_roles
  FOR INSERT
  WITH CHECK (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
    OR store_id = app.get_user_store_id()
  );

-- Policy: Users can only update roles in their assigned company/store
-- System Admins can update all roles
CREATE POLICY user_role_update_policy ON user_roles
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
    OR store_id = app.get_user_store_id()
  );

-- Policy: Users can only delete roles in their assigned company/store
-- System Admins can delete all roles
CREATE POLICY user_role_delete_policy ON user_roles
  FOR DELETE
  USING (
    app.is_system_admin() = TRUE
    OR company_id = app.get_user_company_id()
    OR store_id = app.get_user_store_id()
  );

-- ============================================================================
-- STEP 6: Create RLS Policies for AuditLog Table
-- ============================================================================

-- Policy: Users can see audit logs for their own actions or their company/store
-- System Admins can see all audit logs
CREATE POLICY audit_log_select_policy ON audit_logs
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR user_id::text = current_setting('app.current_user_id', true)
    -- Note: Audit logs don't have company_id/store_id directly,
    -- but we can filter by user_id which links to UserRole
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = audit_logs.user_id
        AND (
          ur.company_id = app.get_user_company_id()
          OR ur.store_id = app.get_user_store_id()
        )
    )
  );

-- Policy: Only System Admins can insert audit logs
-- (Audit logs are typically created by application, not users)
CREATE POLICY audit_log_insert_policy ON audit_logs
  FOR INSERT
  WITH CHECK (app.is_system_admin() = TRUE);

-- Policy: Audit logs are immutable (no updates allowed)
-- CREATE POLICY audit_log_update_policy ON audit_logs
--   FOR UPDATE
--   USING (FALSE);

-- Policy: Only System Admins can delete audit logs
CREATE POLICY audit_log_delete_policy ON audit_logs
  FOR DELETE
  USING (app.is_system_admin() = TRUE);
