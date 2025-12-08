-- Enhance LotteryGame model with game_code and price constraints
-- Story 6.13: Lottery Database Enhancements & Bin Management
-- Makes game_code and price NOT NULL, adds CHECK constraints and indexes

-- Step 1: Ensure all game_code values are populated (data migration should run first)
-- This migration assumes data migration script has populated all game_code values
DO $$
DECLARE
    games_without_codes INTEGER;
BEGIN
    SELECT COUNT(*) INTO games_without_codes
    FROM "lottery_games"
    WHERE "game_code" IS NULL;
    
    IF games_without_codes > 0 THEN
        RAISE EXCEPTION 'Cannot make game_code NOT NULL: % games have NULL game_code. Run data migration script first.', games_without_codes;
    END IF;
END $$;

-- Step 2: Make game_code NOT NULL
ALTER TABLE "lottery_games" 
    ALTER COLUMN "game_code" SET NOT NULL;

-- Step 3: Ensure all price values are populated (set default to 1.00 if NULL)
-- Note: Business logic should ensure prices are set correctly. Default of 1.00 is minimum valid price.
-- Review and update prices after migration if needed.
UPDATE "lottery_games"
SET "price" = 1.00
WHERE "price" IS NULL;

-- Step 4: Make price NOT NULL
ALTER TABLE "lottery_games"
    ALTER COLUMN "price" SET NOT NULL;

-- Step 5: Add CHECK constraint for game_code format (4 digits only)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'lottery_games_game_code_format_check'
    ) THEN
        ALTER TABLE "lottery_games" 
            ADD CONSTRAINT "lottery_games_game_code_format_check" 
            CHECK (game_code ~ '^[0-9]{4}$');
    END IF;
END $$;

-- Step 6: Add CHECK constraint for price > 0
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'lottery_games_price_positive_check'
    ) THEN
        ALTER TABLE "lottery_games"
            ADD CONSTRAINT "lottery_games_price_positive_check"
            CHECK (price > 0);
    END IF;
END $$;

-- Step 7: Add indexes for optimized queries (if they don't exist)
CREATE INDEX IF NOT EXISTS "lottery_games_game_code_idx" ON "lottery_games"("game_code");
CREATE INDEX IF NOT EXISTS "lottery_games_status_idx" ON "lottery_games"("status");
CREATE INDEX IF NOT EXISTS "lottery_games_price_idx" ON "lottery_games"("price");
