-- ============================================================================
-- Migration: Add Geographic Reference Tables (US States, Counties, Cities, ZIP Codes)
-- Phase: State-Scoped Lottery Games + Address Management
-- Date: 2026-01-03
-- ============================================================================
--
-- BUSINESS REQUIREMENTS:
-- 1. Stores must be assigned to a US State for lottery game filtering
-- 2. Lottery games are scoped to states (not individual stores)
-- 3. Companies and Stores need proper address fields for future tax integration
-- 4. County and City data needed for future Avalara/TaxJar tax jurisdiction
--
-- ENTERPRISE STANDARDS APPLIED:
-- - DB-006: TENANT_ISOLATION - State scoping for lottery games
-- - DB-001: ORM_USAGE - Prisma-compatible schema design
-- - SEC-006: SQL_INJECTION - All identifiers use parameterized patterns
-- - DB-003: MIGRATIONS - Includes rollback steps in comments
--
-- DATA STANDARDS:
-- - FIPS codes follow US Census Bureau standards
-- - State codes follow ISO 3166-2:US
-- - Geographic hierarchy: State > County > City > ZIP
--
-- ROLLBACK PROCEDURE (in reverse order):
-- 1. DROP TABLE us_zip_codes CASCADE;
-- 2. DROP TABLE us_cities CASCADE;
-- 3. DROP TABLE us_counties CASCADE;
-- 4. DROP TABLE us_states CASCADE;
-- 5. Remove state_id, county_id columns from companies, stores, lottery_games
-- 6. Remove address columns from companies, stores
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE US STATES TABLE
-- ============================================================================
-- Reference table for US states and territories with FIPS codes
-- Used for lottery game scoping, store assignment, and address validation

