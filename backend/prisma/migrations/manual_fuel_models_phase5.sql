-- ============================================================================
-- FUEL MODELS - Movement Report Data (Phase 5: XML Parsing)
-- ============================================================================
-- Purpose: Create tables for storing fuel sales data extracted from NAXML
--          Movement Reports (FGM, FPM, MSM files).
--
-- Models Created:
--   1. fuel_grades - Fuel product definitions per company
--   2. fuel_positions - Pump/dispenser definitions per store
--   3. shift_fuel_summaries - Shift-level fuel sales by grade and tender
--   4. meter_readings - Pump meter readings for reconciliation
--   5. day_fuel_summaries - Day-level aggregated fuel data
--
-- Security: DB-006 Tenant Isolation enforced via company_id/store_id scoping
-- Performance: Optimized indexes for common query patterns
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================

-- FuelProductType - Classification of fuel products
CREATE TYPE "FuelProductType" AS ENUM (
    'GASOLINE',
    'DIESEL',
    'KEROSENE',
    'DEF',
    'OTHER'
);

-- FuelTenderType - Payment method classification for fuel sales
CREATE TYPE "FuelTenderType" AS ENUM (
    'CASH',
    'OUTSIDE_CREDIT',
    'OUTSIDE_DEBIT',
    'INSIDE_CREDIT',
    'INSIDE_DEBIT',
    'FLEET',
    'OTHER'
);

-- MeterReadingType - Type of pump meter reading
CREATE TYPE "MeterReadingType" AS ENUM (
    'OPEN',
    'CLOSE',
    'INTERIM'
);

-- ============================================================================
-- TABLE: fuel_grades
-- ============================================================================
-- Stores fuel grade/product configuration for a company.
-- Grades are discovered from movement reports on initial POS connection.
-- Maps POS grade IDs (001, 002, etc.) to human-readable names.
-- ============================================================================

CREATE TABLE fuel_grades (
    fuel_grade_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Tenant scope
    company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    pos_integration_id UUID REFERENCES pos_integrations(pos_integration_id) ON DELETE SET NULL,

    -- Grade identification
    grade_id VARCHAR(10) NOT NULL,
    product_code VARCHAR(20),

    -- Display information
    name VARCHAR(100) NOT NULL,
    short_name VARCHAR(20),
    description VARCHAR(255),

    -- Classification
    product_type "FuelProductType" NOT NULL DEFAULT 'GASOLINE',

    -- Configuration
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,

    -- Constraints
    CONSTRAINT fuel_grades_company_grade_unique UNIQUE (company_id, grade_id)
);

-- Indexes for fuel_grades
CREATE INDEX idx_fuel_grades_company_id ON fuel_grades(company_id);
CREATE INDEX idx_fuel_grades_pos_integration_id ON fuel_grades(pos_integration_id);
CREATE INDEX idx_fuel_grades_is_active ON fuel_grades(is_active);
CREATE INDEX idx_fuel_grades_product_type ON fuel_grades(product_type);

-- ============================================================================
-- TABLE: fuel_positions
-- ============================================================================
-- Stores fuel dispenser/pump positions for a store.
-- Positions are discovered from FPM movement reports.
-- Each position can dispense multiple fuel grades.
-- ============================================================================

CREATE TABLE fuel_positions (
    fuel_position_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Tenant scope
    company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    pos_integration_id UUID REFERENCES pos_integrations(pos_integration_id) ON DELETE SET NULL,

    -- Position identification
    position_id VARCHAR(10) NOT NULL,
    dispenser_id VARCHAR(20),

    -- Display information
    name VARCHAR(100),
    description VARCHAR(255),

    -- Configuration
    fuel_grade_ids JSONB, -- Array of grade IDs available at this position
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fuel_positions_store_position_unique UNIQUE (store_id, position_id)
);

-- Indexes for fuel_positions
CREATE INDEX idx_fuel_positions_store_id ON fuel_positions(store_id);
CREATE INDEX idx_fuel_positions_company_id ON fuel_positions(company_id);
CREATE INDEX idx_fuel_positions_pos_integration_id ON fuel_positions(pos_integration_id);
CREATE INDEX idx_fuel_positions_is_active ON fuel_positions(is_active);

-- ============================================================================
-- TABLE: shift_fuel_summaries
-- ============================================================================
-- Stores fuel sales data extracted from FGM movement reports.
-- One row per (shift, fuel grade, tender type) combination.
-- Links to shift_summaries for complete shift reporting.
-- ============================================================================

CREATE TABLE shift_fuel_summaries (
    shift_fuel_summary_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Shift reference
    shift_summary_id UUID NOT NULL REFERENCES shift_summaries(shift_summary_id) ON DELETE CASCADE,
    fuel_grade_id UUID NOT NULL REFERENCES fuel_grades(fuel_grade_id),

    -- Tender type
    tender_type "FuelTenderType" NOT NULL,

    -- Sales data
    sales_volume DECIMAL(12, 3) NOT NULL,
    sales_amount DECIMAL(12, 2) NOT NULL,
    discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_count INTEGER NOT NULL DEFAULT 0,
    transaction_count INTEGER NOT NULL DEFAULT 0,

    -- Pricing
    unit_price DECIMAL(8, 4),

    -- Source tracking
    source_file_hash VARCHAR(64),

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT shift_fuel_summaries_unique UNIQUE (shift_summary_id, fuel_grade_id, tender_type)
);

