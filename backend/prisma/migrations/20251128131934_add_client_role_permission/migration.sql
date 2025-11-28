-- CreateTable
CREATE TABLE "client_role_permissions" (
    "client_role_permission_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_role_permissions_pkey" PRIMARY KEY ("client_role_permission_id")
);

-- CreateIndex
CREATE INDEX "client_role_permissions_owner_user_id_idx" ON "client_role_permissions"("owner_user_id");

-- CreateIndex
CREATE INDEX "client_role_permissions_role_id_idx" ON "client_role_permissions"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_role_permissions_owner_user_id_role_id_permission_id_key" ON "client_role_permissions"("owner_user_id", "role_id", "permission_id");

-- AddForeignKey
ALTER TABLE "client_role_permissions" ADD CONSTRAINT "client_role_permissions_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_role_permissions" ADD CONSTRAINT "client_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_role_permissions" ADD CONSTRAINT "client_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("permission_id") ON DELETE CASCADE ON UPDATE CASCADE;
