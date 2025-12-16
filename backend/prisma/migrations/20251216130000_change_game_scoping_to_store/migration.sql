-- Migration: Change game scoping from company_id to store_id
-- Purpose: Games should be scoped to store, not company
--
-- Scoping Rules:
-- - store_id IS NULL = Global game (created by Super Admin, visible to all stores)
-- - store_id IS NOT NULL = Store-scoped game (created at a specific store, visible only to that store)
--
-- This allows the same game_code to exist multiple times:
-- - Once as a global game (store_id IS NULL)
-- - Once per store (store_id = <store_uuid>)

-- Step 1: Drop the existing company-based unique index
DROP INDEX IF EXISTS "lottery_games_game_code_company_unique";

-- Step 2: Drop the existing company_id index
DROP INDEX IF EXISTS "lottery_games_company_id_idx";

-- Step 3: Drop the foreign key constraint for company_id
ALTER TABLE "lottery_games" DROP CONSTRAINT IF EXISTS "lottery_games_company_id_fkey";

-- Step 4: Add store_id column (nullable - NULL = global game, UUID = store-scoped)
ALTER TABLE "lottery_games"
ADD COLUMN "store_id" UUID NULL;

-- Step 5: Add foreign key constraint for store_id
ALTER TABLE "lottery_games"
ADD CONSTRAINT "lottery_games_store_id_fkey"
FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 6: Create unique index on (game_code, store_id) with NULLS NOT DISTINCT
-- This allows:
-- - One global game per game_code (where store_id IS NULL)
-- - One store-scoped game per game_code per store
CREATE UNIQUE INDEX "lottery_games_game_code_store_unique"
ON "lottery_games"("game_code", "store_id") NULLS NOT DISTINCT;

-- Step 7: Add index for efficient store_id querying
CREATE INDEX "lottery_games_store_id_idx" ON "lottery_games"("store_id");

-- Step 8: Drop the company_id column (no longer needed)
ALTER TABLE "lottery_games" DROP COLUMN IF EXISTS "company_id";

-- Step 9: Update column comment
COMMENT ON COLUMN "lottery_games"."store_id" IS 'Store scope: NULL = global game (visible to all), UUID = store-scoped game (visible only to that store).';

-- Note: Existing games remain with store_id = NULL, making them global games.
-- This is intentional as legacy games should be available to all stores.
