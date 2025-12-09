-- Create LotteryPackBinHistory table
-- Story 6.13: Lottery Database Enhancements & Bin Management
-- Tracks pack movements between bins for AC #5 (audit trail)

-- CreateTable
CREATE TABLE "lottery_pack_bin_history" (
    "history_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pack_id" UUID NOT NULL,
    "bin_id" UUID NOT NULL,
    "moved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moved_by" UUID NOT NULL,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_pack_bin_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateIndex
CREATE INDEX "lottery_pack_bin_history_pack_id_idx" ON "lottery_pack_bin_history"("pack_id");

-- CreateIndex
CREATE INDEX "lottery_pack_bin_history_bin_id_idx" ON "lottery_pack_bin_history"("bin_id");

-- CreateIndex
CREATE INDEX "lottery_pack_bin_history_moved_at_idx" ON "lottery_pack_bin_history"("moved_at");

-- CreateIndex
CREATE INDEX "lottery_pack_bin_history_pack_id_moved_at_idx" ON "lottery_pack_bin_history"("pack_id", "moved_at");

-- AddForeignKey
ALTER TABLE "lottery_pack_bin_history" ADD CONSTRAINT "lottery_pack_bin_history_pack_id_fkey" 
    FOREIGN KEY ("pack_id") REFERENCES "lottery_packs"("pack_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_pack_bin_history" ADD CONSTRAINT "lottery_pack_bin_history_bin_id_fkey" 
    FOREIGN KEY ("bin_id") REFERENCES "lottery_bins"("bin_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_pack_bin_history" ADD CONSTRAINT "lottery_pack_bin_history_moved_by_fkey" 
    FOREIGN KEY ("moved_by") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Note: Tenant isolation is enforced via store_id through LotteryPack relationship
-- This table provides complete audit trail of pack movements between bins
