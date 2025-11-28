# Test Archive

This directory contains backup and archived test files that are preserved for reference but should not be executed by test runners.

## Purpose

Files in this directory are excluded from test discovery to prevent:
- Duplicate test execution
- Confusion about which version is active
- Test runner errors from outdated test code

## Files

- `transaction-display-ui.spec.ts.backup` - Backup of e2e test file (superseded by `tests/e2e/transaction-display-ui.spec.ts`)

## Note

If you need to restore a file from this archive, move it back to the appropriate test directory and remove the `.backup` suffix (or rename appropriately if the original file still exists).

