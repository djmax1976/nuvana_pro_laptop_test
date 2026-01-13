-- Migration: Add User PIN and API Key Management System
-- Description: Adds PIN authentication for users, API key management for store agents,
--              and related audit/sync tables

-- =============================================================================
-- 1. User PIN Fields
-- =============================================================================

-- Add PIN fields to users table (for offline authentication)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pin_hash" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sha256_pin_fingerprint" VARCHAR(64);

-- Index for PIN fingerprint lookups
CREATE INDEX IF NOT EXISTS "users_sha256_pin_fingerprint_idx" ON "users"("sha256_pin_fingerprint");

-- =============================================================================
-- 2. API Key Status Enum
-- =============================================================================

-- Create API key status enum
DO $$ BEGIN
    CREATE TYPE "ApiKeyStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 3. API Key Revocation Reason Enum
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE "ApiKeyRevocationReason" AS ENUM ('ADMIN_ACTION', 'COMPROMISED', 'STORE_CLOSED', 'QUOTA_ABUSE', 'ROTATION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 4. API Key Audit Event Type Enum
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE "ApiKeyAuditEventType" AS ENUM (
        'CREATED',
        'ACTIVATED',
        'SUSPENDED',
        'UNSUSPENDED',
        'REVOKED',
        'ROTATED',
        'EXPIRED',
        'USED',
        'IP_BLOCKED',
        'RATE_LIMITED',
        'QUOTA_WARNING',
        'QUOTA_EXCEEDED',
        'CONFIG_UPDATED',
        'SYNC_STARTED',
        'SYNC_COMPLETED',
        'SYNC_FAILED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 5. API Keys Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS "api_keys" (
    "api_key_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_suffix" VARCHAR(4) NOT NULL,
    "label" VARCHAR(100),
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'PENDING',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "last_used_ip" VARCHAR(45),
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revocation_reason" "ApiKeyRevocationReason",
    "revocation_notes" TEXT,
    "suspended_at" TIMESTAMPTZ(6),
    "suspended_reason" TEXT,
    "rotated_from_key_id" UUID,
    "grace_period_ends_at" TIMESTAMPTZ(6),
    "ip_allowlist" TEXT[],
    "ip_enforcement_enabled" BOOLEAN NOT NULL DEFAULT false,
    "rate_limit_rpm" INTEGER NOT NULL DEFAULT 60,
    "daily_sync_quota" INTEGER NOT NULL DEFAULT 100,
    "monthly_data_quota_mb" INTEGER NOT NULL DEFAULT 1000,
    "current_month_data_mb" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "quota_reset_at" TIMESTAMPTZ(6),
    "device_fingerprint" VARCHAR(64),
    "app_version" VARCHAR(50),
    "os_info" VARCHAR(100),
    "metadata" JSONB,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("api_key_id")
);

-- API Keys indexes
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX IF NOT EXISTS "api_keys_store_id_idx" ON "api_keys"("store_id");
CREATE INDEX IF NOT EXISTS "api_keys_company_id_idx" ON "api_keys"("company_id");
CREATE INDEX IF NOT EXISTS "api_keys_status_idx" ON "api_keys"("status");
CREATE INDEX IF NOT EXISTS "api_keys_store_id_status_idx" ON "api_keys"("store_id", "status");
CREATE INDEX IF NOT EXISTS "api_keys_created_by_idx" ON "api_keys"("created_by");
CREATE INDEX IF NOT EXISTS "api_keys_expires_at_idx" ON "api_keys"("expires_at");
CREATE INDEX IF NOT EXISTS "api_keys_last_used_at_idx" ON "api_keys"("last_used_at");
CREATE INDEX IF NOT EXISTS "api_keys_created_at_idx" ON "api_keys"("created_at");

-- API Keys foreign keys
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_store_id_fkey";
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_company_id_fkey";
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_created_by_fkey";
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_revoked_by_fkey";
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_revoked_by_fkey"
    FOREIGN KEY ("revoked_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_rotated_from_key_id_fkey";
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_rotated_from_key_id_fkey"
    FOREIGN KEY ("rotated_from_key_id") REFERENCES "api_keys"("api_key_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- 6. API Key Audit Events Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS "api_key_audit_events" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "api_key_id" UUID NOT NULL,
    "event_type" "ApiKeyAuditEventType" NOT NULL,
    "actor_user_id" UUID,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_audit_events_pkey" PRIMARY KEY ("event_id")
);

-- Audit events indexes
CREATE INDEX IF NOT EXISTS "api_key_audit_events_api_key_id_idx" ON "api_key_audit_events"("api_key_id");
CREATE INDEX IF NOT EXISTS "api_key_audit_events_api_key_id_created_at_idx" ON "api_key_audit_events"("api_key_id", "created_at");
CREATE INDEX IF NOT EXISTS "api_key_audit_events_event_type_idx" ON "api_key_audit_events"("event_type");
CREATE INDEX IF NOT EXISTS "api_key_audit_events_actor_user_id_idx" ON "api_key_audit_events"("actor_user_id");
CREATE INDEX IF NOT EXISTS "api_key_audit_events_ip_address_idx" ON "api_key_audit_events"("ip_address");
CREATE INDEX IF NOT EXISTS "api_key_audit_events_created_at_idx" ON "api_key_audit_events"("created_at");

-- Audit events foreign keys
ALTER TABLE "api_key_audit_events" DROP CONSTRAINT IF EXISTS "api_key_audit_events_api_key_id_fkey";
ALTER TABLE "api_key_audit_events" ADD CONSTRAINT "api_key_audit_events_api_key_id_fkey"
    FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("api_key_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_key_audit_events" DROP CONSTRAINT IF EXISTS "api_key_audit_events_actor_user_id_fkey";
ALTER TABLE "api_key_audit_events" ADD CONSTRAINT "api_key_audit_events_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- 7. API Key Sync Sessions Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS "api_key_sync_sessions" (
    "session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "api_key_id" UUID NOT NULL,
    "device_fingerprint" VARCHAR(64) NOT NULL,
    "app_version" VARCHAR(50) NOT NULL,
    "os_info" VARCHAR(100),
    "session_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_ended_at" TIMESTAMPTZ(6),
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sync_status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "records_pulled" INTEGER NOT NULL DEFAULT 0,
    "records_pushed" INTEGER NOT NULL DEFAULT 0,
    "conflicts_resolved" INTEGER NOT NULL DEFAULT 0,
    "data_transferred_bytes" BIGINT NOT NULL DEFAULT 0,
    "last_sequence_number" BIGINT NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "api_key_sync_sessions_pkey" PRIMARY KEY ("session_id")
);

-- Sync sessions indexes
CREATE INDEX IF NOT EXISTS "api_key_sync_sessions_api_key_id_idx" ON "api_key_sync_sessions"("api_key_id");
CREATE INDEX IF NOT EXISTS "api_key_sync_sessions_api_key_id_session_started_at_idx" ON "api_key_sync_sessions"("api_key_id", "session_started_at");
CREATE INDEX IF NOT EXISTS "api_key_sync_sessions_device_fingerprint_idx" ON "api_key_sync_sessions"("device_fingerprint");
CREATE INDEX IF NOT EXISTS "api_key_sync_sessions_sync_status_idx" ON "api_key_sync_sessions"("sync_status");
CREATE INDEX IF NOT EXISTS "api_key_sync_sessions_session_started_at_idx" ON "api_key_sync_sessions"("session_started_at");

-- Sync sessions foreign key
ALTER TABLE "api_key_sync_sessions" DROP CONSTRAINT IF EXISTS "api_key_sync_sessions_api_key_id_fkey";
ALTER TABLE "api_key_sync_sessions" ADD CONSTRAINT "api_key_sync_sessions_api_key_id_fkey"
    FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("api_key_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- 8. Elevated Access Audit (for manager overrides)
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE "ElevatedAccessEventType" AS ENUM (
        'ELEVATED_TOKEN_ISSUED',
        'ELEVATED_TOKEN_USED',
        'ELEVATED_TOKEN_EXPIRED',
        'ELEVATED_TOKEN_REVOKED',
        'MANAGER_OVERRIDE_REQUESTED',
        'MANAGER_OVERRIDE_APPROVED',
        'MANAGER_OVERRIDE_DENIED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ElevatedAccessResult" AS ENUM (
        'SUCCESS',
        'FAILED_CREDENTIALS',
        'FAILED_PERMISSION',
        'FAILED_RATE_LIMIT',
        'FAILED_TOKEN_EXPIRED',
        'FAILED_TOKEN_INVALID',
        'FAILED_TOKEN_USED',
        'FAILED_SCOPE_MISMATCH',
        'FAILED_STORE_ACCESS'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "elevated_access_audit" (
    "audit_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "event_type" "ElevatedAccessEventType" NOT NULL,
    "result" "ElevatedAccessResult" NOT NULL,
    "requester_user_id" UUID,
    "approver_user_id" UUID,
    "token_hash" VARCHAR(64),
    "action_performed" TEXT,
    "resource_type" VARCHAR(100),
    "resource_id" VARCHAR(100),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "elevated_access_audit_pkey" PRIMARY KEY ("audit_id")
);

-- Elevated access indexes
CREATE INDEX IF NOT EXISTS "elevated_access_audit_store_id_idx" ON "elevated_access_audit"("store_id");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_event_type_idx" ON "elevated_access_audit"("event_type");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_requester_user_id_idx" ON "elevated_access_audit"("requester_user_id");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_approver_user_id_idx" ON "elevated_access_audit"("approver_user_id");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_created_at_idx" ON "elevated_access_audit"("created_at");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_token_hash_idx" ON "elevated_access_audit"("token_hash");

-- Elevated access foreign keys
ALTER TABLE "elevated_access_audit" DROP CONSTRAINT IF EXISTS "elevated_access_audit_store_id_fkey";
ALTER TABLE "elevated_access_audit" ADD CONSTRAINT "elevated_access_audit_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "elevated_access_audit" DROP CONSTRAINT IF EXISTS "elevated_access_audit_requester_user_id_fkey";
ALTER TABLE "elevated_access_audit" ADD CONSTRAINT "elevated_access_audit_requester_user_id_fkey"
    FOREIGN KEY ("requester_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "elevated_access_audit" DROP CONSTRAINT IF EXISTS "elevated_access_audit_approver_user_id_fkey";
ALTER TABLE "elevated_access_audit" ADD CONSTRAINT "elevated_access_audit_approver_user_id_fkey"
    FOREIGN KEY ("approver_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
