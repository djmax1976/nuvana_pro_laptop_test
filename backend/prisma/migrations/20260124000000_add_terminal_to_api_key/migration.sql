-- Add terminal binding to API keys
-- This allows desktop apps to retrieve terminal configuration via the sync API

-- Add the pos_terminal_id column to api_keys table
ALTER TABLE "api_keys" ADD COLUMN "pos_terminal_id" UUID;

-- Add foreign key constraint with SET NULL on delete
-- When a terminal is deleted, the API key remains but loses its terminal binding
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_pos_terminal_id_fkey"
FOREIGN KEY ("pos_terminal_id")
REFERENCES "pos_terminals"("pos_terminal_id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Add index for efficient terminal lookups
CREATE INDEX "api_keys_pos_terminal_id_idx" ON "api_keys"("pos_terminal_id");
