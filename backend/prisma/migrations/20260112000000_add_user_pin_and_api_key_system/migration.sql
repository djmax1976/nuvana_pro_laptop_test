-- Migration: Add User PIN and API Key Management System
-- Description: Adds PIN authentication for users, API key management for store agents,
--              and related audit/sync tables
--
-- This migration creates tables that EXACTLY match the Prisma schema definitions.
-- Column names, types, defaults, and constraints are aligned 1:1 with schema.prisma

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

DO $$ BEGIN
    CREATE TYPE "ApiKeyStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 3. API Key Revocation Reason Enum
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE "ApiKeyRevocationReason" AS ENUM ('ROTATION', 'COMPROMISED', 'STORE_CLOSED', 'ADMIN_ACTION', 'QUOTA_ABUSE');
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
-- 5. Elevated Access Event Type Enum
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE "ElevatedAccessEventType" AS ENUM (
        'ELEVATION_REQUESTED',
        'ELEVATION_GRANTED',
        'ELEVATION_DENIED',
        'ELEVATION_EXPIRED',
        'ELEVATION_USED',
        'ELEVATION_REVOKED',
        'ELEVATION_RATE_LIMITED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 6. Elevated Access Result Enum
-- =============================================================================

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

-- =============================================================================
-- 7. API Keys Table (matches Prisma schema EXACTLY)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "api_keys" (
    -- Primary Key
    "api_key_id" UUID NOT NULL DEFAULT gen_random_uuid(),

    -- Store Binding (Required)
    "store_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,

    -- Key Identification
    "key_prefix" VARCHAR(50) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_suffix" VARCHAR(4) NOT NULL,
    "label" VARCHAR(100),

    -- Offline Identity Payload (Required)
    "identity_payload" TEXT NOT NULL,
    "payload_version" INTEGER NOT NULL DEFAULT 1,

    -- Extensible Metadata
    "metadata" JSONB,

    -- Security Settings
    "ip_allowlist" TEXT[] NOT NULL DEFAULT '{}',
    "ip_enforcement_enabled" BOOLEAN NOT NULL DEFAULT false,

    -- Usage Quotas (defaults match schema)
    "rate_limit_rpm" INTEGER NOT NULL DEFAULT 100,
    "daily_sync_quota" INTEGER NOT NULL DEFAULT 1000,
    "monthly_data_quota_mb" INTEGER NOT NULL DEFAULT 10000,

    -- Lifecycle
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'PENDING',
    "activated_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "last_sync_at" TIMESTAMPTZ(6),
    "device_fingerprint" VARCHAR(64),

    -- Revocation
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revocation_reason" "ApiKeyRevocationReason",
    "revocation_notes" VARCHAR(500),

    -- Rotation Tracking
    "rotated_from_key_id" UUID,
    "rotation_grace_ends_at" TIMESTAMPTZ(6),

    -- Audit
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("api_key_id")
);

-- API Keys indexes (match @@index declarations in schema)
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX IF NOT EXISTS "api_keys_store_id_idx" ON "api_keys"("store_id");
CREATE INDEX IF NOT EXISTS "api_keys_company_id_idx" ON "api_keys"("company_id");
CREATE INDEX IF NOT EXISTS "api_keys_status_idx" ON "api_keys"("status");
CREATE INDEX IF NOT EXISTS "api_keys_key_hash_idx" ON "api_keys"("key_hash");
CREATE INDEX IF NOT EXISTS "api_keys_store_id_status_idx" ON "api_keys"("store_id", "status");
CREATE INDEX IF NOT EXISTS "api_keys_expires_at_idx" ON "api_keys"("expires_at");
CREATE INDEX IF NOT EXISTS "api_keys_last_used_at_idx" ON "api_keys"("last_used_at");
CREATE INDEX IF NOT EXISTS "api_keys_created_by_idx" ON "api_keys"("created_by");
CREATE INDEX IF NOT EXISTS "api_keys_created_at_idx" ON "api_keys"("created_at");

-- API Keys foreign keys (match @relation declarations)
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
-- 8. API Key Audit Events Table (matches Prisma schema EXACTLY)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "api_key_audit_events" (
    -- Primary Key (schema uses audit_event_id, NOT event_id)
    "audit_event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "api_key_id" UUID NOT NULL,

    -- Event
    "event_type" "ApiKeyAuditEventType" NOT NULL,

    -- Actor (actor_type is REQUIRED in schema)
    "actor_user_id" UUID,
    "actor_type" VARCHAR(20) NOT NULL,

    -- Context
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),

    -- Event Details (schema uses event_details, NOT details)
    "event_details" JSONB,

    -- Timestamp
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_audit_events_pkey" PRIMARY KEY ("audit_event_id")
);

