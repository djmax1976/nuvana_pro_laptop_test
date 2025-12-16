-- Migration: Add pack_value column to lottery_games table
-- Story: 6.x - Lottery Pack Value for Serial Number Calculation
-- Purpose: Store pack value (total dollar value per pack) to calculate total tickets
-- Formula: total_tickets = pack_value / price, serial_end = total_tickets - 1

-- Add pack_value column to lottery_games table
ALTER TABLE "lottery_games"
ADD COLUMN "pack_value" DECIMAL(10,2) NULL;

-- Add comment explaining the field
COMMENT ON COLUMN "lottery_games"."pack_value" IS 'Total dollar value of a pack. Used to calculate total tickets: total_tickets = pack_value / price. Serial numbers range from 0 to (total_tickets - 1).';

-- Create index for pack_value queries
CREATE INDEX "lottery_games_pack_value_idx" ON "lottery_games"("pack_value");

-- Update existing games with a default pack_value based on common conventions
-- $1 tickets typically have $300 packs
-- $2 tickets typically have $300 packs (150 tickets)
-- $5 tickets typically have $300 packs (60 tickets)
-- $10+ tickets typically have $300 packs

-- Set default pack_value of 300 for all existing games
-- This can be adjusted per-game via the UI later
UPDATE "lottery_games"
SET "pack_value" = 300.00
WHERE "pack_value" IS NULL;

-- Now make the column NOT NULL since all games should have a pack_value
ALTER TABLE "lottery_games"
ALTER COLUMN "pack_value" SET NOT NULL;

-- Add constraint to ensure pack_value is positive
ALTER TABLE "lottery_games"
ADD CONSTRAINT "lottery_games_pack_value_positive" CHECK ("pack_value" > 0);

-- Add constraint to ensure pack_value is divisible by price (whole number of tickets)
-- This is enforced at application level since CHECK constraints can't reference other columns in some contexts
-- The application will validate: pack_value % price = 0
