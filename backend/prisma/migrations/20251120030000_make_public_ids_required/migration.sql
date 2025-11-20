-- Make public_id fields NOT NULL after backfill completed

ALTER TABLE "users" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "clients" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "companies" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "stores" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "public_id" SET NOT NULL;
