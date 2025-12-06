-- Rename store_manager_user_id to store_login_user_id
-- This is a terminology change: CLIENT_USER represents a "store login credential" not a "store manager"

-- First, drop the old index if it exists
DROP INDEX IF EXISTS "stores_store_manager_user_id_idx";

-- Rename the column (this preserves the data and FK constraint)
ALTER TABLE "stores" RENAME COLUMN "store_manager_user_id" TO "store_login_user_id";

-- Create the new index with the correct name
CREATE INDEX "stores_store_login_user_id_idx" ON "stores"("store_login_user_id");