CREATE TABLE IF NOT EXISTS us_states (
  state_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Standard identifiers (ISO 3166-2:US and FIPS)
  code CHAR(2) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  fips_code CHAR(2) NOT NULL UNIQUE,

  -- Status flags
  is_active BOOLEAN NOT NULL DEFAULT true,
  lottery_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Future expansion (nullable)
  timezone_default VARCHAR(50),
  tax_rate_state DECIMAL(5, 4),
  lottery_commission_name VARCHAR(255),
  lottery_commission_phone VARCHAR(20),
  lottery_commission_url VARCHAR(500),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for us_states
CREATE INDEX IF NOT EXISTS idx_us_states_code ON us_states(code);
CREATE INDEX IF NOT EXISTS idx_us_states_fips ON us_states(fips_code);
CREATE INDEX IF NOT EXISTS idx_us_states_active ON us_states(is_active);
CREATE INDEX IF NOT EXISTS idx_us_states_lottery ON us_states(lottery_enabled);
CREATE INDEX IF NOT EXISTS idx_us_states_active_lottery ON us_states(is_active, lottery_enabled);

-- Comments for documentation
COMMENT ON TABLE us_states IS 'US States reference table with FIPS codes for lottery game scoping and tax jurisdiction';
COMMENT ON COLUMN us_states.code IS 'ISO 3166-2:US 2-letter state code (e.g., GA, NC, SC)';
COMMENT ON COLUMN us_states.fips_code IS 'Federal Information Processing Standard 2-digit state code';
COMMENT ON COLUMN us_states.lottery_enabled IS 'Whether state lottery operations are enabled for this state';

-- ============================================================================
-- STEP 2: CREATE US COUNTIES TABLE
-- ============================================================================
-- Reference table for US counties with 5-digit FIPS codes
-- Critical for tax jurisdiction determination

CREATE TABLE IF NOT EXISTS us_counties (
  county_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID NOT NULL REFERENCES us_states(state_id) ON DELETE RESTRICT,

  -- Identification
  name VARCHAR(100) NOT NULL,
  fips_code CHAR(5) NOT NULL UNIQUE,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Future expansion
  tax_rate_county DECIMAL(5, 4),
  population INTEGER,
  county_seat VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT us_counties_state_name_unique UNIQUE (state_id, name)
);

-- Indexes for us_counties
CREATE INDEX IF NOT EXISTS idx_us_counties_state ON us_counties(state_id);
CREATE INDEX IF NOT EXISTS idx_us_counties_name ON us_counties(name);
CREATE INDEX IF NOT EXISTS idx_us_counties_fips ON us_counties(fips_code);
CREATE INDEX IF NOT EXISTS idx_us_counties_active ON us_counties(is_active);
CREATE INDEX IF NOT EXISTS idx_us_counties_state_active ON us_counties(state_id, is_active);

-- Comments
COMMENT ON TABLE us_counties IS 'US Counties reference table with 5-digit FIPS codes for tax jurisdiction';
COMMENT ON COLUMN us_counties.fips_code IS 'Full 5-digit FIPS code (state 2-digit + county 3-digit, e.g., 13121 for Fulton County, GA)';

-- ============================================================================
-- STEP 3: CREATE US CITIES TABLE
-- ============================================================================
-- Reference table for US cities
-- Note: Cities can span multiple counties; this maps to primary county

CREATE TABLE IF NOT EXISTS us_cities (
  city_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id UUID NOT NULL REFERENCES us_counties(county_id) ON DELETE RESTRICT,
  state_id UUID NOT NULL REFERENCES us_states(state_id) ON DELETE RESTRICT,

  -- Identification
  name VARCHAR(100) NOT NULL,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Future expansion
  tax_rate_city DECIMAL(5, 4),
  population INTEGER,
  is_incorporated BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT us_cities_county_name_unique UNIQUE (county_id, name)
);

-- Indexes for us_cities
CREATE INDEX IF NOT EXISTS idx_us_cities_county ON us_cities(county_id);
CREATE INDEX IF NOT EXISTS idx_us_cities_state ON us_cities(state_id);
CREATE INDEX IF NOT EXISTS idx_us_cities_name ON us_cities(name);
CREATE INDEX IF NOT EXISTS idx_us_cities_active ON us_cities(is_active);
CREATE INDEX IF NOT EXISTS idx_us_cities_state_name ON us_cities(state_id, name);

-- Comments
COMMENT ON TABLE us_cities IS 'US Cities reference table linked to primary county for address validation';

-- ============================================================================
-- STEP 4: CREATE US ZIP CODES TABLE
-- ============================================================================
-- Reference table for US postal codes
-- ZIP code is natural primary key (5-digit, unique by definition)

CREATE TABLE IF NOT EXISTS us_zip_codes (
  zip_code CHAR(5) PRIMARY KEY,
  state_id UUID NOT NULL REFERENCES us_states(state_id) ON DELETE RESTRICT,
  county_id UUID REFERENCES us_counties(county_id) ON DELETE SET NULL,
  city_id UUID REFERENCES us_cities(city_id) ON DELETE SET NULL,

  -- Denormalized city name for performance
  city_name VARCHAR(100) NOT NULL,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- ZIP+4 support (future)
  zip_plus4_ranges JSONB,

  -- Geolocation (future: store locator)
  latitude DECIMAL(9, 6),
  longitude DECIMAL(9, 6),

  -- Metadata
  zip_type VARCHAR(20),
  is_primary BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for us_zip_codes
CREATE INDEX IF NOT EXISTS idx_us_zip_codes_state ON us_zip_codes(state_id);
CREATE INDEX IF NOT EXISTS idx_us_zip_codes_county ON us_zip_codes(county_id);
CREATE INDEX IF NOT EXISTS idx_us_zip_codes_city ON us_zip_codes(city_id);
CREATE INDEX IF NOT EXISTS idx_us_zip_codes_city_name ON us_zip_codes(city_name);
CREATE INDEX IF NOT EXISTS idx_us_zip_codes_active ON us_zip_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_us_zip_codes_state_city ON us_zip_codes(state_id, city_name);
CREATE INDEX IF NOT EXISTS idx_us_zip_codes_geo ON us_zip_codes(latitude, longitude);

-- Comments
COMMENT ON TABLE us_zip_codes IS 'US ZIP Codes reference table for address validation and tax jurisdiction';
COMMENT ON COLUMN us_zip_codes.city_name IS 'Denormalized city name for performance (avoids join for common lookups)';

-- ============================================================================
-- STEP 5: ADD ADDRESS COLUMNS TO COMPANIES TABLE
-- ============================================================================

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES us_states(state_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS county_id UUID REFERENCES us_counties(county_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);

-- Indexes for company address fields
CREATE INDEX IF NOT EXISTS idx_companies_state ON companies(state_id);
CREATE INDEX IF NOT EXISTS idx_companies_county ON companies(county_id);
CREATE INDEX IF NOT EXISTS idx_companies_zip ON companies(zip_code);

-- Comments
COMMENT ON COLUMN companies.address_line1 IS 'Street address line 1';
COMMENT ON COLUMN companies.state_id IS 'FK to us_states for geographic scoping';
COMMENT ON COLUMN companies.county_id IS 'FK to us_counties for future tax jurisdiction';

-- ============================================================================
-- STEP 6: ADD ADDRESS COLUMNS TO STORES TABLE
-- ============================================================================

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES us_states(state_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS county_id UUID REFERENCES us_counties(county_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);

-- Indexes for store address fields
CREATE INDEX IF NOT EXISTS idx_stores_state ON stores(state_id);
CREATE INDEX IF NOT EXISTS idx_stores_county ON stores(county_id);
CREATE INDEX IF NOT EXISTS idx_stores_zip ON stores(zip_code);
CREATE INDEX IF NOT EXISTS idx_stores_state_status ON stores(state_id, status);

-- Comments
COMMENT ON COLUMN stores.state_id IS 'FK to us_states - CRITICAL: determines which lottery games are visible to this store';
COMMENT ON COLUMN stores.county_id IS 'FK to us_counties for future tax jurisdiction calculation';

-- ============================================================================
-- STEP 7: ADD STATE_ID TO LOTTERY_GAMES TABLE
-- ============================================================================
-- New column for state-scoped games (primary scoping mechanism)

ALTER TABLE lottery_games
  ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES us_states(state_id) ON DELETE RESTRICT;

-- Index for state-scoped game lookup
CREATE INDEX IF NOT EXISTS idx_lottery_games_state ON lottery_games(state_id);

-- Composite index for efficient state-scoped game lookup (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_lottery_games_code_state_status ON lottery_games(game_code, state_id, status);

-- Composite index for store-scoped game lookup (fallback pattern)
CREATE INDEX IF NOT EXISTS idx_lottery_games_code_store_status ON lottery_games(game_code, store_id, status);

-- Add unique constraint for state-scoped games
-- Note: PostgreSQL handles NULL values in unique constraints properly
-- Two rows with (game_code='0001', state_id=NULL) are considered different
CREATE UNIQUE INDEX IF NOT EXISTS lottery_games_game_code_state_unique
  ON lottery_games(game_code, state_id)
  WHERE state_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN lottery_games.state_id IS 'State-scoped game - visible to all stores in this state. Either state_id OR store_id should be set, not both.';

-- ============================================================================
-- STEP 8: SEED INITIAL STATE DATA (GA, NC, SC)
-- ============================================================================
-- Insert initial states with FIPS codes from US Census

INSERT INTO us_states (code, name, fips_code, timezone_default, lottery_enabled)
VALUES
  ('GA', 'Georgia', '13', 'America/New_York', true),
  ('NC', 'North Carolina', '37', 'America/New_York', true),
  ('SC', 'South Carolina', '45', 'America/New_York', true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STEP 9: UPDATED_AT TRIGGER FOR NEW TABLES
-- ============================================================================
-- Create trigger function if not exists (reuse pattern from other tables)

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to new tables
DROP TRIGGER IF EXISTS update_us_states_updated_at ON us_states;
CREATE TRIGGER update_us_states_updated_at
  BEFORE UPDATE ON us_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_us_counties_updated_at ON us_counties;
CREATE TRIGGER update_us_counties_updated_at
  BEFORE UPDATE ON us_counties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_us_cities_updated_at ON us_cities;
CREATE TRIGGER update_us_cities_updated_at
  BEFORE UPDATE ON us_cities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_us_zip_codes_updated_at ON us_zip_codes;
CREATE TRIGGER update_us_zip_codes_updated_at
  BEFORE UPDATE ON us_zip_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Run seed script for Georgia counties and ZIP codes
-- 2. Migrate existing stores to Georgia state
-- 3. Migrate existing global games (store_id IS NULL) to Georgia state_id
-- 4. Update lookupGameByCode service to use state-first priority
-- ============================================================================
