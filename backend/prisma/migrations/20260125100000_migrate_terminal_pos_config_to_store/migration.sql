-- Migration: Copy Terminal POS config to Store
-- Purpose: Migrate POS connection configuration from Terminal-level to Store-level
--
-- Business Logic:
-- - For each store, find terminals that have non-default POS config
-- - Copy the terminal's connection_config to the store
-- - If multiple terminals exist with config, use the most recently updated one
-- - Stores with only MANUAL terminals remain with default MANUAL config
--
-- NOTE: This migration only copies connection_type and connection_config from terminals.
-- The pos_type column may not exist on pos_terminals in all database versions,
-- so we only migrate connection data and leave pos_type at store's current value.
--
-- Enterprise Standards Applied:
-- - DB-001: ORM_USAGE - Uses parameterized SQL within migration context
-- - DB-006: TENANT_ISOLATION - Updates only within store's own record
-- - SEC-006: SQL_INJECTION - No user input, static SQL only

-- Step 1: Update stores with FILE connection type (NAXML, etc.)
-- Priority: FILE connections are typically primary POS integrations
UPDATE stores s
SET
  pos_connection_type = t.connection_type,
  pos_connection_config = t.connection_config
FROM (
  SELECT DISTINCT ON (store_id)
    store_id,
    connection_type,
    connection_config
  FROM pos_terminals
  WHERE
    deleted_at IS NULL
    AND connection_type = 'FILE'
  ORDER BY store_id, updated_at DESC
) t
WHERE s.store_id = t.store_id
  AND s.pos_connection_type = 'MANUAL';  -- Only update stores still at default

-- Step 2: Update stores with API connection type
UPDATE stores s
SET
  pos_connection_type = t.connection_type,
  pos_connection_config = t.connection_config
FROM (
  SELECT DISTINCT ON (store_id)
    store_id,
    connection_type,
    connection_config
  FROM pos_terminals
  WHERE
    deleted_at IS NULL
    AND connection_type = 'API'
  ORDER BY store_id, updated_at DESC
) t
WHERE s.store_id = t.store_id
  AND s.pos_connection_type = 'MANUAL';  -- Only update stores still at default

-- Step 3: Update stores with NETWORK connection type
UPDATE stores s
SET
  pos_connection_type = t.connection_type,
  pos_connection_config = t.connection_config
FROM (
  SELECT DISTINCT ON (store_id)
    store_id,
    connection_type,
    connection_config
  FROM pos_terminals
  WHERE
    deleted_at IS NULL
    AND connection_type = 'NETWORK'
  ORDER BY store_id, updated_at DESC
) t
WHERE s.store_id = t.store_id
  AND s.pos_connection_type = 'MANUAL';  -- Only update stores still at default

-- Step 4: Update stores with WEBHOOK connection type
UPDATE stores s
SET
  pos_connection_type = t.connection_type,
  pos_connection_config = t.connection_config
FROM (
  SELECT DISTINCT ON (store_id)
    store_id,
    connection_type,
    connection_config
  FROM pos_terminals
  WHERE
    deleted_at IS NULL
    AND connection_type = 'WEBHOOK'
  ORDER BY store_id, updated_at DESC
) t
WHERE s.store_id = t.store_id
  AND s.pos_connection_type = 'MANUAL';  -- Only update stores still at default

-- Verification query (for manual verification after migration):
-- SELECT s.store_id, s.name, s.pos_type, s.pos_connection_type,
--        COUNT(t.pos_terminal_id) as terminal_count
-- FROM stores s
-- LEFT JOIN pos_terminals t ON s.store_id = t.store_id AND t.deleted_at IS NULL
-- GROUP BY s.store_id, s.name, s.pos_type, s.pos_connection_type
-- ORDER BY s.name;
