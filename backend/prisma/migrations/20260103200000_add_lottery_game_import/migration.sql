-- ============================================================================
-- Migration: Add Lottery Game Import Table
-- ============================================================================
-- Enterprise bulk import for lottery games with two-phase commit pattern
-- Enables: Validate CSV → Preview Results → Commit (or Cancel)
-- ============================================================================

-- Create lottery_game_imports table
CREATE TABLE "lottery_game_imports" (
    "import_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "validation_token" UUID NOT NULL DEFAULT gen_random_uuid(),

    -- Scoping
    "state_id" UUID NOT NULL,

    -- User Context
    "created_by_user_id" UUID NOT NULL,

    -- Validated Data (JSON array of parsed rows)
    "validated_data" JSONB NOT NULL,

    -- Import Options
    "import_options" JSONB NOT NULL,

    -- Summary Stats
    "total_rows" INTEGER NOT NULL,
    "valid_rows" INTEGER NOT NULL,
    "error_rows" INTEGER NOT NULL,
    "duplicate_rows" INTEGER NOT NULL,

    -- Lifecycle
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "committed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Commit Results
    "commit_result" JSONB,

    CONSTRAINT "lottery_game_imports_pkey" PRIMARY KEY ("import_id")
);

-- Unique constraint on validation token
CREATE UNIQUE INDEX "lottery_game_imports_validation_token_key"
    ON "lottery_game_imports"("validation_token");

-- Performance indexes
CREATE INDEX "lottery_game_imports_validation_token_idx"
    ON "lottery_game_imports"("validation_token");

CREATE INDEX "lottery_game_imports_state_id_idx"
    ON "lottery_game_imports"("state_id");

CREATE INDEX "lottery_game_imports_created_by_user_id_idx"
    ON "lottery_game_imports"("created_by_user_id");

CREATE INDEX "lottery_game_imports_expires_at_idx"
    ON "lottery_game_imports"("expires_at");

CREATE INDEX "lottery_game_imports_committed_at_idx"
    ON "lottery_game_imports"("committed_at");

-- Partial index for finding uncommitted imports that haven't expired
-- Useful for cleanup jobs
CREATE INDEX "lottery_game_imports_pending_idx"
    ON "lottery_game_imports"("expires_at")
    WHERE "committed_at" IS NULL;

-- Foreign key constraints
ALTER TABLE "lottery_game_imports"
    ADD CONSTRAINT "lottery_game_imports_state_id_fkey"
    FOREIGN KEY ("state_id")
    REFERENCES "us_states"("state_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lottery_game_imports"
    ADD CONSTRAINT "lottery_game_imports_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security (RLS)
-- Only users with SYSTEM scope or the import creator can view imports
ALTER TABLE "lottery_game_imports" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own imports (unless SYSTEM scope)
CREATE POLICY "lottery_game_imports_user_isolation"
    ON "lottery_game_imports"
    FOR ALL
    USING (
        created_by_user_id = current_setting('app.current_user_id', true)::uuid
        OR current_setting('app.current_scope', true) = 'SYSTEM'
    );

-- Add comment for documentation
COMMENT ON TABLE "lottery_game_imports" IS
    'Stores validated lottery game import jobs awaiting commit. Two-phase commit pattern enables preview before committing bulk changes.';

COMMENT ON COLUMN "lottery_game_imports"."validation_token" IS
    'Unique token for committing this import. Expires after 15 minutes.';

COMMENT ON COLUMN "lottery_game_imports"."validated_data" IS
    'JSON array of validated rows: { row_number, status, action, data, errors?, existing_game? }';

COMMENT ON COLUMN "lottery_game_imports"."import_options" IS
    'Options selected during validation: { skipDuplicates?, updateExisting? }';

COMMENT ON COLUMN "lottery_game_imports"."commit_result" IS
    'Summary populated after commit: { created, updated, skipped, failed }';
