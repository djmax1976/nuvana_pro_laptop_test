-- Migration: Add is_client_user field to User model
-- Story 2.9: Client Dashboard Foundation and Authentication
-- This field identifies users who can authenticate via the client-login endpoint
-- and access the client dashboard to manage their owned companies and stores

-- Step 1: Add is_client_user column with default value of false
ALTER TABLE "users" ADD COLUMN "is_client_user" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Create index for filtering client users efficiently
CREATE INDEX "users_is_client_user_idx" ON "users"("is_client_user");

-- Step 3: Update existing company owners to be client users
-- Any user who owns a company should be able to access the client dashboard
UPDATE "users" u
SET "is_client_user" = true
WHERE EXISTS (
    SELECT 1 FROM "companies" c
    WHERE c."owner_user_id" = u."user_id"
);
