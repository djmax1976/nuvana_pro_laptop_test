-- Manual migration for ElevatedAccessAudit table
-- This is created separately due to migration drift issues
-- Run with: psql -f manual_elevated_access_audit.sql

-- Create the enum types if they don't exist
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

-- Create the elevated_access_audit table
CREATE TABLE IF NOT EXISTS "elevated_access_audit" (
    "audit_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "user_email" VARCHAR(255) NOT NULL,
    "session_id" VARCHAR(64),
    "event_type" "ElevatedAccessEventType" NOT NULL,
    "result" "ElevatedAccessResult" NOT NULL,
    "requested_permission" VARCHAR(100) NOT NULL,
    "store_id" UUID,
    "token_jti" VARCHAR(64),
    "token_issued_at" TIMESTAMP(3),
    "token_expires_at" TIMESTAMP(3),
    "token_used_at" TIMESTAMP(3),
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" VARCHAR(500),
    "request_id" VARCHAR(64),
    "error_code" VARCHAR(50),
    "error_message" VARCHAR(500),
    "attempt_count" INTEGER,
    "rate_limit_window" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elevated_access_audit_pkey" PRIMARY KEY ("audit_id")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "elevated_access_audit_user_id_idx"
    ON "elevated_access_audit"("user_id");

CREATE INDEX IF NOT EXISTS "elevated_access_audit_event_type_idx"
    ON "elevated_access_audit"("event_type");

CREATE INDEX IF NOT EXISTS "elevated_access_audit_created_at_idx"
    ON "elevated_access_audit"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "elevated_access_audit_ip_rate_limit_idx"
    ON "elevated_access_audit"("ip_address", "event_type", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "elevated_access_audit_token_jti_key"
    ON "elevated_access_audit"("token_jti");

-- Add foreign keys
DO $$ BEGIN
    ALTER TABLE "elevated_access_audit"
        ADD CONSTRAINT "elevated_access_audit_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "elevated_access_audit"
        ADD CONSTRAINT "elevated_access_audit_store_id_fkey"
        FOREIGN KEY ("store_id") REFERENCES "stores"("store_id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Verify creation
SELECT 'elevated_access_audit table created successfully' AS status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'elevated_access_audit');
