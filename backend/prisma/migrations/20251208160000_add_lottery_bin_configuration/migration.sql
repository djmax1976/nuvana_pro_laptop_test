-- Create LotteryBinConfiguration table
-- Story 6.13: Lottery Database Enhancements & Bin Management
-- Stores bin configuration templates per store for AC #1

-- CreateTable
CREATE TABLE "lottery_bin_configurations" (
    "config_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "bin_template" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_bin_configurations_pkey" PRIMARY KEY ("config_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lottery_bin_configurations_store_id_key" ON "lottery_bin_configurations"("store_id");

-- AddForeignKey
ALTER TABLE "lottery_bin_configurations" ADD CONSTRAINT "lottery_bin_configurations_store_id_fkey" 
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Note: bin_template is a JSONB field containing an array of bin definitions:
-- [{name: string, location: string, display_order: number}]
-- Tenant isolation is enforced via store_id foreign key (one configuration per store)
