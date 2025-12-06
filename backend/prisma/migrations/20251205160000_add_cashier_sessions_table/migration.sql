-- CreateTable: CashierSessions
-- This table stores cashier session tokens for terminal operations
-- Sessions are created when a cashier authenticates via PIN on a terminal
CREATE TABLE "cashier_sessions" (
    "session_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "terminal_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "session_token_hash" VARCHAR(64) NOT NULL,
    "authenticated_by" UUID NOT NULL,
    "shift_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cashier_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex: unique session_token_hash
CREATE UNIQUE INDEX "cashier_sessions_session_token_hash_key" ON "cashier_sessions"("session_token_hash");

-- CreateIndex: session_token_hash for lookups
CREATE INDEX "cashier_sessions_session_token_hash_idx" ON "cashier_sessions"("session_token_hash");

-- CreateIndex: terminal_id + is_active for active session lookups
CREATE INDEX "cashier_sessions_terminal_id_is_active_idx" ON "cashier_sessions"("terminal_id", "is_active");

-- CreateIndex: cashier_id + is_active for session management
CREATE INDEX "cashier_sessions_cashier_id_is_active_idx" ON "cashier_sessions"("cashier_id", "is_active");

-- CreateIndex: expires_at for cleanup queries
CREATE INDEX "cashier_sessions_expires_at_idx" ON "cashier_sessions"("expires_at");

-- AddForeignKey: cashier reference
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "cashiers"("cashier_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: terminal reference
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "pos_terminals"("pos_terminal_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: store reference
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: authenticated_by user reference
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_authenticated_by_fkey" FOREIGN KEY ("authenticated_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: shift reference (optional)
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;
