-- Fix: serial_start_end_order_check constraint overflow for large serial numbers
-- The original constraint uses BIGINT which overflows for 24+ digit serial numbers
-- Solution: Use NUMERIC (arbitrary precision) instead of BIGINT

-- Drop the existing constraint
ALTER TABLE "lottery_packs" DROP CONSTRAINT IF EXISTS "serial_start_end_order_check";

-- Recreate with NUMERIC type (supports arbitrarily large numbers)
-- NUMERIC in PostgreSQL has no practical size limit for integers
ALTER TABLE "lottery_packs" ADD CONSTRAINT "serial_start_end_order_check" CHECK (
  CASE
    WHEN serial_start ~ '^[0-9]+$' AND serial_end ~ '^[0-9]+$' THEN
      CAST(serial_start AS NUMERIC) < CAST(serial_end AS NUMERIC)
    ELSE
      serial_start < serial_end
  END
);
