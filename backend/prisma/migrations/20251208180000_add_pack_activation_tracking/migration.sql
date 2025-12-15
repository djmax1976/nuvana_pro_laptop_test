-- Add pack activation tracking fields to lottery_packs table
-- Story 10.2: Database Schema & Pack Activation Tracking
-- Tracks which cashier activated which pack during which shift

-- AlterTable: Add pack activation context fields
ALTER TABLE "lottery_packs" ADD COLUMN "activated_by" UUID;
ALTER TABLE "lottery_packs" ADD COLUMN "activated_shift_id" UUID;

-- AlterTable: Add pack depletion context fields
ALTER TABLE "lottery_packs" ADD COLUMN "depleted_by" UUID;
ALTER TABLE "lottery_packs" ADD COLUMN "depleted_shift_id" UUID;

-- CreateIndex: Index for activated_by (foreign key to users)
CREATE INDEX "lottery_packs_activated_by_idx" ON "lottery_packs"("activated_by");

-- CreateIndex: Index for activated_shift_id (foreign key to shifts)
CREATE INDEX "lottery_packs_activated_shift_id_idx" ON "lottery_packs"("activated_shift_id");

-- CreateIndex: Index for depleted_by (foreign key to users)
CREATE INDEX "lottery_packs_depleted_by_idx" ON "lottery_packs"("depleted_by");

-- CreateIndex: Index for depleted_shift_id (foreign key to shifts)
CREATE INDEX "lottery_packs_depleted_shift_id_idx" ON "lottery_packs"("depleted_shift_id");

-- AddForeignKey: activated_by references users(user_id)
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_activated_by_fkey" 
    FOREIGN KEY ("activated_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: activated_shift_id references shifts(shift_id)
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_activated_shift_id_fkey" 
    FOREIGN KEY ("activated_shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: depleted_by references users(user_id)
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_depleted_by_fkey" 
    FOREIGN KEY ("depleted_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: depleted_shift_id references shifts(shift_id)
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_depleted_shift_id_fkey" 
    FOREIGN KEY ("depleted_shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Note: Tenant isolation is enforced via store_id through existing RLS policies
-- These fields provide complete audit trail of pack activation and depletion context
