-- CreateTable: LotteryBusinessDay
-- Tracks lottery operations for a calendar day per store
-- Independent of shifts - day boundaries defined by first/last shift of the day
CREATE TABLE "lottery_business_days" (
    "day_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_business_days_pkey" PRIMARY KEY ("day_id")
);

-- CreateTable: LotteryDayPack
-- Tracks each pack's activity for a specific business day
-- Records starting and ending serials for day-based reconciliation
CREATE TABLE "lottery_day_packs" (
    "day_pack_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "day_id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "bin_id" UUID,
    "starting_serial" VARCHAR(100) NOT NULL,
    "ending_serial" VARCHAR(100),
    "tickets_sold" INTEGER,
    "sales_amount" DECIMAL(10,2),
    "entry_method" VARCHAR(10),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_day_packs_pkey" PRIMARY KEY ("day_pack_id")
);

-- CreateIndex: lottery_business_days indexes
CREATE UNIQUE INDEX "lottery_business_days_store_id_business_date_key" ON "lottery_business_days"("store_id", "business_date");
CREATE INDEX "lottery_business_days_store_id_idx" ON "lottery_business_days"("store_id");
CREATE INDEX "lottery_business_days_store_id_status_idx" ON "lottery_business_days"("store_id", "status");
CREATE INDEX "lottery_business_days_business_date_idx" ON "lottery_business_days"("business_date");
CREATE INDEX "lottery_business_days_opened_by_idx" ON "lottery_business_days"("opened_by");
CREATE INDEX "lottery_business_days_closed_by_idx" ON "lottery_business_days"("closed_by");

-- CreateIndex: lottery_day_packs indexes
CREATE UNIQUE INDEX "lottery_day_packs_day_id_pack_id_key" ON "lottery_day_packs"("day_id", "pack_id");
CREATE INDEX "lottery_day_packs_day_id_idx" ON "lottery_day_packs"("day_id");
CREATE INDEX "lottery_day_packs_pack_id_idx" ON "lottery_day_packs"("pack_id");
CREATE INDEX "lottery_day_packs_bin_id_idx" ON "lottery_day_packs"("bin_id");

-- AddForeignKey: lottery_business_days -> stores
ALTER TABLE "lottery_business_days" ADD CONSTRAINT "lottery_business_days_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: lottery_business_days -> users (opened_by)
ALTER TABLE "lottery_business_days" ADD CONSTRAINT "lottery_business_days_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: lottery_business_days -> users (closed_by)
ALTER TABLE "lottery_business_days" ADD CONSTRAINT "lottery_business_days_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: lottery_day_packs -> lottery_business_days
ALTER TABLE "lottery_day_packs" ADD CONSTRAINT "lottery_day_packs_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "lottery_business_days"("day_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: lottery_day_packs -> lottery_packs
ALTER TABLE "lottery_day_packs" ADD CONSTRAINT "lottery_day_packs_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "lottery_packs"("pack_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: lottery_day_packs -> lottery_bins
ALTER TABLE "lottery_day_packs" ADD CONSTRAINT "lottery_day_packs_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "lottery_bins"("bin_id") ON DELETE SET NULL ON UPDATE CASCADE;
