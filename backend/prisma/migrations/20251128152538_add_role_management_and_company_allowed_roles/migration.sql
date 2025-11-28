-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "created_by" UUID,
ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "deleted_by" UUID,
ADD COLUMN     "is_system_role" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "company_allowed_roles" (
    "company_allowed_role_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_by" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_allowed_roles_pkey" PRIMARY KEY ("company_allowed_role_id")
);

-- CreateIndex
CREATE INDEX "company_allowed_roles_company_id_idx" ON "company_allowed_roles"("company_id");

-- CreateIndex
CREATE INDEX "company_allowed_roles_role_id_idx" ON "company_allowed_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_allowed_roles_company_id_role_id_key" ON "company_allowed_roles"("company_id", "role_id");

-- CreateIndex
CREATE INDEX "roles_deleted_at_idx" ON "roles"("deleted_at");

-- CreateIndex
CREATE INDEX "roles_is_system_role_idx" ON "roles"("is_system_role");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_allowed_roles" ADD CONSTRAINT "company_allowed_roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_allowed_roles" ADD CONSTRAINT "company_allowed_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_allowed_roles" ADD CONSTRAINT "company_allowed_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
