-- Migration: Remove Client entity and add owner_user_id to Company
-- This is a major refactor that:
-- 1. Adds owner_user_id to companies table
-- 2. Migrates existing data (company ownership from client's owner user)
-- 3. Removes client_id from companies and user_roles
-- 4. Drops the clients table entirely

-- Step 0: Drop ALL RLS policies on clients table FIRST (before any schema changes)
-- This must happen before dropping any columns they might reference
DROP POLICY IF EXISTS "client_select_policy" ON "clients";
DROP POLICY IF EXISTS "client_insert_policy" ON "clients";
DROP POLICY IF EXISTS "client_update_policy" ON "clients";
DROP POLICY IF EXISTS "client_delete_policy" ON "clients";
DROP POLICY IF EXISTS "clients_rls_policy" ON "clients";
DROP POLICY IF EXISTS "client_isolation_policy" ON "clients";

-- Disable RLS on clients table before dropping it
ALTER TABLE IF EXISTS "clients" DISABLE ROW LEVEL SECURITY;

-- Step 1: Add owner_user_id column to companies (nullable initially for migration)
ALTER TABLE "companies" ADD COLUMN "owner_user_id" UUID;

-- Step 2: Migrate existing data - set owner_user_id from client's CLIENT_OWNER user
-- Find the user who has CLIENT_OWNER role for each company's client
UPDATE "companies" c
SET "owner_user_id" = (
    SELECT ur."user_id"
    FROM "user_roles" ur
    INNER JOIN "roles" r ON ur."role_id" = r."role_id"
    WHERE ur."client_id" = c."client_id"
    AND r."code" = 'CLIENT_OWNER'
    LIMIT 1
)
WHERE c."client_id" IS NOT NULL;

-- Step 3: For any companies without an owner (orphaned), we need to handle them
-- Delete orphaned companies that have no owner (this shouldn't happen in normal use)
DELETE FROM "companies" WHERE "owner_user_id" IS NULL AND "client_id" IS NOT NULL;

-- Step 4: Make owner_user_id NOT NULL (all companies must have an owner)
-- Note: If there are companies without client_id, they need manual handling
-- For now, we'll only require NOT NULL for companies that had clients
ALTER TABLE "companies" ALTER COLUMN "owner_user_id" SET NOT NULL;

-- Step 5: Add foreign key constraint for owner_user_id
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 6: Create index on owner_user_id for performance
CREATE INDEX "companies_owner_user_id_idx" ON "companies"("owner_user_id");

-- Step 7: Drop the client_id index from companies
DROP INDEX IF EXISTS "companies_client_id_idx";

-- Step 8: Drop the foreign key constraint for client_id on companies
ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_client_id_fkey";

-- Step 9: Drop client_id column from companies
ALTER TABLE "companies" DROP COLUMN "client_id";

-- Step 10: Drop the client_id index from user_roles
DROP INDEX IF EXISTS "user_roles_client_id_idx";

-- Step 11: Drop the foreign key constraint for client_id on user_roles
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_client_id_fkey";

-- Step 12: Drop client_id column from user_roles
ALTER TABLE "user_roles" DROP COLUMN "client_id";

-- Step 13: Update the unique constraint on user_roles (remove client_id from it)
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_user_id_role_id_client_id_company_id_store_id_key";
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_role_id_company_id_store_id_key"
    UNIQUE ("user_id", "role_id", "company_id", "store_id");

-- Step 14: (RLS policies already dropped in Step 0)

-- Step 15: Drop the clients table
DROP TABLE IF EXISTS "clients";

-- Step 16: Clean up any orphaned audit logs that reference deleted client data
-- (Optional - audit logs should be kept for historical purposes)
