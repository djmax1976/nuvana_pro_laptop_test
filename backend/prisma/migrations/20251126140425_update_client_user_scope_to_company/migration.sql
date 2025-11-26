-- Update CLIENT_USER role scope from SYSTEM to COMPANY
-- This restricts CLIENT_USER permissions to company-scoped resources only

-- First, delete any existing user_roles with CLIENT_USER that don't have company_id
-- These are invalid because COMPANY scope requires company_id
DELETE FROM user_roles
WHERE role_id IN (SELECT role_id FROM roles WHERE code = 'CLIENT_USER')
  AND company_id IS NULL;

-- Update the CLIENT_USER role scope from SYSTEM to COMPANY
UPDATE roles
SET scope = 'COMPANY',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'CLIENT_USER';

