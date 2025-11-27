/*
  Warnings:

  - You are about to drop the column `deleted_at` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `stores` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `original_email` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "stores_deleted_at_idx";

-- DropIndex
DROP INDEX "users_deleted_at_idx";

-- AlterTable
ALTER TABLE "companies" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "stores" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "deleted_at",
DROP COLUMN "original_email";
