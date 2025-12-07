-- CreateTable: lottery_shift_openings
-- Story 6.6: Shift Lottery Opening (missing from previous migration)
CREATE TABLE IF NOT EXISTS "lottery_shift_openings" (
    "opening_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "opening_serial" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_shift_openings_pkey" PRIMARY KEY ("opening_id")
);

-- CreateIndex: lottery_shift_openings
CREATE INDEX IF NOT EXISTS "lottery_shift_openings_shift_id_idx" ON "lottery_shift_openings"("shift_id");
CREATE INDEX IF NOT EXISTS "lottery_shift_openings_pack_id_idx" ON "lottery_shift_openings"("pack_id");

-- AddUniqueConstraint: Prevent duplicate pack openings per shift
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'lottery_shift_openings_shift_id_pack_id_key'
    ) THEN
        ALTER TABLE "lottery_shift_openings" ADD CONSTRAINT "lottery_shift_openings_shift_id_pack_id_key" UNIQUE ("shift_id", "pack_id");
    END IF;
END $$;

-- AddForeignKey: lottery_shift_openings.shift_id -> shifts.shift_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'lottery_shift_openings_shift_id_fkey'
    ) THEN
        ALTER TABLE "lottery_shift_openings" ADD CONSTRAINT "lottery_shift_openings_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: lottery_shift_openings.pack_id -> lottery_packs.pack_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'lottery_shift_openings_pack_id_fkey'
    ) THEN
        ALTER TABLE "lottery_shift_openings" ADD CONSTRAINT "lottery_shift_openings_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "lottery_packs"("pack_id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- CreateTable: lottery_shift_closings
-- Story 6.7: Shift Lottery Closing and Reconciliation
CREATE TABLE IF NOT EXISTS "lottery_shift_closings" (
    "closing_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "closing_serial" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_shift_closings_pkey" PRIMARY KEY ("closing_id")
);

-- CreateTable: lottery_variances
-- Story 6.7: Shift Lottery Closing and Reconciliation
CREATE TABLE IF NOT EXISTS "lottery_variances" (
    "variance_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "expected" INTEGER NOT NULL,
    "actual" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "reason" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_variances_pkey" PRIMARY KEY ("variance_id"),
    CONSTRAINT "lottery_variances_approval_consistency_check" CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
    CONSTRAINT "lottery_variances_difference_check" CHECK (difference = actual - expected)
);

-- CreateIndex
CREATE INDEX "lottery_shift_closings_shift_id_idx" ON "lottery_shift_closings"("shift_id");

-- CreateIndex
CREATE INDEX "lottery_shift_closings_pack_id_idx" ON "lottery_shift_closings"("pack_id");

-- CreateIndex
CREATE INDEX "lottery_variances_shift_id_idx" ON "lottery_variances"("shift_id");

-- CreateIndex
CREATE INDEX "lottery_variances_pack_id_idx" ON "lottery_variances"("pack_id");

-- AddUniqueConstraint: Prevent duplicate pack closings per shift
ALTER TABLE "lottery_shift_closings" ADD CONSTRAINT "lottery_shift_closings_shift_id_pack_id_key" UNIQUE ("shift_id", "pack_id");

-- AddForeignKey: lottery_shift_closings.shift_id -> shifts.shift_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'lottery_shift_closings_shift_id_fkey'
    ) THEN
        ALTER TABLE "lottery_shift_closings" ADD CONSTRAINT "lottery_shift_closings_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: lottery_shift_closings.pack_id -> lottery_packs.pack_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'lottery_shift_closings_pack_id_fkey'
    ) THEN
        ALTER TABLE "lottery_shift_closings" ADD CONSTRAINT "lottery_shift_closings_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "lottery_packs"("pack_id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: lottery_variances.shift_id -> shifts.shift_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'lottery_variances_shift_id_fkey'
    ) THEN
        ALTER TABLE "lottery_variances" ADD CONSTRAINT "lottery_variances_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: lottery_variances.pack_id -> lottery_packs.pack_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'lottery_variances_pack_id_fkey'
    ) THEN
        ALTER TABLE "lottery_variances" ADD CONSTRAINT "lottery_variances_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "lottery_packs"("pack_id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: lottery_variances.approved_by -> users.user_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'lottery_variances_approved_by_fkey'
    ) THEN
        ALTER TABLE "lottery_variances" ADD CONSTRAINT "lottery_variances_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
