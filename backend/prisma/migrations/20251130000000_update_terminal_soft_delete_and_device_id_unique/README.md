# Migration: Terminal Soft Delete and Device ID Uniqueness

## Overview

This migration migrates the `pos_terminals.status` column to use soft-delete via `deleted_at` instead, while preserving the `status` column for backward compatibility during a deprecation period.

## What This Migration Does

1. **Creates a backup table** (`pos_terminals_status_backup`) to preserve all status values for rollback safety
2. **Adds `deleted_at` column** to `pos_terminals` table
3. **Migrates status values to `deleted_at`**:
   - `ACTIVE` → `deleted_at = NULL` (terminal is active)
   - `INACTIVE` or `MAINTENANCE` → `deleted_at = updated_at` (terminal is soft-deleted)
4. **Adds unique constraint** on `device_id` for global uniqueness across all stores
5. **Preserves the `status` column** - it is NOT dropped in this migration

## Status Column Deprecation

The `status` column is preserved in the database but should no longer be used in application code. All new code should use `deleted_at`:

- **Active terminal**: `deleted_at IS NULL`
- **Deleted terminal**: `deleted_at IS NOT NULL`

## Application Code Migration Checklist

Before running the future migration to drop the `status` column, ensure:

- [ ] All application code uses `deleted_at` instead of `status`
- [ ] All API endpoints return `deleted_at` instead of `status`
- [ ] All database queries filter by `deleted_at` instead of `status`
- [ ] All tests have been updated to use `deleted_at`
- [ ] All API consumers have been notified of the change
- [ ] Monitoring confirms no queries are using the `status` column
- [ ] A deprecation period has passed (recommended: 2-4 weeks minimum)

## Future Migration: Dropping Status Column

After the deprecation period, use the `FUTURE_DROP_STATUS.sql` file to create a new migration that will:

1. Verify the backup table exists
2. Create a final backup of any new status values
3. Drop the `status` index
4. Drop the `status` column

**To create the future migration:**

```bash
# Create a new migration directory with timestamp
mkdir backend/prisma/migrations/$(date +%Y%m%d%H%M%S)_remove_pos_terminals_status_column

# Copy the future migration template
cp FUTURE_DROP_STATUS.sql backend/prisma/migrations/$(date +%Y%m%d%H%M%S)_remove_pos_terminals_status_column/migration.sql

# Review and adjust the migration file
# Then run: npx prisma migrate deploy
```

## Rollback Procedure

If you need to rollback this migration, use the `ROLLBACK.sql` file. The rollback will:

1. Restore the `status` column (if it was dropped)
2. Restore status values from the backup table
3. Recreate the status index
4. Optionally remove `deleted_at` column and related indexes

**Important**: The backup table (`pos_terminals_status_backup`) should be kept until you're confident the migration is stable and the status column has been successfully removed.

## Backup Table

The backup table `pos_terminals_status_backup` contains:
- `pos_terminal_id` (UUID, primary key)
- `status` (VARCHAR(50)) - the original status value
- `backup_created_at` (TIMESTAMPTZ) - when the backup was created

This table should be kept for at least 30 days after the status column is dropped, or until you're confident the migration is stable.

## Verification Queries

To verify the migration worked correctly:

```sql
-- Check that INACTIVE/MAINTENANCE terminals have deleted_at set
SELECT pos_terminal_id, status, deleted_at 
FROM pos_terminals 
WHERE status IN ('INACTIVE', 'MAINTENANCE') 
  AND deleted_at IS NULL;
-- Should return 0 rows

-- Check that ACTIVE terminals have deleted_at NULL
SELECT pos_terminal_id, status, deleted_at 
FROM pos_terminals 
WHERE status = 'ACTIVE' 
  AND deleted_at IS NOT NULL;
-- Should return 0 rows

-- Verify backup table has all terminals
SELECT COUNT(*) FROM pos_terminals;
SELECT COUNT(*) FROM pos_terminals_status_backup;
-- Counts should match
```

