/*
  Warnings:

  - You are about to drop the column `closing_amount` on the `shifts` table. All the data in the column will be lost.
  - You are about to drop the column `end_time` on the `shifts` table. All the data in the column will be lost.
  - You are about to drop the column `opening_amount` on the `shifts` table. All the data in the column will be lost.
  - You are about to drop the column `start_time` on the `shifts` table. All the data in the column will be lost.
  - The `status` column on the `shifts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `opened_by` to the `shifts` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('NOT_STARTED', 'OPEN', 'ACTIVE', 'CLOSING', 'RECONCILING', 'CLOSED', 'VARIANCE_REVIEW');

-- DropIndex
DROP INDEX "shifts_start_time_idx";

-- AlterTable
ALTER TABLE "shifts" DROP COLUMN "closing_amount",
DROP COLUMN "end_time",
DROP COLUMN "opening_amount",
DROP COLUMN "start_time",
ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "closed_at" TIMESTAMPTZ(6),
ADD COLUMN     "closing_cash" DECIMAL(10,2),
ADD COLUMN     "expected_cash" DECIMAL(10,2),
ADD COLUMN     "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "opened_by" UUID NOT NULL,
ADD COLUMN     "opening_cash" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "variance" DECIMAL(10,2),
ADD COLUMN     "variance_reason" VARCHAR(500),
DROP COLUMN "status",
ADD COLUMN     "status" "ShiftStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- CreateIndex
CREATE INDEX "shifts_opened_by_idx" ON "shifts"("opened_by");

-- CreateIndex
CREATE INDEX "shifts_status_idx" ON "shifts"("status");

-- CreateIndex
CREATE INDEX "shifts_opened_at_idx" ON "shifts"("opened_at");

-- CreateIndex
CREATE INDEX "shifts_store_id_status_idx" ON "shifts"("store_id", "status");

-- CreateIndex
CREATE INDEX "shifts_store_id_opened_at_idx" ON "shifts"("store_id", "opened_at");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
