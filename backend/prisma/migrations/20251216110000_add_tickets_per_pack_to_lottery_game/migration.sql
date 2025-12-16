-- Migration: Add tickets_per_pack column to lottery_games table
-- Purpose: Store the number of tickets per pack for lottery games
-- This is computed from pack_value / price but stored for convenience

-- Add tickets_per_pack column to lottery_games table
ALTER TABLE "lottery_games"
ADD COLUMN "tickets_per_pack" INTEGER NULL;

-- Add comment explaining the field
COMMENT ON COLUMN "lottery_games"."tickets_per_pack" IS 'Number of tickets in a pack. Computed as pack_value / price. Used for serial range calculation.';

-- Update existing games to compute tickets_per_pack from pack_value and price
-- Using ROUND to handle any decimal precision issues
UPDATE "lottery_games"
SET "tickets_per_pack" = ROUND("pack_value" / "price")::INTEGER
WHERE "pack_value" IS NOT NULL AND "price" > 0;
