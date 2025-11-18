-- CreateTable
CREATE TABLE "shifts" (
    "shift_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "pos_terminal_id" UUID,
    "start_time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMPTZ(6),
    "opening_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "closing_amount" DECIMAL(10,2),
    "status" VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("shift_id")
);

-- CreateTable
CREATE TABLE "pos_terminals" (
    "pos_terminal_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "device_id" VARCHAR(255),
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_terminals_pkey" PRIMARY KEY ("pos_terminal_id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "transaction_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "pos_terminal_id" UUID,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "transaction_line_items" (
    "line_item_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "product_id" UUID,
    "sku" VARCHAR(100),
    "name" VARCHAR(255) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_line_items_pkey" PRIMARY KEY ("line_item_id")
);

-- CreateTable
CREATE TABLE "transaction_payments" (
    "payment_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "method" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reference" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateIndex
CREATE INDEX "shifts_store_id_idx" ON "shifts"("store_id");

-- CreateIndex
CREATE INDEX "shifts_cashier_id_idx" ON "shifts"("cashier_id");

-- CreateIndex
CREATE INDEX "shifts_pos_terminal_id_idx" ON "shifts"("pos_terminal_id");

-- CreateIndex
CREATE INDEX "shifts_status_idx" ON "shifts"("status");

-- CreateIndex
CREATE INDEX "shifts_start_time_idx" ON "shifts"("start_time");

-- CreateIndex
CREATE INDEX "pos_terminals_store_id_idx" ON "pos_terminals"("store_id");

-- CreateIndex
CREATE INDEX "pos_terminals_status_idx" ON "pos_terminals"("status");

-- CreateIndex
CREATE INDEX "transactions_store_id_idx" ON "transactions"("store_id");

-- CreateIndex
CREATE INDEX "transactions_shift_id_idx" ON "transactions"("shift_id");

-- CreateIndex
CREATE INDEX "transactions_cashier_id_idx" ON "transactions"("cashier_id");

-- CreateIndex
CREATE INDEX "transactions_pos_terminal_id_idx" ON "transactions"("pos_terminal_id");

-- CreateIndex
CREATE INDEX "transactions_timestamp_idx" ON "transactions"("timestamp");

-- CreateIndex
CREATE INDEX "transaction_line_items_transaction_id_idx" ON "transaction_line_items"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_line_items_product_id_idx" ON "transaction_line_items"("product_id");

-- CreateIndex
CREATE INDEX "transaction_payments_transaction_id_idx" ON "transaction_payments"("transaction_id");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_pos_terminal_id_fkey" FOREIGN KEY ("pos_terminal_id") REFERENCES "pos_terminals"("pos_terminal_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pos_terminal_id_fkey" FOREIGN KEY ("pos_terminal_id") REFERENCES "pos_terminals"("pos_terminal_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_line_items" ADD CONSTRAINT "transaction_line_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("transaction_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("transaction_id") ON DELETE CASCADE ON UPDATE CASCADE;
