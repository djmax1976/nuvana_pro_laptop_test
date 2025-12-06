-- AlterTable
ALTER TABLE "lottery_packs" ADD CONSTRAINT "lottery_packs_store_id_pack_number_key" UNIQUE ("store_id", "pack_number");

