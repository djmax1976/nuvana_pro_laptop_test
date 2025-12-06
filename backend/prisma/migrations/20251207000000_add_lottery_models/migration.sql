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

-- Handle any existing duplicate pack_number per store before adding unique constraint
-- This is a safety measure in case this migration is run on a database with existing data
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  -- Check for duplicates
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT store_id, pack_number, COUNT(*) as cnt
    FROM lottery_packs
    GROUP BY store_id, pack_number
    HAVING COUNT(*) > 1
  ) duplicates;
  
  -- If duplicates exist, keep only the first occurrence (by pack_id) and delete the rest
  IF duplicate_count > 0 THEN
    DELETE FROM lottery_packs
    WHERE pack_id IN (
      SELECT pack_id
      FROM (
        SELECT pack_id,
               ROW_NUMBER() OVER (PARTITION BY store_id, pack_number ORDER BY pack_id) as rn
        FROM lottery_packs
      ) ranked
      WHERE rn > 1
    );
  END IF;
END $$;

-- AddUniqueConstraint: Ensure pack_number is unique per store
-- Pack numbers must be unique within each store (composite constraint)
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_store_id_pack_number_key" UNIQUE ("store_id", "pack_number");

-- AddConstraint
ALTER TABLE "lottery_packs" ADD CONSTRAINT "serial_start_end_order_check" CHECK (
  CASE 
    WHEN serial_start ~ '^[0-9]+$' AND serial_end ~ '^[0-9]+$' THEN
      CAST(serial_start AS BIGINT) < CAST(serial_end AS BIGINT)
    ELSE
      serial_start < serial_end
  END
);

-- Create trigger function to validate status↔timestamp consistency and chronological ordering
CREATE OR REPLACE FUNCTION validate_lottery_pack_status_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate status-specific timestamp requirements
  IF NEW.status = 'RECEIVED' AND NEW.received_at IS NULL THEN
    RAISE EXCEPTION 'lottery_pack_status_timestamp_mismatch: status RECEIVED requires received_at to be NOT NULL';
  END IF;
  
  IF NEW.status = 'ACTIVE' AND NEW.activated_at IS NULL THEN
    RAISE EXCEPTION 'lottery_pack_status_timestamp_mismatch: status ACTIVE requires activated_at to be NOT NULL';
  END IF;
  
  IF NEW.status = 'DEPLETED' AND NEW.depleted_at IS NULL THEN
    RAISE EXCEPTION 'lottery_pack_status_timestamp_mismatch: status DEPLETED requires depleted_at to be NOT NULL';
  END IF;
  
  IF NEW.status = 'RETURNED' AND NEW.returned_at IS NULL THEN
    RAISE EXCEPTION 'lottery_pack_status_timestamp_mismatch: status RETURNED requires returned_at to be NOT NULL';
  END IF;
  
  -- Validate chronological ordering: received_at <= activated_at <= depleted_at <= returned_at
  -- Only check ordering when both timestamps are NOT NULL
  IF NEW.received_at IS NOT NULL AND NEW.activated_at IS NOT NULL THEN
    IF NEW.received_at > NEW.activated_at THEN
      RAISE EXCEPTION 'lottery_pack_timestamp_order_violation: received_at (%) must be <= activated_at (%)', NEW.received_at, NEW.activated_at;
    END IF;
  END IF;
  
  IF NEW.activated_at IS NOT NULL AND NEW.depleted_at IS NOT NULL THEN
    IF NEW.activated_at > NEW.depleted_at THEN
      RAISE EXCEPTION 'lottery_pack_timestamp_order_violation: activated_at (%) must be <= depleted_at (%)', NEW.activated_at, NEW.depleted_at;
    END IF;
  END IF;
  
  IF NEW.depleted_at IS NOT NULL AND NEW.returned_at IS NOT NULL THEN
    IF NEW.depleted_at > NEW.returned_at THEN
      RAISE EXCEPTION 'lottery_pack_timestamp_order_violation: depleted_at (%) must be <= returned_at (%)', NEW.depleted_at, NEW.returned_at;
    END IF;
  END IF;
  
  -- Cross-checks: received_at must be <= any later timestamps
  IF NEW.received_at IS NOT NULL AND NEW.depleted_at IS NOT NULL THEN
    IF NEW.received_at > NEW.depleted_at THEN
      RAISE EXCEPTION 'lottery_pack_timestamp_order_violation: received_at (%) must be <= depleted_at (%)', NEW.received_at, NEW.depleted_at;
    END IF;
  END IF;
  
  IF NEW.received_at IS NOT NULL AND NEW.returned_at IS NOT NULL THEN
    IF NEW.received_at > NEW.returned_at THEN
      RAISE EXCEPTION 'lottery_pack_timestamp_order_violation: received_at (%) must be <= returned_at (%)', NEW.received_at, NEW.returned_at;
    END IF;
  END IF;
  
  IF NEW.activated_at IS NOT NULL AND NEW.returned_at IS NOT NULL THEN
    IF NEW.activated_at > NEW.returned_at THEN
      RAISE EXCEPTION 'lottery_pack_timestamp_order_violation: activated_at (%) must be <= returned_at (%)', NEW.activated_at, NEW.returned_at;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce validation on INSERT and UPDATE
CREATE TRIGGER lottery_pack_status_timestamp_validation
  BEFORE INSERT OR UPDATE ON "lottery_packs"
  FOR EACH ROW
  EXECUTE FUNCTION validate_lottery_pack_status_timestamps();

-- AddForeignKey
ALTER TABLE "lottery_bins" ADD CONSTRAINT "lottery_bins_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "lottery_games"("game_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_current_bin_id_fkey" FOREIGN KEY ("current_bin_id") REFERENCES "lottery_bins"("bin_id") ON DELETE SET NULL ON UPDATE CASCADE;

