-- Rollback migration: Remove pack activation tracking fields
-- Story 10.2: Database Schema & Pack Activation Tracking

-- DropForeignKeys: Remove foreign key constraints
ALTER TABLE "lottery_packs" DROP CONSTRAINT IF EXISTS "lottery_packs_activated_by_fkey";
ALTER TABLE "lottery_packs" DROP CONSTRAINT IF EXISTS "lottery_packs_activated_shift_id_fkey";
ALTER TABLE "lottery_packs" DROP CONSTRAINT IF EXISTS "lottery_packs_depleted_by_fkey";
ALTER TABLE "lottery_packs" DROP CONSTRAINT IF EXISTS "lottery_packs_depleted_shift_id_fkey";

-- DropIndex: Remove indexes
DROP INDEX IF EXISTS "lottery_packs_activated_by_idx";
DROP INDEX IF EXISTS "lottery_packs_activated_shift_id_idx";
DROP INDEX IF EXISTS "lottery_packs_depleted_by_idx";
DROP INDEX IF EXISTS "lottery_packs_depleted_shift_id_idx";

-- AlterTable: Remove columns
ALTER TABLE "lottery_packs" DROP COLUMN IF EXISTS "activated_by";
ALTER TABLE "lottery_packs" DROP COLUMN IF EXISTS "activated_shift_id";
ALTER TABLE "lottery_packs" DROP COLUMN IF EXISTS "depleted_by";
ALTER TABLE "lottery_packs" DROP COLUMN IF EXISTS "depleted_shift_id";