-- Audit events indexes (match @@index declarations)
CREATE INDEX IF NOT EXISTS "api_key_audit_events_api_key_id_idx" ON "api_key_audit_events"("api_key_id");
CREATE INDEX IF NOT EXISTS "api_key_audit_events_event_type_idx" ON "api_key_audit_events"("event_type");
CREATE INDEX IF NOT EXISTS "api_key_audit_events_created_at_idx" ON "api_key_audit_events"("created_at");
CREATE INDEX IF NOT EXISTS "api_key_audit_events_api_key_id_created_at_idx" ON "api_key_audit_events"("api_key_id", "created_at");
CREATE INDEX IF NOT EXISTS "api_key_audit_events_actor_user_id_idx" ON "api_key_audit_events"("actor_user_id");
CREATE INDEX IF NOT EXISTS "api_key_audit_events_ip_address_idx" ON "api_key_audit_events"("ip_address");

-- Audit events foreign keys
ALTER TABLE "api_key_audit_events" DROP CONSTRAINT IF EXISTS "api_key_audit_events_api_key_id_fkey";
ALTER TABLE "api_key_audit_events" ADD CONSTRAINT "api_key_audit_events_api_key_id_fkey"
    FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("api_key_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_key_audit_events" DROP CONSTRAINT IF EXISTS "api_key_audit_events_actor_user_id_fkey";
ALTER TABLE "api_key_audit_events" ADD CONSTRAINT "api_key_audit_events_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- 9. API Key Sync Sessions Table (matches Prisma schema EXACTLY)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "api_key_sync_sessions" (
    -- Primary Key (schema uses sync_session_id, NOT session_id)
    "sync_session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "api_key_id" UUID NOT NULL,

    -- Session Timing
    "session_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_ended_at" TIMESTAMPTZ(6),

    -- Device Info
    "device_fingerprint" VARCHAR(64) NOT NULL,
    "app_version" VARCHAR(50) NOT NULL,
    "os_info" VARCHAR(100),

    -- Sync Context (server_time_at_start is REQUIRED in schema)
    "server_time_at_start" TIMESTAMPTZ(6) NOT NULL,
    "last_sync_sequence" BIGINT NOT NULL DEFAULT 0,

    -- Sync Statistics
    "records_pulled" INTEGER NOT NULL DEFAULT 0,
    "records_pushed" INTEGER NOT NULL DEFAULT 0,
    "conflicts_detected" INTEGER NOT NULL DEFAULT 0,
    "conflicts_resolved" INTEGER NOT NULL DEFAULT 0,

    -- Offline Period
    "offline_duration_seconds" INTEGER,
    "offline_transactions_synced" INTEGER NOT NULL DEFAULT 0,

    -- Status (VARCHAR(50) to match schema)
    "sync_status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',

    -- Error
    "session_error" VARCHAR(1000),

    CONSTRAINT "api_key_sync_sessions_pkey" PRIMARY KEY ("sync_session_id")
);

