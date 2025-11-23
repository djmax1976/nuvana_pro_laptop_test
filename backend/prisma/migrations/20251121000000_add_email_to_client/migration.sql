-- AlterTable
ALTER TABLE "clients" ADD COLUMN "email" VARCHAR(255) NOT NULL DEFAULT 'client@example.com',
ADD COLUMN "password_hash" VARCHAR(255);

-- CreateIndex
CREATE INDEX "clients_email_idx" ON "clients"("email");

-- Remove default value after backfilling
ALTER TABLE "clients" ALTER COLUMN "email" DROP DEFAULT;
