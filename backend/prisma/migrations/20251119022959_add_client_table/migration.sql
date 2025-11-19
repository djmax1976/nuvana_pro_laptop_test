-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "client_id" UUID;

-- CreateTable
CREATE TABLE "clients" (
    "client_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("client_id")
);

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "clients_deleted_at_idx" ON "clients"("deleted_at");

-- CreateIndex
CREATE INDEX "companies_client_id_idx" ON "companies"("client_id");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;
