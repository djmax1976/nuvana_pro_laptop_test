-- CreateEnum
CREATE TYPE "LotteryGameStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "LotteryPackStatus" AS ENUM ('RECEIVED', 'ACTIVE', 'DEPLETED', 'RETURNED');

-- CreateTable
CREATE TABLE "lottery_games" (
    "game_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "status" "LotteryGameStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_games_pkey" PRIMARY KEY ("game_id")
);

-- Update any existing NULL prices to default value (safety measure for any pre-existing data)
UPDATE "lottery_games" SET "price" = 0.00 WHERE "price" IS NULL;

-- CreateTable
CREATE TABLE "lottery_bins" (
    "bin_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "location" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_bins_pkey" PRIMARY KEY ("bin_id")
);

-- CreateTable
CREATE TABLE "lottery_packs" (
    "pack_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "game_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "pack_number" VARCHAR(50) NOT NULL,
    "serial_start" VARCHAR(100) NOT NULL,
    "serial_end" VARCHAR(100) NOT NULL,
    "status" "LotteryPackStatus" NOT NULL DEFAULT 'RECEIVED',
    "current_bin_id" UUID,
    "received_at" TIMESTAMPTZ(6),
    "activated_at" TIMESTAMPTZ(6),
    "depleted_at" TIMESTAMPTZ(6),
    "returned_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_packs_pkey" PRIMARY KEY ("pack_id")
);

-- CreateIndex
CREATE INDEX "lottery_games_name_idx" ON "lottery_games"("name");

-- CreateIndex
CREATE INDEX "lottery_bins_store_id_idx" ON "lottery_bins"("store_id");

-- CreateIndex
CREATE INDEX "lottery_packs_game_id_idx" ON "lottery_packs"("game_id");

-- CreateIndex
CREATE INDEX "lottery_packs_store_id_idx" ON "lottery_packs"("store_id");

-- CreateIndex
CREATE INDEX "lottery_packs_status_idx" ON "lottery_packs"("status");

-- CreateIndex
CREATE INDEX "lottery_packs_pack_number_idx" ON "lottery_packs"("pack_number");

-- CreateIndex
CREATE INDEX "lottery_packs_serial_start_serial_end_idx" ON "lottery_packs"("serial_start", "serial_end");

-- AddForeignKey
ALTER TABLE "lottery_bins" ADD CONSTRAINT "lottery_bins_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "lottery_games"("game_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_current_bin_id_fkey" FOREIGN KEY ("current_bin_id") REFERENCES "lottery_bins"("bin_id") ON DELETE SET NULL ON UPDATE CASCADE;

