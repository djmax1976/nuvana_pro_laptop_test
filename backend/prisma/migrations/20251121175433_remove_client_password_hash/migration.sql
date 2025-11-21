/*
  Warnings:

  - You are about to drop the column `password_hash` on the `clients` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "user_roles_user_id_role_id_company_id_store_id_key";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "password_hash";
