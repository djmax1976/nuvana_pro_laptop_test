-- Migration: Add lottery_config_values table
-- Story: 6.x - Lottery Configuration Values for Pack Value and Ticket Price
-- Purpose: Store predefined dropdown values for lottery ticket prices and pack values
-- to ensure data integrity and prevent manual entry errors.

-- Create enum for config types
CREATE TYPE "LotteryConfigType" AS ENUM ('PACK_VALUE', 'TICKET_PRICE');

-- Create lottery_config_values table
CREATE TABLE "lottery_config_values" (
    "config_value_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "config_type" "LotteryConfigType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_config_values_pkey" PRIMARY KEY ("config_value_id"),
    CONSTRAINT "lottery_config_values_type_amount_unique" UNIQUE ("config_type", "amount")
);

-- Create indexes for efficient querying
CREATE INDEX "lottery_config_values_config_type_idx" ON "lottery_config_values"("config_type");
CREATE INDEX "lottery_config_values_is_active_idx" ON "lottery_config_values"("is_active");
CREATE INDEX "lottery_config_values_type_active_order_idx" ON "lottery_config_values"("config_type", "is_active", "display_order");

-- Seed data: Standard ticket prices
INSERT INTO "lottery_config_values" ("config_type", "amount", "display_order") VALUES
    ('TICKET_PRICE', 1.00, 1),
    ('TICKET_PRICE', 2.00, 2),
    ('TICKET_PRICE', 3.00, 3),
    ('TICKET_PRICE', 5.00, 4),
    ('TICKET_PRICE', 10.00, 5),
    ('TICKET_PRICE', 20.00, 6),
    ('TICKET_PRICE', 25.00, 7),
    ('TICKET_PRICE', 30.00, 8),
    ('TICKET_PRICE', 50.00, 9);

-- Seed data: Standard pack values (300 and 900 only)
INSERT INTO "lottery_config_values" ("config_type", "amount", "display_order") VALUES
    ('PACK_VALUE', 300.00, 1),
    ('PACK_VALUE', 900.00, 2);

-- Add RLS policy for lottery_config_values (read-only for all authenticated users)
ALTER TABLE "lottery_config_values" ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read config values
CREATE POLICY "lottery_config_values_select_policy" ON "lottery_config_values"
    FOR SELECT
    USING (true);

-- Policy: Only super admins can modify config values (via direct DB access)
-- Application-level modifications should be restricted to admin endpoints
CREATE POLICY "lottery_config_values_admin_policy" ON "lottery_config_values"
    FOR ALL
    USING (
        current_setting('app.user_role', true) = 'SUPER_ADMIN'
    );

-- Grant necessary permissions to app_user
GRANT SELECT ON "lottery_config_values" TO app_user;

-- Comment on table
COMMENT ON TABLE "lottery_config_values" IS 'Predefined configuration values for lottery ticket prices and pack values. Used for dropdown selections to ensure data integrity.';
COMMENT ON COLUMN "lottery_config_values"."config_type" IS 'Type of configuration: PACK_VALUE or TICKET_PRICE';
COMMENT ON COLUMN "lottery_config_values"."amount" IS 'The dollar amount value';
COMMENT ON COLUMN "lottery_config_values"."display_order" IS 'Order in which values appear in dropdown menus';
COMMENT ON COLUMN "lottery_config_values"."is_active" IS 'Soft delete flag - inactive values are hidden from dropdowns but preserved for referential integrity';