-- Sync sessions indexes (match @@index declarations)
CREATE INDEX IF NOT EXISTS "api_key_sync_sessions_api_key_id_idx" ON "api_key_sync_sessions"("api_key_id");
CREATE INDEX IF NOT EXISTS "api_key_sync_sessions_session_started_at_idx" ON "api_key_sync_sessions"("session_started_at");
CREATE INDEX IF NOT EXISTS "api_key_sync_sessions_device_fingerprint_idx" ON "api_key_sync_sessions"("device_fingerprint");
CREATE INDEX IF NOT EXISTS "api_key_sync_sessions_sync_status_idx" ON "api_key_sync_sessions"("sync_status");
CREATE INDEX IF NOT EXISTS "api_key_sync_sessions_api_key_id_session_started_at_idx" ON "api_key_sync_sessions"("api_key_id", "session_started_at");

-- Sync sessions foreign key
ALTER TABLE "api_key_sync_sessions" DROP CONSTRAINT IF EXISTS "api_key_sync_sessions_api_key_id_fkey";
ALTER TABLE "api_key_sync_sessions" ADD CONSTRAINT "api_key_sync_sessions_api_key_id_fkey"
    FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("api_key_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- 10. Elevated Access Audit Table (matches Prisma schema EXACTLY)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "elevated_access_audit" (
    "audit_id" UUID NOT NULL DEFAULT gen_random_uuid(),

    -- User context
    "user_id" UUID NOT NULL,
    "user_email" VARCHAR(255) NOT NULL,

    -- Session binding
    "session_id" VARCHAR(64),

    -- Event details
    "event_type" "ElevatedAccessEventType" NOT NULL,
    "result" "ElevatedAccessResult" NOT NULL,

    -- Permission and scope
    "requested_permission" VARCHAR(100) NOT NULL,
    "store_id" UUID,

    -- Token tracking
    "token_jti" VARCHAR(64),
    "token_issued_at" TIMESTAMPTZ(6),
    "token_expires_at" TIMESTAMPTZ(6),
    "token_used_at" TIMESTAMPTZ(6),

    -- Request metadata
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" VARCHAR(500),
    "request_id" VARCHAR(64),

    -- Error details
    "error_code" VARCHAR(50),
    "error_message" VARCHAR(500),

    -- Rate limiting context
    "attempt_count" INTEGER,
    "rate_limit_window" TIMESTAMPTZ(6),

    -- Timestamps
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elevated_access_audit_pkey" PRIMARY KEY ("audit_id")
);

-- Elevated access unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "elevated_access_audit_token_jti_key" ON "elevated_access_audit"("token_jti");

-- Elevated access indexes (match @@index declarations)
CREATE INDEX IF NOT EXISTS "elevated_access_audit_user_id_idx" ON "elevated_access_audit"("user_id");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_user_email_idx" ON "elevated_access_audit"("user_email");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_event_type_idx" ON "elevated_access_audit"("event_type");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_result_idx" ON "elevated_access_audit"("result");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_store_id_idx" ON "elevated_access_audit"("store_id");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_token_jti_idx" ON "elevated_access_audit"("token_jti");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_ip_address_idx" ON "elevated_access_audit"("ip_address");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_created_at_idx" ON "elevated_access_audit"("created_at");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_user_id_created_at_idx" ON "elevated_access_audit"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_user_id_event_type_created_at_idx" ON "elevated_access_audit"("user_id", "event_type", "created_at");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_ip_address_created_at_idx" ON "elevated_access_audit"("ip_address", "created_at");
CREATE INDEX IF NOT EXISTS "elevated_access_audit_result_created_at_idx" ON "elevated_access_audit"("result", "created_at");

-- Elevated access foreign keys
ALTER TABLE "elevated_access_audit" DROP CONSTRAINT IF EXISTS "elevated_access_audit_user_id_fkey";
ALTER TABLE "elevated_access_audit" ADD CONSTRAINT "elevated_access_audit_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "elevated_access_audit" DROP CONSTRAINT IF EXISTS "elevated_access_audit_store_id_fkey";
ALTER TABLE "elevated_access_audit" ADD CONSTRAINT "elevated_access_audit_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- 11. Auto-update trigger for api_keys.updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_api_keys_updated_at ON "api_keys";
CREATE TRIGGER trigger_api_keys_updated_at
    BEFORE UPDATE ON "api_keys"
    FOR EACH ROW
    EXECUTE FUNCTION update_api_keys_updated_at();
