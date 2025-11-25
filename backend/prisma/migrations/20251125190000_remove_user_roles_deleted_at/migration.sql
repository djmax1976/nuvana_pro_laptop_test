-- DropIndex
DROP INDEX IF EXISTS "user_roles_deleted_at_idx";

-- AlterTable
ALTER TABLE "user_roles" DROP COLUMN IF EXISTS "deleted_at";
