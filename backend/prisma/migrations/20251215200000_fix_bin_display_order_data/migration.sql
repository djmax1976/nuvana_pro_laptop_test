-- Data Migration: Fix display_order for lottery_bins
--
-- ISSUE: Bins were created with 1-indexed display_order (Bin 1 = display_order 1)
-- but the system expects 0-indexed display_order (Bin 1 = display_order 0)
--
-- This causes bins to display incorrectly:
-- - "Bin 1" with display_order=1 shows as "Bin 2" (1+1=2)
-- - "Bin 2" with display_order=2 shows as "Bin 3" (2+1=3)
--
-- FIX: Subtract 1 from all display_order values > 0 to make them 0-indexed
-- This is idempotent - running multiple times won't cause issues
-- because display_order=0 bins won't be updated again

-- Update all lottery_bins to use 0-indexed display_order
-- Only update bins where display_order > 0 to avoid negative values
UPDATE "lottery_bins"
SET "display_order" = "display_order" - 1
WHERE "display_order" > 0;
