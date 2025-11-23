-- AddUniqueConstraint: Add unique constraint to auth_provider_id to prevent race conditions
-- This migration ensures one auth provider ID maps to exactly one user

-- Step 1: Check for duplicate auth_provider_id values before adding constraint
-- If duplicates exist, this will help identify them for manual cleanup
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT auth_provider_id, COUNT(*) as cnt
    FROM users
    WHERE auth_provider_id IS NOT NULL
    GROUP BY auth_provider_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate auth_provider_id values. Please clean up duplicates before applying this migration.', duplicate_count;
  END IF;
END $$;

-- Step 2: Drop the existing index on auth_provider_id (will be replaced by unique constraint)
DROP INDEX IF EXISTS "users_auth_provider_id_idx";

-- Step 3: Add unique constraint on auth_provider_id
-- This makes the column unique and automatically creates a unique index
ALTER TABLE "users" ADD CONSTRAINT "users_auth_provider_id_key" UNIQUE ("auth_provider_id");
