-- Add game_code field to LotteryGame model
-- Story 6.12: Serialized Pack Reception with Batch Processing
-- Adds game_code VARCHAR(4) UNIQUE field to enable serialized pack reception

-- Add game_code column with unique constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'lottery_games' AND column_name = 'game_code'
    ) THEN
        ALTER TABLE "lottery_games" ADD COLUMN "game_code" VARCHAR(4);
        
        -- Add unique constraint
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'lottery_games_game_code_key'
        ) THEN
            ALTER TABLE "lottery_games" ADD CONSTRAINT "lottery_games_game_code_key" UNIQUE ("game_code");
        END IF;
    END IF;
END $$;
