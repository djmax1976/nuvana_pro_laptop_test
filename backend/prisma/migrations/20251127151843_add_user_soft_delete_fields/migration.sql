-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "original_email" VARCHAR(255);

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
