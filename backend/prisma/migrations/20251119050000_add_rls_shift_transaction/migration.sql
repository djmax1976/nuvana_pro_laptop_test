-- ============================================================================
-- Row-Level Security (RLS) Policies for Shift and Transaction Tables
-- Story: 2-3-row-level-security-rls-policies (Continuation)
-- ============================================================================
-- This migration adds RLS policies for tables that were created after the
-- initial RLS implementation: Shift, Transaction, POSTerminal,
-- TransactionLineItem, TransactionPayment
-- ============================================================================

-- ============================================================================
-- STEP 1: Enable RLS on Store-Level Tables
-- ============================================================================

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_payments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: Create RLS Policies for Shift Table (Store-Level Isolation)
-- ============================================================================

-- Policy: Users can only see shifts from their assigned store or company
-- System Admins can see all shifts
-- Corporate Admins can see all shifts in their company
CREATE POLICY shift_select_policy ON shifts
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- Policy: Users can only insert shifts in their assigned store
-- Corporate Admins can insert shifts in any store of their company
-- System Admins can insert shifts in any store
CREATE POLICY shift_insert_policy ON shifts
  FOR INSERT
  WITH CHECK (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- Policy: Users can only update shifts in their assigned store
-- Corporate Admins can update shifts in any store of their company
-- System Admins can update all shifts
CREATE POLICY shift_update_policy ON shifts
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- Policy: Users can only delete shifts in their assigned store
-- Corporate Admins can delete shifts in any store of their company
-- System Admins can delete all shifts
CREATE POLICY shift_delete_policy ON shifts
  FOR DELETE
  USING (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- ============================================================================
-- STEP 3: Create RLS Policies for Transaction Table (Store-Level Isolation)
-- ============================================================================

-- Policy: Users can only see transactions from their assigned store or company
-- System Admins can see all transactions
-- Corporate Admins can see all transactions in their company
CREATE POLICY transaction_select_policy ON transactions
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- Policy: Users can only insert transactions in their assigned store
-- Corporate Admins can insert transactions in any store of their company
-- System Admins can insert transactions in any store
CREATE POLICY transaction_insert_policy ON transactions
  FOR INSERT
  WITH CHECK (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- Policy: Users can only update transactions in their assigned store
-- Corporate Admins can update transactions in any store of their company
-- System Admins can update all transactions
CREATE POLICY transaction_update_policy ON transactions
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- Policy: Users can only delete transactions in their assigned store
-- Corporate Admins can delete transactions in any store of their company
-- System Admins can delete all transactions
CREATE POLICY transaction_delete_policy ON transactions
  FOR DELETE
  USING (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- ============================================================================
-- STEP 4: Create RLS Policies for POSTerminal Table (Store-Level Isolation)
-- ============================================================================

-- Policy: Users can only see POS terminals from their assigned store or company
CREATE POLICY pos_terminal_select_policy ON pos_terminals
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- Policy: Users can only insert POS terminals in their assigned store
CREATE POLICY pos_terminal_insert_policy ON pos_terminals
  FOR INSERT
  WITH CHECK (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- Policy: Users can only update POS terminals in their assigned store
CREATE POLICY pos_terminal_update_policy ON pos_terminals
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- Policy: Users can only delete POS terminals in their assigned store
CREATE POLICY pos_terminal_delete_policy ON pos_terminals
  FOR DELETE
  USING (
    app.is_system_admin() = TRUE
    OR store_id = app.get_user_store_id()
    OR store_id IN (
      SELECT s.store_id FROM stores s
      WHERE s.company_id = app.get_user_company_id()
    )
  );

-- ============================================================================
-- STEP 5: Create RLS Policies for TransactionLineItem Table
-- (Isolation via parent Transaction's store_id)
-- ============================================================================

-- Policy: Users can only see line items from transactions they can access
CREATE POLICY transaction_line_item_select_policy ON transaction_line_items
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR transaction_id IN (
      SELECT t.transaction_id FROM transactions t
      WHERE t.store_id = app.get_user_store_id()
         OR t.store_id IN (
           SELECT s.store_id FROM stores s
           WHERE s.company_id = app.get_user_company_id()
         )
    )
  );

-- Policy: Users can only insert line items for transactions they can access
CREATE POLICY transaction_line_item_insert_policy ON transaction_line_items
  FOR INSERT
  WITH CHECK (
    app.is_system_admin() = TRUE
    OR transaction_id IN (
      SELECT t.transaction_id FROM transactions t
      WHERE t.store_id = app.get_user_store_id()
         OR t.store_id IN (
           SELECT s.store_id FROM stores s
           WHERE s.company_id = app.get_user_company_id()
         )
    )
  );

-- Policy: Users can only update line items for transactions they can access
CREATE POLICY transaction_line_item_update_policy ON transaction_line_items
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR transaction_id IN (
      SELECT t.transaction_id FROM transactions t
      WHERE t.store_id = app.get_user_store_id()
         OR t.store_id IN (
           SELECT s.store_id FROM stores s
           WHERE s.company_id = app.get_user_company_id()
         )
    )
  );

-- Policy: Users can only delete line items for transactions they can access
CREATE POLICY transaction_line_item_delete_policy ON transaction_line_items
  FOR DELETE
  USING (
    app.is_system_admin() = TRUE
    OR transaction_id IN (
      SELECT t.transaction_id FROM transactions t
      WHERE t.store_id = app.get_user_store_id()
         OR t.store_id IN (
           SELECT s.store_id FROM stores s
           WHERE s.company_id = app.get_user_company_id()
         )
    )
  );

-- ============================================================================
-- STEP 6: Create RLS Policies for TransactionPayment Table
-- (Isolation via parent Transaction's store_id)
-- ============================================================================

-- Policy: Users can only see payments from transactions they can access
CREATE POLICY transaction_payment_select_policy ON transaction_payments
  FOR SELECT
  USING (
    app.is_system_admin() = TRUE
    OR transaction_id IN (
      SELECT t.transaction_id FROM transactions t
      WHERE t.store_id = app.get_user_store_id()
         OR t.store_id IN (
           SELECT s.store_id FROM stores s
           WHERE s.company_id = app.get_user_company_id()
         )
    )
  );

-- Policy: Users can only insert payments for transactions they can access
CREATE POLICY transaction_payment_insert_policy ON transaction_payments
  FOR INSERT
  WITH CHECK (
    app.is_system_admin() = TRUE
    OR transaction_id IN (
      SELECT t.transaction_id FROM transactions t
      WHERE t.store_id = app.get_user_store_id()
         OR t.store_id IN (
           SELECT s.store_id FROM stores s
           WHERE s.company_id = app.get_user_company_id()
         )
    )
  );

-- Policy: Users can only update payments for transactions they can access
CREATE POLICY transaction_payment_update_policy ON transaction_payments
  FOR UPDATE
  USING (
    app.is_system_admin() = TRUE
    OR transaction_id IN (
      SELECT t.transaction_id FROM transactions t
      WHERE t.store_id = app.get_user_store_id()
         OR t.store_id IN (
           SELECT s.store_id FROM stores s
           WHERE s.company_id = app.get_user_company_id()
         )
    )
  );

-- Policy: Users can only delete payments for transactions they can access
CREATE POLICY transaction_payment_delete_policy ON transaction_payments
  FOR DELETE
  USING (
    app.is_system_admin() = TRUE
    OR transaction_id IN (
      SELECT t.transaction_id FROM transactions t
      WHERE t.store_id = app.get_user_store_id()
         OR t.store_id IN (
           SELECT s.store_id FROM stores s
           WHERE s.company_id = app.get_user_company_id()
         )
    )
  );
