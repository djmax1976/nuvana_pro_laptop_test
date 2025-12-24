-- Add LotteryPackDepletionReason enum and depletion_reason field to lottery_packs
-- This migration adds tracking for how a pack became depleted (manual, auto-replaced, shift close, POS)

-- Create the enum type for depletion reasons
CREATE TYPE "LotteryPackDepletionReason" AS ENUM ('SHIFT_CLOSE', 'AUTO_REPLACED', 'MANUAL_SOLD_OUT', 'POS_LAST_TICKET');

-- Add the depletion_reason column to lottery_packs table
ALTER TABLE "lottery_packs" ADD COLUMN "depletion_reason" "LotteryPackDepletionReason";

-- Add index for querying by depletion reason (useful for audit and reporting)
CREATE INDEX "lottery_packs_depletion_reason_idx" ON "lottery_packs"("depletion_reason");

-- Backfill existing DEPLETED packs with SHIFT_CLOSE reason (historical data)
UPDATE "lottery_packs"
SET "depletion_reason" = 'SHIFT_CLOSE'
WHERE "status" = 'DEPLETED' AND "depletion_reason" IS NULL;
