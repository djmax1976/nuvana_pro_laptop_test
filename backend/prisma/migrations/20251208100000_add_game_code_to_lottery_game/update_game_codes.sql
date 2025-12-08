-- Data Migration: Update existing games with game codes
-- Story 6.12: Serialized Pack Reception with Batch Processing
-- 
-- NOTE: This script provides a template for updating game codes.
-- Game codes are 4-digit identifiers that must be assigned based on business requirements.
-- 
-- To use this script:
-- 1. Replace the example game_code values below with actual game codes from your lottery provider
-- 2. Ensure each game_code is unique (4 digits, e.g., '0001', '0002', etc.)
-- 3. Run this script after the schema migration has been applied
--
-- Example usage:
-- UPDATE "lottery_games" SET "game_code" = '0001' WHERE "name" = 'Game Name 1';
-- UPDATE "lottery_games" SET "game_code" = '0002' WHERE "name" = 'Game Name 2';
--
-- Or update by game_id:
-- UPDATE "lottery_games" SET "game_code" = '0001' WHERE "game_id" = 'uuid-here';
--
-- Validation: Ensure all active games have game codes before using serialized pack reception
DO $$
DECLARE
    games_without_codes INTEGER;
BEGIN
    -- Count games without game codes
    SELECT COUNT(*) INTO games_without_codes
    FROM "lottery_games"
    WHERE "game_code" IS NULL AND "status" = 'ACTIVE';
    
    IF games_without_codes > 0 THEN
        RAISE NOTICE 'Found % active games without game codes. Please update game codes before using serialized pack reception.', games_without_codes;
    ELSE
        RAISE NOTICE 'All active games have game codes assigned.';
    END IF;
END $$;
