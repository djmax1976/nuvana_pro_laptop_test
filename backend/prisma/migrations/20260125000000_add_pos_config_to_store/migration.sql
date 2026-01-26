-- Add POS connection configuration to stores
-- This allows desktop apps to get POS connection settings at the store level
-- Terminals are discovered dynamically AFTER connecting to the POS

-- Add pos_type column with default MANUAL_ENTRY
ALTER TABLE "stores" ADD COLUMN "pos_type" "POSSystemType" NOT NULL DEFAULT 'MANUAL_ENTRY';

-- Add pos_connection_type column with default MANUAL
ALTER TABLE "stores" ADD COLUMN "pos_connection_type" "POSConnectionType" NOT NULL DEFAULT 'MANUAL';

-- Add pos_connection_config JSONB column for connection-specific settings
ALTER TABLE "stores" ADD COLUMN "pos_connection_config" JSONB;

-- Add index for POS type filtering (find all stores using a specific POS)
CREATE INDEX "stores_pos_type_idx" ON "stores"("pos_type");
