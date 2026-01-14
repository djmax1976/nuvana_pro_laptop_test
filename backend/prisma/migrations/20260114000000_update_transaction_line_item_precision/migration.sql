-- Migration: Update transaction_line_items for fuel precision
-- Description: Changes quantity from INT to DECIMAL(12,3) and unit_price from DECIMAL(10,2) to DECIMAL(10,4)
-- Required for: Fuel transaction support (gallons can be fractional, fuel prices need 4 decimal places)

-- =============================================================================
-- Update quantity column from INT to DECIMAL(12,3)
-- =============================================================================
-- Fuel sales are measured in gallons which can be fractional (e.g., 10.547 gallons)

ALTER TABLE "transaction_line_items"
    ALTER COLUMN "quantity" TYPE DECIMAL(12, 3) USING quantity::DECIMAL(12, 3);

-- =============================================================================
-- Update unit_price column from DECIMAL(10,2) to DECIMAL(10,4)
-- =============================================================================
-- Fuel prices are quoted to 4 decimal places (e.g., $2.5190 per gallon)

ALTER TABLE "transaction_line_items"
    ALTER COLUMN "unit_price" TYPE DECIMAL(10, 4) USING unit_price::DECIMAL(10, 4);

-- Add comment explaining the precision requirements
COMMENT ON COLUMN "transaction_line_items"."quantity" IS 'Quantity sold - DECIMAL(12,3) for fuel gallons precision (e.g., 10.547 gallons)';
COMMENT ON COLUMN "transaction_line_items"."unit_price" IS 'Unit price - DECIMAL(10,4) for fuel price precision (e.g., 2.5190 per gallon)';
