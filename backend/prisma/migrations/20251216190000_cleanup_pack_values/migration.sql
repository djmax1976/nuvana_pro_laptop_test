-- Migration: Cleanup pack values to only 300 and 900
-- Purpose: Remove extra pack values that were incorrectly seeded
-- This migration ensures only the intended pack values (300 and 900) remain

-- Delete all pack values except 300 and 900
DELETE FROM "lottery_config_values"
WHERE config_type = 'PACK_VALUE'
AND amount NOT IN (300.00, 900.00);

-- Update display_order to be sequential (1, 2)
UPDATE "lottery_config_values"
SET display_order = 1
WHERE config_type = 'PACK_VALUE' AND amount = 300.00;

UPDATE "lottery_config_values"
SET display_order = 2
WHERE config_type = 'PACK_VALUE' AND amount = 900.00;
