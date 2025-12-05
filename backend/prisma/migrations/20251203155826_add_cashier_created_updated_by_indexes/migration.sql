-- CreateIndex
CREATE INDEX IF NOT EXISTS "cashiers_created_by_idx" ON "cashiers"("created_by");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cashiers_updated_by_idx" ON "cashiers"("updated_by");

