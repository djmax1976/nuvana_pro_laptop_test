-- Add password_hash column to users table for local authentication
ALTER TABLE "users" ADD COLUMN "password_hash" VARCHAR(255);

-- Drop old unique constraint on user_roles
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_user_id_role_id_company_id_store_id_key";

-- Add client_id to user_roles for client-level RLS
ALTER TABLE "user_roles" ADD COLUMN "client_id" UUID;

-- Create index on client_id
CREATE INDEX "user_roles_client_id_idx" ON "user_roles"("client_id");

-- Add new unique constraint including client_id
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_role_id_client_id_company_id_store_id_key" UNIQUE ("user_id", "role_id", "client_id", "company_id", "store_id");

-- Add foreign key to clients table
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
