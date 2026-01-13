-- Migration: Fix API Key Schema Mismatch
-- Description: Align database tables with Prisma schema for api_keys, api_key_audit_events,
--              and api_key_sync_sessions tables.
-- Issue: The original migration (20260112000000) created tables with different column names
--        than what the Prisma schema expects, causing CI/CD test failures.

-- =============================================================================
-- 1. Fix api_keys table
-- =============================================================================

-- Add missing columns to api_keys table
-- First add as nullable, then populate with defaults, then make NOT NULL

-- key_prefix: required, derive from store_id if missing
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "key_prefix" VARCHAR(50);

-- identity_payload: required, set placeholder if missing
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "identity_payload" TEXT;

-- payload_version: has default
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "payload_version" INTEGER NOT NULL DEFAULT 1;

-- last_sync_at: nullable
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "last_sync_at" TIMESTAMPTZ(6);

-- updated_at: required with default
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Populate key_prefix for existing rows (if any have NULL)
UPDATE "api_keys"
SET "key_prefix" = CONCAT('nuvpos_sk_', LEFT(store_id::text, 8))
WHERE "key_prefix" IS NULL;

-- Populate identity_payload for existing rows (if any have NULL)
-- Use a placeholder JWT that indicates migration-created data
UPDATE "api_keys"
SET "identity_payload" = 'MIGRATED_PLACEHOLDER'
WHERE "identity_payload" IS NULL;

-- Now make the columns NOT NULL
ALTER TABLE "api_keys" ALTER COLUMN "key_prefix" SET NOT NULL;
ALTER TABLE "api_keys" ALTER COLUMN "identity_payload" SET NOT NULL;

-- Rename grace_period_ends_at to rotation_grace_ends_at if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_keys' AND column_name = 'grace_period_ends_at'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_keys' AND column_name = 'rotation_grace_ends_at'
    ) THEN
        ALTER TABLE "api_keys" RENAME COLUMN "grace_period_ends_at" TO "rotation_grace_ends_at";
    END IF;
END $$;

-- Add rotation_grace_ends_at if it doesn't exist (for fresh installs)
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "rotation_grace_ends_at" TIMESTAMPTZ(6);

-- Update default values to match schema
ALTER TABLE "api_keys" ALTER COLUMN "rate_limit_rpm" SET DEFAULT 100;
ALTER TABLE "api_keys" ALTER COLUMN "daily_sync_quota" SET DEFAULT 1000;
ALTER TABLE "api_keys" ALTER COLUMN "monthly_data_quota_mb" SET DEFAULT 10000;

-- Change revocation_notes from TEXT to VARCHAR(500)
ALTER TABLE "api_keys" ALTER COLUMN "revocation_notes" TYPE VARCHAR(500);

-- Create index on key_prefix for lookups
CREATE INDEX IF NOT EXISTS "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");

-- =============================================================================
-- 2. Fix api_key_audit_events table
-- =============================================================================

-- Rename event_id to audit_event_id if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_key_audit_events' AND column_name = 'event_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_key_audit_events' AND column_name = 'audit_event_id'
    ) THEN
        -- First drop the primary key constraint
        ALTER TABLE "api_key_audit_events" DROP CONSTRAINT IF EXISTS "api_key_audit_events_pkey";
        -- Rename the column
        ALTER TABLE "api_key_audit_events" RENAME COLUMN "event_id" TO "audit_event_id";
        -- Recreate the primary key
        ALTER TABLE "api_key_audit_events" ADD CONSTRAINT "api_key_audit_events_pkey" PRIMARY KEY ("audit_event_id");
    END IF;
END $$;

-- Add missing actor_type column
ALTER TABLE "api_key_audit_events" ADD COLUMN IF NOT EXISTS "actor_type" VARCHAR(20) NOT NULL DEFAULT 'ADMIN';

-- Rename details to event_details if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_key_audit_events' AND column_name = 'details'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_key_audit_events' AND column_name = 'event_details'
    ) THEN
        ALTER TABLE "api_key_audit_events" RENAME COLUMN "details" TO "event_details";
    END IF;
END $$;

-- Add event_details if it doesn't exist (for fresh installs)
ALTER TABLE "api_key_audit_events" ADD COLUMN IF NOT EXISTS "event_details" JSONB;

