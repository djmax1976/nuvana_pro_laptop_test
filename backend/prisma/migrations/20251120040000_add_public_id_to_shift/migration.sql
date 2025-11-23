-- AlterTable
ALTER TABLE "shifts" ADD COLUMN "public_id" VARCHAR(30);

-- CreateIndex
CREATE UNIQUE INDEX "shifts_public_id_key" ON "shifts"("public_id");

-- CreateIndex
CREATE INDEX "shifts_public_id_idx" ON "shifts"("public_id");
