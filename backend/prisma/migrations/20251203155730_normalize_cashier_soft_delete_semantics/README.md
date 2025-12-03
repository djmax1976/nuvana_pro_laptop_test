# Migration: Normalize Cashier Soft-Delete Semantics

## Overview

This migration normalizes the soft-delete semantics for the `cashiers` table to ensure consistency between `is_active` and `disabled_at` fields.

## What This Migration Does

1. **Adds index on `disabled_at`** for query performance
2. **Normalizes existing rows** to ensure consistency:
   - If `is_active=true` but `disabled_at IS NOT NULL` → Sets `disabled_at=NULL`
   - If `is_active=false` but `disabled_at IS NULL` → Sets `disabled_at=updated_at` (or `created_at` if `updated_at` is null)
3. **Validates consistency** after normalization (migration fails if inconsistencies remain)

## Soft-Delete Semantics (After Migration)

### Authoritative Field: `disabled_at`
- **`disabled_at IS NULL`** = Cashier is active
- **`disabled_at IS NOT NULL`** = Cashier is soft-deleted

### Denormalized Field: `is_active`
- **`is_active=true`** when `disabled_at IS NULL`
- **`is_active=false`** when `disabled_at IS NOT NULL`

## Application Code Requirements

After this migration, all application code MUST:

1. **Filter by `disabled_at IS NULL`** (not `is_active`) for consistency
2. **Set both fields atomically** when toggling soft-delete state:
   - **When disabling**: Set `is_active=false` AND `disabled_at=now()` in the same transaction
   - **When re-enabling**: Set `is_active=true` AND `disabled_at=NULL` in the same transaction

## Rollback

If you need to rollback this migration:

```sql
-- Remove the index
DROP INDEX IF EXISTS "cashiers_disabled_at_idx";

-- Note: We cannot automatically rollback the data normalization
-- as we don't know the original state of disabled_at for rows that were fixed.
-- The data will remain normalized, which is actually the desired state.
```

## Verification

After running this migration, verify consistency:

```sql
-- Should return 0 rows (no inconsistencies)
SELECT COUNT(*) as inconsistent_count
FROM "cashiers"
WHERE ("is_active" = true AND "disabled_at" IS NOT NULL)
   OR ("is_active" = false AND "disabled_at" IS NULL);
```

