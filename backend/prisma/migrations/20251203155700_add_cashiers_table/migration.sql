-- CreateTable: Cashiers
-- This table stores cashier information for each store
-- Cashiers have soft-delete semantics via disabled_at field
CREATE TABLE "cashiers" (
    "cashier_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "employee_id" VARCHAR(4) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "pin_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "hired_on" DATE NOT NULL,
    "termination_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "cashiers_pkey" PRIMARY KEY ("cashier_id")
);

-- CreateIndex: unique employee_id per store
CREATE UNIQUE INDEX "cashiers_store_id_employee_id_key" ON "cashiers"("store_id", "employee_id");

-- CreateIndex: unique pin_hash per store
CREATE UNIQUE INDEX "cashiers_store_id_pin_hash_key" ON "cashiers"("store_id", "pin_hash");

-- CreateIndex: store_id for lookups
CREATE INDEX "cashiers_store_id_idx" ON "cashiers"("store_id");

-- CreateIndex: employee_id for lookups
CREATE INDEX "cashiers_employee_id_idx" ON "cashiers"("employee_id");

-- CreateIndex: is_active for filtering
CREATE INDEX "cashiers_is_active_idx" ON "cashiers"("is_active");

-- AddForeignKey: store reference
ALTER TABLE "cashiers" ADD CONSTRAINT "cashiers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: created_by reference
ALTER TABLE "cashiers" ADD CONSTRAINT "cashiers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: updated_by reference
ALTER TABLE "cashiers" ADD CONSTRAINT "cashiers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Update shifts table to reference cashiers instead of users
-- First, drop the old foreign key constraint
ALTER TABLE "shifts" DROP CONSTRAINT IF EXISTS "shifts_cashier_id_fkey";

-- Add new foreign key to cashiers table
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "cashiers"("cashier_id") ON DELETE RESTRICT ON UPDATE CASCADE;
