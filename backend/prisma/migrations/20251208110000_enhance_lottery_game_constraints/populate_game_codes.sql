-- Data Migration: Populate game_code for existing LotteryGame records
-- Story 6.13: Lottery Database Enhancements & Bin Management
-- 
-- This script populates game_code values for existing games that don't have codes.
-- Game codes are 4-digit identifiers (0000-9999) that uniquely identify lottery games.
--
-- IMPORTANT: Game codes must be assigned based on business requirements from your lottery provider.
-- This script provides a template - you must replace the example values with actual game codes.
--
-- Usage:
-- 1. Review all games that need game codes: SELECT game_id, name, status FROM lottery_games WHERE game_code IS NULL;
-- 2. Replace the example UPDATE statements below with actual game codes for each game
-- 3. Ensure each game_code is unique and follows the format: 4 digits (e.g., '0001', '0002', '1234')
-- 4. Run this script BEFORE running the schema migration (20250128010000_enhance_lottery_game_constraints)
--
-- Example updates (REPLACE WITH ACTUAL VALUES):
-- UPDATE "lottery_games" SET "game_code" = '0001' WHERE "game_id" = 'uuid-here' AND "name" = 'Game Name 1';
-- UPDATE "lottery_games" SET "game_code" = '0002' WHERE "game_id" = 'uuid-here' AND "name" = 'Game Name 2';
--
-- Validation: This script validates that all game codes are unique and follow the 4-digit format

DO $$
DECLARE
    games_without_codes INTEGER;
    duplicate_codes INTEGER;
    invalid_format_codes INTEGER;
BEGIN
    -- Count games without game codes
    SELECT COUNT(*) INTO games_without_codes
    FROM "lottery_games"
    WHERE "game_code" IS NULL;
    
    IF games_without_codes > 0 THEN
        RAISE NOTICE 'Found % games without game codes. Please update game codes using the template above.', games_without_codes;
        RAISE NOTICE 'Games needing game codes:';
        RAISE NOTICE 'SELECT game_id, name, status FROM lottery_games WHERE game_code IS NULL;';
    ELSE
        RAISE NOTICE 'All games have game codes assigned.';
    END IF;
    
    -- Validate game code format (4 digits only)
    SELECT COUNT(*) INTO invalid_format_codes
    FROM "lottery_games"
    WHERE "game_code" IS NOT NULL 
      AND "game_code" !~ '^[0-9]{4}$';
    
    IF invalid_format_codes > 0 THEN
        RAISE WARNING 'Found % game codes with invalid format. Game codes must be exactly 4 digits (0000-9999).', invalid_format_codes;
    END IF;
    
    -- Validate game code uniqueness
    SELECT COUNT(*) INTO duplicate_codes
    FROM (
        SELECT "game_code", COUNT(*) as cnt
        FROM "lottery_games"
        WHERE "game_code" IS NOT NULL
        GROUP BY "game_code"
        HAVING COUNT(*) > 1
    ) duplicates;
    
    IF duplicate_codes > 0 THEN
        RAISE EXCEPTION 'Found % duplicate game codes. Each game_code must be unique.', duplicate_codes;
    END IF;
    
    -- Final validation: All active games must have game codes
    SELECT COUNT(*) INTO games_without_codes
    FROM "lottery_games"
    WHERE "game_code" IS NULL AND "status" = 'ACTIVE';
    
    IF games_without_codes > 0 THEN
        RAISE EXCEPTION 'Cannot proceed: % active games are missing game codes. Please populate all game codes before running schema migration.', games_without_codes;
    ELSE
        RAISE NOTICE 'Validation passed: All active games have valid, unique game codes.';
    END IF;
END $$;
