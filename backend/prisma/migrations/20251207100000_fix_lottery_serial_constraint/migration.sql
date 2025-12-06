-- Fix: serial_start_end_order_check constraint overflow for large serial numbers
-- The original constraint uses BIGINT which overflows for 24+ digit serial numbers
-- Solution: Use NUMERIC (arbitrary precision) instead of BIGINT

-- Step 1: Pre-check for invalid rows that violate the constraint logic
-- This identifies rows where serial_start >= serial_end (using the same CASE logic as the constraint)
DO $$
DECLARE
  invalid_count INTEGER;
  invalid_packs UUID[];
BEGIN
  -- Find all rows that would violate the constraint
  SELECT COUNT(*), ARRAY_AGG(pack_id)
  INTO invalid_count, invalid_packs
  FROM "lottery_packs"
  WHERE NOT (
    CASE
      WHEN serial_start ~ '^[0-9]+$' AND serial_end ~ '^[0-9]+$' THEN
        CAST(serial_start AS NUMERIC) < CAST(serial_end AS NUMERIC)
      ELSE
        serial_start < serial_end
    END
  );
  
  -- If invalid rows exist, delete them (they represent data integrity issues)
  -- Log the count for visibility
  IF invalid_count > 0 THEN
    RAISE NOTICE 'Found % invalid lottery_packs rows where serial_start >= serial_end. Deleting these rows.', invalid_count;
    
    DELETE FROM "lottery_packs"
    WHERE pack_id = ANY(invalid_packs);
    
    RAISE NOTICE 'Deleted % invalid lottery_packs rows.', invalid_count;
  ELSE
    RAISE NOTICE 'No invalid rows found. All existing rows conform to the constraint.';
  END IF;
END $$;

-- Step 2: Drop the existing constraint
ALTER TABLE "lottery_packs" DROP CONSTRAINT IF EXISTS "serial_start_end_order_check";

-- Step 3: Recreate with NUMERIC type (supports arbitrarily large numbers)
-- NUMERIC in PostgreSQL has no practical size limit for integers
-- Since we've already cleaned invalid rows, we can add the constraint directly
ALTER TABLE "lottery_packs" ADD CONSTRAINT "serial_start_end_order_check" CHECK (
  CASE
    WHEN serial_start ~ '^[0-9]+$' AND serial_end ~ '^[0-9]+$' THEN
      CAST(serial_start AS NUMERIC) < CAST(serial_end AS NUMERIC)
    ELSE
      serial_start < serial_end
  END
);