-- Change user_agent type to match schema (VARCHAR(500))
ALTER TABLE "api_key_audit_events" ALTER COLUMN "user_agent" TYPE VARCHAR(500);

-- =============================================================================
-- 3. Fix api_key_sync_sessions table
-- =============================================================================

-- Rename session_id to sync_session_id if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_key_sync_sessions' AND column_name = 'session_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_key_sync_sessions' AND column_name = 'sync_session_id'
    ) THEN
        -- First drop the primary key constraint
        ALTER TABLE "api_key_sync_sessions" DROP CONSTRAINT IF EXISTS "api_key_sync_sessions_pkey";
        -- Rename the column
        ALTER TABLE "api_key_sync_sessions" RENAME COLUMN "session_id" TO "sync_session_id";
        -- Recreate the primary key
        ALTER TABLE "api_key_sync_sessions" ADD CONSTRAINT "api_key_sync_sessions_pkey" PRIMARY KEY ("sync_session_id");
    END IF;
END $$;

-- Add missing columns to api_key_sync_sessions
ALTER TABLE "api_key_sync_sessions" ADD COLUMN IF NOT EXISTS "server_time_at_start" TIMESTAMPTZ(6);
ALTER TABLE "api_key_sync_sessions" ADD COLUMN IF NOT EXISTS "conflicts_detected" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "api_key_sync_sessions" ADD COLUMN IF NOT EXISTS "offline_duration_seconds" INTEGER;
ALTER TABLE "api_key_sync_sessions" ADD COLUMN IF NOT EXISTS "offline_transactions_synced" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "api_key_sync_sessions" ADD COLUMN IF NOT EXISTS "session_error" VARCHAR(1000);

-- Set default for server_time_at_start for existing rows
UPDATE "api_key_sync_sessions"
SET "server_time_at_start" = "session_started_at"
WHERE "server_time_at_start" IS NULL;

-- Now make server_time_at_start NOT NULL after populating
ALTER TABLE "api_key_sync_sessions" ALTER COLUMN "server_time_at_start" SET NOT NULL;

-- Rename last_sequence_number to last_sync_sequence if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_key_sync_sessions' AND column_name = 'last_sequence_number'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_key_sync_sessions' AND column_name = 'last_sync_sequence'
    ) THEN
        ALTER TABLE "api_key_sync_sessions" RENAME COLUMN "last_sequence_number" TO "last_sync_sequence";
    END IF;
END $$;

-- Add last_sync_sequence if it doesn't exist
ALTER TABLE "api_key_sync_sessions" ADD COLUMN IF NOT EXISTS "last_sync_sequence" BIGINT NOT NULL DEFAULT 0;

-- Expand sync_status column to VARCHAR(50)
ALTER TABLE "api_key_sync_sessions" ALTER COLUMN "sync_status" TYPE VARCHAR(50);

-- =============================================================================
-- 4. Update ApiKeyAuditEventType enum to match schema
-- =============================================================================

-- Add missing enum values if they don't exist
-- Note: PostgreSQL requires explicit handling to add enum values
-- Only run if the enum type exists
DO $$
BEGIN
    -- Check if enum type exists before trying to modify it
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apikeyauditeventtype') THEN
        -- Add REACTIVATED if it doesn't exist
        BEGIN
            ALTER TYPE "ApiKeyAuditEventType" ADD VALUE IF NOT EXISTS 'REACTIVATED';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        -- Add HEARTBEAT if it doesn't exist
        BEGIN
            ALTER TYPE "ApiKeyAuditEventType" ADD VALUE IF NOT EXISTS 'HEARTBEAT';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        -- Add METADATA_UPDATED if it doesn't exist
        BEGIN
            ALTER TYPE "ApiKeyAuditEventType" ADD VALUE IF NOT EXISTS 'METADATA_UPDATED';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        -- Add SETTINGS_UPDATED if it doesn't exist
        BEGIN
            ALTER TYPE "ApiKeyAuditEventType" ADD VALUE IF NOT EXISTS 'SETTINGS_UPDATED';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- =============================================================================
-- 5. Add updated_at trigger for api_keys table
-- =============================================================================

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_api_keys_updated_at ON "api_keys";
CREATE TRIGGER trigger_api_keys_updated_at
    BEFORE UPDATE ON "api_keys"
    FOR EACH ROW
    EXECUTE FUNCTION update_api_keys_updated_at();
