-- Migration: Add game scoping to lottery_games table
-- Purpose: Allow games to be scoped globally (Super Admin) or per-company (Client Owner)
--
-- Scoping Rules:
-- - company_id IS NULL = Global game (created by Super Admin, visible to all stores)
-- - company_id IS NOT NULL = Company-scoped game (created by Client Owner, visible only to that company's stores)
--
-- This allows the same game_code to exist multiple times:
-- - Once as a global game (company_id IS NULL)
-- - Once per company (company_id = <company_uuid>)

-- Step 1: Drop the existing unique constraint on game_code
-- The constraint name from the schema is "lottery_games_game_code_key"
ALTER TABLE "lottery_games" DROP CONSTRAINT IF EXISTS "lottery_games_game_code_key";

-- Step 2: Add created_by_user_id column (nullable - NULL for legacy/seeded games)
ALTER TABLE "lottery_games"
ADD COLUMN "created_by_user_id" UUID NULL;

-- Step 3: Add company_id column (nullable - NULL = global game, UUID = company-scoped)
ALTER TABLE "lottery_games"
ADD COLUMN "company_id" UUID NULL;

-- Step 4: Add foreign key constraint for created_by_user_id
ALTER TABLE "lottery_games"
ADD CONSTRAINT "lottery_games_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: Add foreign key constraint for company_id
ALTER TABLE "lottery_games"
ADD CONSTRAINT "lottery_games_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 6: Add composite unique constraint on (game_code, company_id)
-- This allows:
-- - One global game per game_code (where company_id IS NULL)
-- - One company-scoped game per game_code per company
-- Note: PostgreSQL treats NULL as distinct in unique constraints by default
-- We need to use a unique index with NULLS NOT DISTINCT to prevent multiple global games with same code
CREATE UNIQUE INDEX "lottery_games_game_code_company_unique"
ON "lottery_games"("game_code", "company_id") NULLS NOT DISTINCT;

-- Step 7: Add indexes for efficient querying
CREATE INDEX "lottery_games_company_id_idx" ON "lottery_games"("company_id");
CREATE INDEX "lottery_games_created_by_user_id_idx" ON "lottery_games"("created_by_user_id");

-- Step 8: Add comments explaining the columns
COMMENT ON COLUMN "lottery_games"."created_by_user_id" IS 'User who created this game. NULL for legacy/seeded games.';
COMMENT ON COLUMN "lottery_games"."company_id" IS 'Company scope: NULL = global game (visible to all), UUID = company-scoped game (visible only to that company stores).';

-- Note: Existing games remain with company_id = NULL, making them global games.
-- This is intentional as legacy games should be available to all stores.
