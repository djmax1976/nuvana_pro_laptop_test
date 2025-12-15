-- AlterTable: Add entry_method fields to lottery_shift_closings
-- Story 10.7: Shift Closing Submission & Pack Status Updates

-- Add entry_method column
ALTER TABLE "lottery_shift_closings" ADD COLUMN IF NOT EXISTS "entry_method" VARCHAR(10);

-- Add manual_entry_authorized_by column
ALTER TABLE "lottery_shift_closings" ADD COLUMN IF NOT EXISTS "manual_entry_authorized_by" UUID;

-- Add manual_entry_authorized_at column
ALTER TABLE "lottery_shift_closings" ADD COLUMN IF NOT EXISTS "manual_entry_authorized_at" TIMESTAMPTZ(6);

-- CreateIndex: manual_entry_authorized_by
CREATE INDEX IF NOT EXISTS "lottery_shift_closings_manual_entry_authorized_by_idx" ON "lottery_shift_closings"("manual_entry_authorized_by");

-- AddForeignKey: lottery_shift_closings.manual_entry_authorized_by -> users.user_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lottery_shift_closings_manual_entry_authorized_by_fkey'
    ) THEN
        ALTER TABLE "lottery_shift_closings" ADD CONSTRAINT "lottery_shift_closings_manual_entry_authorized_by_fkey" FOREIGN KEY ("manual_entry_authorized_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
