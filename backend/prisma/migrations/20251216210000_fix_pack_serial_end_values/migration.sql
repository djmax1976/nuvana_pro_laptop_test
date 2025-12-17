-- Migration: Fix serial_end values for existing lottery packs
-- Purpose: Update serial_end to match the game's actual tickets_per_pack
-- Formula: serial_end = serial_start + tickets_per_pack - 1
-- Example: serial_start='000', tickets_per_pack=30 => serial_end='029' (serials 000-029)
-- Example: serial_start='029', tickets_per_pack=30 => serial_end='058' (serials 029-058)

-- Update all packs to have correct serial_end based on their game's tickets_per_pack
-- The formula accounts for packs that may start at a non-zero serial
-- Skip packs where tickets_per_pack <= 1 to avoid violating serial_start < serial_end constraint
UPDATE "lottery_packs" p
SET "serial_end" = LPAD(
    (p.serial_start::INTEGER + g.tickets_per_pack - 1)::TEXT,
    LENGTH(p.serial_start),
    '0'
)
FROM "lottery_games" g
WHERE p.game_id = g.game_id
  AND g.tickets_per_pack IS NOT NULL
  AND g.tickets_per_pack > 1;

-- Verify the update
DO $$
DECLARE
    pack_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO pack_count FROM "lottery_packs";
    RAISE NOTICE 'Successfully updated serial_end values for % packs.', pack_count;
END $$;
