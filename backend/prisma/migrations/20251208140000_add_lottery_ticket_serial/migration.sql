-- Create LotteryTicketSerial table
-- Story 6.13: Lottery Database Enhancements & Bin Management
-- Tracks individual ticket serial numbers within packs for AC #3 and #5

-- CreateTable
CREATE TABLE "lottery_ticket_serials" (
    "serial_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pack_id" UUID NOT NULL,
    "serial_number" VARCHAR(100) NOT NULL,
    "sold_at" TIMESTAMPTZ(6),
    "shift_id" UUID,
    "cashier_id" UUID,
    "transaction_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_ticket_serials_pkey" PRIMARY KEY ("serial_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lottery_ticket_serials_serial_number_key" ON "lottery_ticket_serials"("serial_number");

-- CreateIndex
CREATE INDEX "lottery_ticket_serials_pack_id_idx" ON "lottery_ticket_serials"("pack_id");

-- CreateIndex
CREATE INDEX "lottery_ticket_serials_pack_id_sold_at_idx" ON "lottery_ticket_serials"("pack_id", "sold_at");

-- CreateIndex
CREATE INDEX "lottery_ticket_serials_shift_id_idx" ON "lottery_ticket_serials"("shift_id");

-- CreateIndex
CREATE INDEX "lottery_ticket_serials_sold_at_idx" ON "lottery_ticket_serials"("sold_at");

-- CreateIndex
CREATE INDEX "lottery_ticket_serials_cashier_id_sold_at_idx" ON "lottery_ticket_serials"("cashier_id", "sold_at");

-- AddForeignKey
ALTER TABLE "lottery_ticket_serials" ADD CONSTRAINT "lottery_ticket_serials_pack_id_fkey" 
    FOREIGN KEY ("pack_id") REFERENCES "lottery_packs"("pack_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_ticket_serials" ADD CONSTRAINT "lottery_ticket_serials_shift_id_fkey" 
    FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_ticket_serials" ADD CONSTRAINT "lottery_ticket_serials_cashier_id_fkey" 
    FOREIGN KEY ("cashier_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Note: transaction_id is not a foreign key as transactions are in a partitioned table
-- Tenant isolation is enforced via store_id through LotteryPack relationship
