-- CreateEnum: Add POSConnectionType enum
CREATE TYPE "POSConnectionType" AS ENUM ('NETWORK', 'API', 'WEBHOOK', 'FILE', 'MANUAL');

-- CreateEnum: Add POSVendorType enum
CREATE TYPE "POSVendorType" AS ENUM ('GENERIC', 'SQUARE', 'CLOVER', 'TOAST', 'LIGHTSPEED', 'CUSTOM');

-- CreateEnum: Add POSTerminalStatus enum
CREATE TYPE "POSTerminalStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'ERROR');

-- CreateEnum: Add SyncStatus enum
CREATE TYPE "SyncStatus" AS ENUM ('NEVER', 'SUCCESS', 'FAILED', 'IN_PROGRESS');

-- AlterTable: Add connection fields to POSTerminal model
ALTER TABLE "pos_terminals" ADD COLUMN "connection_type" "POSConnectionType" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "pos_terminals" ADD COLUMN "connection_config" JSONB;
ALTER TABLE "pos_terminals" ADD COLUMN "vendor_type" "POSVendorType" NOT NULL DEFAULT 'GENERIC';
ALTER TABLE "pos_terminals" ADD COLUMN "terminal_status" "POSTerminalStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "pos_terminals" ADD COLUMN "last_sync_at" TIMESTAMPTZ(6);
ALTER TABLE "pos_terminals" ADD COLUMN "sync_status" "SyncStatus" NOT NULL DEFAULT 'NEVER';

-- AlterTable: Add external reference fields to Shift model
ALTER TABLE "shifts" ADD COLUMN "external_shift_id" VARCHAR(255);
ALTER TABLE "shifts" ADD COLUMN "external_data" JSONB;
ALTER TABLE "shifts" ADD COLUMN "synced_at" TIMESTAMPTZ(6);

-- Set sensible defaults for existing terminals (already set via DEFAULT clauses above)
-- All existing terminals will automatically get:
-- connection_type = 'MANUAL'
-- vendor_type = 'GENERIC'
-- terminal_status = 'ACTIVE'
-- sync_status = 'NEVER'

