-- ============================================================================
-- Row-Level Security (RLS) Policies for Clients Table
-- Story: 2-7-update-company-management-to-link-to-client
-- ============================================================================
-- This migration enables RLS on the clients table and creates policies
-- that allow System Admins to manage clients while restricting access
-- for other users based on their company assignments.
-- ============================================================================

-- ============================================================================
-- STEP 1: Enable RLS on Clients Table
-- ============================================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: Create RLS Policies for Clients Table
-- ============================================================================

-- Policy: System Admins can see all clients
-- Users can see clients that their company belongs to
CREATE POLICY client_select_policy ON clients
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR EXISTS (
      SELECT 1 FROM companies c
      WHERE c.client_id = clients.client_id
        AND c.company_id = app.get_user_company_id()
    )
  );

-- Policy: Only System Admins can insert clients
CREATE POLICY client_insert_policy ON clients
  FOR INSERT
  WITH CHECK (app.is_system_admin() = TRUE);

-- Policy: Only System Admins can update clients
CREATE POLICY client_update_policy ON clients
  FOR UPDATE
  USING (app.is_system_admin() = TRUE);

-- Policy: Only System Admins can delete clients
CREATE POLICY client_delete_policy ON clients
  FOR DELETE
  USING (app.is_system_admin() = TRUE);
