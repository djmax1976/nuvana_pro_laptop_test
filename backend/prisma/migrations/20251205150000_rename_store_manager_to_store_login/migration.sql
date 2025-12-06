-- Add store_login_user_id column to stores table
-- This column links a store to a CLIENT_USER that serves as the store's login credential
--
-- This migration handles two scenarios:
-- 1. Fresh database: Column doesn't exist, so we add it
-- 2. Existing database with store_manager_user_id: Rename it to store_login_user_id

-- Check if store_manager_user_id exists and rename it, otherwise add new column
DO $$
BEGIN
    -- Check if the old column name exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stores' AND column_name = 'store_manager_user_id'
    ) THEN
        -- Drop old index if it exists
        DROP INDEX IF EXISTS "stores_store_manager_user_id_idx";
        -- Rename the column
        ALTER TABLE "stores" RENAME COLUMN "store_manager_user_id" TO "store_login_user_id";
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stores' AND column_name = 'store_login_user_id'
    ) THEN
        -- Column doesn't exist at all, add it fresh
        ALTER TABLE "stores" ADD COLUMN "store_login_user_id" UUID;
        -- Add foreign key constraint
        ALTER TABLE "stores" ADD CONSTRAINT "stores_store_login_user_id_fkey"
            FOREIGN KEY ("store_login_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS "stores_store_login_user_id_idx" ON "stores"("store_login_user_id");
