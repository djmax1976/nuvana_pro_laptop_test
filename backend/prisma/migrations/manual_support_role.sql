-- Migration: Add SUPPORT role with SUPPORT scope
-- Description: Creates the SUPPORT role with SUPPORT scope for support staff
-- who need COMPANY + STORE level access (but NOT SYSTEM level) for troubleshooting.
--
-- SUPPORT scope is a new scope type that grants:
-- - Access to COMPANY level resources (company data, all stores in company)
-- - Access to STORE level resources (store data, shifts, transactions, etc.)
-- - NO access to SYSTEM level resources (system config, all companies, etc.)
--
-- This is different from SUPERADMIN (SYSTEM scope) which has access to everything.
--
-- IMPORTANT: This migration is idempotent - it uses INSERT ... ON CONFLICT DO NOTHING
-- to safely skip if the role/permissions already exist. If updating from COMPANY scope
-- to SUPPORT scope, run the UPDATE statement at the bottom.
--
-- Run with: psql -d nuvana_dev -f manual_support_role.sql
-- Or use: npx prisma db execute --file ./prisma/migrations/manual_support_role.sql

-- Step 1: Create the SUPPORT role if it doesn't exist (with SUPPORT scope)
INSERT INTO roles (role_id, scope, code, description, is_system_role, created_at, updated_at)
SELECT
    gen_random_uuid(),
    'SUPPORT',
    'SUPPORT',
    'Support staff with COMPANY + STORE level access for troubleshooting and customer assistance (no SYSTEM access)',
    true,
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE code = 'SUPPORT'
);

-- Step 1b: If SUPPORT role exists with wrong scope (COMPANY), update it to SUPPORT scope
UPDATE roles
SET scope = 'SUPPORT',
    description = 'Support staff with COMPANY + STORE level access for troubleshooting and customer assistance (no SYSTEM access)',
    updated_at = NOW()
WHERE code = 'SUPPORT' AND scope != 'SUPPORT';

-- Step 2: Map permissions to SUPPORT role
-- Using a CTE to get the role_id and permission_ids, then insert mappings
WITH support_role AS (
    SELECT role_id FROM roles WHERE code = 'SUPPORT'
),
permission_codes AS (
    SELECT permission_id, code FROM permissions WHERE code IN (
        -- Company & Store Read Access
        'COMPANY_READ',
        'STORE_READ',
        -- User Read Access
        'USER_READ',
        -- Shift Read Access
        'SHIFT_READ',
        'SHIFT_REPORT_VIEW',
        -- Transaction Read Access
        'TRANSACTION_READ',
        -- Inventory Read Access
        'INVENTORY_READ',
        -- Lottery Read Access
        'LOTTERY_GAME_READ',
        'LOTTERY_PACK_READ',
        'LOTTERY_VARIANCE_READ',
        'LOTTERY_BIN_READ',
        'LOTTERY_BIN_CONFIG_READ',
        'LOTTERY_REPORT',
        -- Reports
        'REPORT_SHIFT',
        'REPORT_DAILY',
        'REPORT_ANALYTICS',
        'REPORT_EXPORT',
        -- Client Dashboard Access
        'CLIENT_DASHBOARD_ACCESS',
        -- Client Employee Read Access
        'CLIENT_EMPLOYEE_READ',
        -- Cashier Read Access
        'CASHIER_READ',
        -- Configuration Read Access
        'TENDER_TYPE_READ',
        'DEPARTMENT_READ',
        'TAX_RATE_READ',
        'CONFIG_READ',
        -- POS Integration Read Access
        'POS_CONNECTION_READ',
        'POS_SYNC_LOG_READ',
        -- POS Audit Read Access
        'POS_AUDIT_READ',
        -- Admin Audit View
        'ADMIN_AUDIT_VIEW'
    )
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT sr.role_id, pc.permission_id
FROM support_role sr
CROSS JOIN permission_codes pc
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Verify the migration
DO $$
DECLARE
    role_exists boolean;
    permission_count integer;
BEGIN
    -- Check if role exists
    SELECT EXISTS(SELECT 1 FROM roles WHERE code = 'SUPPORT') INTO role_exists;

    -- Count permissions assigned
    SELECT COUNT(*) INTO permission_count
    FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.role_id
    WHERE r.code = 'SUPPORT';

    IF role_exists THEN
        RAISE NOTICE 'SUPPORT role created successfully with % permissions', permission_count;
    ELSE
        RAISE EXCEPTION 'Failed to create SUPPORT role';
    END IF;
END $$;