-- Indexes for shift_fuel_summaries
CREATE INDEX idx_shift_fuel_summaries_shift_summary_id ON shift_fuel_summaries(shift_summary_id);
CREATE INDEX idx_shift_fuel_summaries_fuel_grade_id ON shift_fuel_summaries(fuel_grade_id);
CREATE INDEX idx_shift_fuel_summaries_tender_type ON shift_fuel_summaries(tender_type);
CREATE INDEX idx_shift_fuel_summaries_source_file_hash ON shift_fuel_summaries(source_file_hash);

-- ============================================================================
-- TABLE: meter_readings
-- ============================================================================
-- Stores non-resettable pump meter readings from FPM movement reports.
-- Used for fuel inventory reconciliation (book vs physical).
-- Cumulative readings - never reset, always increasing.
-- ============================================================================

CREATE TABLE meter_readings (
    meter_reading_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Store reference
    store_id UUID NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    fuel_position_id UUID NOT NULL REFERENCES fuel_positions(fuel_position_id),
    shift_id UUID REFERENCES shifts(shift_id) ON DELETE SET NULL,
    day_summary_id UUID REFERENCES day_summaries(day_summary_id) ON DELETE SET NULL,

    -- Product identification
    fuel_product_id VARCHAR(10) NOT NULL,

    -- Reading type
    reading_type "MeterReadingType" NOT NULL,

    -- Timing
    reading_timestamp TIMESTAMPTZ NOT NULL,
    business_date DATE NOT NULL,

    -- Meter values (cumulative totalizers)
    volume_reading DECIMAL(15, 3) NOT NULL,
    amount_reading DECIMAL(15, 2) NOT NULL,

    -- Source tracking
    source_file_hash VARCHAR(64),

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for meter_readings
CREATE INDEX idx_meter_readings_store_business_date ON meter_readings(store_id, business_date);
CREATE INDEX idx_meter_readings_fuel_position_id ON meter_readings(fuel_position_id);
CREATE INDEX idx_meter_readings_shift_id ON meter_readings(shift_id);
CREATE INDEX idx_meter_readings_day_summary_id ON meter_readings(day_summary_id);
CREATE INDEX idx_meter_readings_reading_type ON meter_readings(reading_type);
CREATE INDEX idx_meter_readings_store_date_type ON meter_readings(store_id, business_date, reading_type);

-- ============================================================================
-- TABLE: day_fuel_summaries
-- ============================================================================
-- Aggregates fuel sales data across all shifts for a business day.
-- Includes reconciliation data (book vs meter variance).
-- Links to day_summaries for complete daily reporting.
-- ============================================================================

CREATE TABLE day_fuel_summaries (
    day_fuel_summary_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Day reference
    day_summary_id UUID NOT NULL REFERENCES day_summaries(day_summary_id) ON DELETE CASCADE,
    fuel_grade_id UUID NOT NULL REFERENCES fuel_grades(fuel_grade_id),

    -- Aggregated sales
    total_volume DECIMAL(12, 3) NOT NULL,
    total_sales DECIMAL(12, 2) NOT NULL,
    total_discount DECIMAL(12, 2) NOT NULL DEFAULT 0,

    -- Tender breakdown
    cash_volume DECIMAL(12, 3) NOT NULL DEFAULT 0,
    cash_sales DECIMAL(12, 2) NOT NULL DEFAULT 0,
    credit_volume DECIMAL(12, 3) NOT NULL DEFAULT 0,
    credit_sales DECIMAL(12, 2) NOT NULL DEFAULT 0,
    debit_volume DECIMAL(12, 3) NOT NULL DEFAULT 0,
    debit_sales DECIMAL(12, 2) NOT NULL DEFAULT 0,

    -- Reconciliation
    meter_volume DECIMAL(12, 3),
    book_volume DECIMAL(12, 3),
    variance_volume DECIMAL(12, 3),
    variance_amount DECIMAL(12, 2),

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT day_fuel_summaries_unique UNIQUE (day_summary_id, fuel_grade_id)
);

-- Indexes for day_fuel_summaries
CREATE INDEX idx_day_fuel_summaries_day_summary_id ON day_fuel_summaries(day_summary_id);
CREATE INDEX idx_day_fuel_summaries_fuel_grade_id ON day_fuel_summaries(fuel_grade_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE fuel_grades IS 'Fuel grade/product definitions discovered from NAXML Movement Reports. Scoped by company_id for multi-tenant isolation.';
COMMENT ON TABLE fuel_positions IS 'Pump/dispenser position definitions discovered from FPM Movement Reports. Scoped by store_id for multi-tenant isolation.';
COMMENT ON TABLE shift_fuel_summaries IS 'Shift-level fuel sales data extracted from FGM Movement Reports. One row per (shift, grade, tender) combination.';
COMMENT ON TABLE meter_readings IS 'Non-resettable pump meter readings from FPM Movement Reports. Used for fuel inventory reconciliation.';
COMMENT ON TABLE day_fuel_summaries IS 'Day-level aggregated fuel data with reconciliation metrics (book vs meter variance).';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
