-- AddPublicIds: Add public_id fields to main entities for external-facing APIs
-- This migration adds enterprise-grade, prefixed public IDs following Stripe's pattern

-- Add public_id columns to main entities
ALTER TABLE "users" ADD COLUMN "public_id" VARCHAR(30);
ALTER TABLE "clients" ADD COLUMN "public_id" VARCHAR(30);
ALTER TABLE "companies" ADD COLUMN "public_id" VARCHAR(30);
ALTER TABLE "stores" ADD COLUMN "public_id" VARCHAR(30);
ALTER TABLE "transactions" ADD COLUMN "public_id" VARCHAR(30);

-- Create unique indexes (will be populated before making NOT NULL)
CREATE UNIQUE INDEX "users_public_id_key" ON "users"("public_id");
CREATE UNIQUE INDEX "clients_public_id_key" ON "clients"("public_id");
CREATE UNIQUE INDEX "companies_public_id_key" ON "companies"("public_id");
CREATE UNIQUE INDEX "stores_public_id_key" ON "stores"("public_id");
CREATE UNIQUE INDEX "transactions_public_id_key" ON "transactions"("public_id");

-- Create regular indexes for faster lookups
CREATE INDEX "users_public_id_idx" ON "users"("public_id");
CREATE INDEX "clients_public_id_idx" ON "clients"("public_id");
CREATE INDEX "companies_public_id_idx" ON "companies"("public_id");
CREATE INDEX "stores_public_id_idx" ON "stores"("public_id");
CREATE INDEX "transactions_public_id_idx" ON "transactions"("public_id");

-- Note: Backfill will be done via a separate script (backfill-public-ids.ts)
-- After backfilling, run: ALTER TABLE "table_name" ALTER COLUMN "public_id" SET NOT NULL;
