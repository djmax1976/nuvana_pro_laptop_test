-- AlterTable: Add sha256_pin_fingerprint column
ALTER TABLE "cashiers" ADD COLUMN "sha256_pin_fingerprint" VARCHAR(64);

-- CreateIndex: Add unique constraint on (store_id, sha256_pin_fingerprint)
-- Note: This will fail if there are existing duplicate PINs, which is expected
-- The constraint ensures uniqueness at the database level
CREATE UNIQUE INDEX IF NOT EXISTS "cashiers_store_id_sha256_pin_fingerprint_key" ON "cashiers"("store_id", "sha256_pin_fingerprint");

