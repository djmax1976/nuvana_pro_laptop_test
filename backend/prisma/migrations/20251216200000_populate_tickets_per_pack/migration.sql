-- Migration: Populate tickets_per_pack for existing lottery games
-- Purpose: Calculate and set tickets_per_pack based on pack_value / price
-- This ensures all lottery games have the correct number of tickets per pack

-- Update all games where tickets_per_pack is NULL
-- Formula: tickets_per_pack = pack_value / price
UPDATE "lottery_games"
SET "tickets_per_pack" = ("pack_value" / "price")::INTEGER
WHERE "tickets_per_pack" IS NULL
  AND "price" > 0;

-- Verify the update
DO $$
DECLARE
    games_without_tickets INTEGER;
BEGIN
    SELECT COUNT(*) INTO games_without_tickets
    FROM "lottery_games"
    WHERE "tickets_per_pack" IS NULL;

    IF games_without_tickets > 0 THEN
        RAISE WARNING 'Found % games still without tickets_per_pack. Check for games with price = 0.', games_without_tickets;
    ELSE
        RAISE NOTICE 'Successfully populated tickets_per_pack for all lottery games.';
    END IF;
END $$;
