-- Phase 1.5: Lookup Tables and Transaction Foreign Keys
-- This migration adds TenderType, Department, and TaxRate lookup tables
-- and connects TransactionPayment and TransactionLineItem to them via FKs
-- Uses IF NOT EXISTS to be idempotent (can safely re-run)

-- ============================================================================
-- ENUMS (with IF NOT EXISTS using DO block)
-- ============================================================================

-- Tax Rate Type enum
DO $$ BEGIN
    CREATE TYPE "TaxRateType" AS ENUM ('PERCENTAGE', 'FIXED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tax Jurisdiction Level enum
DO $$ BEGIN
    CREATE TYPE "TaxJurisdictionLevel" AS ENUM ('FEDERAL', 'STATE', 'COUNTY', 'CITY', 'DISTRICT', 'COMBINED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- LOOKUP TABLES (with IF NOT EXISTS)
-- ============================================================================

-- TenderType (Payment Method) lookup table
CREATE TABLE IF NOT EXISTS "tender_types" (
    "tender_type_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_cash_equivalent" BOOLEAN NOT NULL DEFAULT false,
    "requires_reference" BOOLEAN NOT NULL DEFAULT false,
    "is_electronic" BOOLEAN NOT NULL DEFAULT false,
    "affects_cash_drawer" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "icon_name" VARCHAR(50),
    "color_code" VARCHAR(7),
    "client_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "tender_types_pkey" PRIMARY KEY ("tender_type_id")
);

-- Department lookup table
CREATE TABLE IF NOT EXISTS "departments" (
    "department_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "parent_id" UUID,
    "level" INTEGER NOT NULL DEFAULT 1,
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "default_tax_rate_id" UUID,
    "minimum_age" SMALLINT,
    "requires_id_scan" BOOLEAN NOT NULL DEFAULT false,
    "is_lottery" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "icon_name" VARCHAR(50),
    "color_code" VARCHAR(7),
    "client_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("department_id")
);

-- TaxRate lookup table
CREATE TABLE IF NOT EXISTS "tax_rates" (
    "tax_rate_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "rate" DECIMAL(6,5) NOT NULL,
    "rate_type" "TaxRateType" NOT NULL DEFAULT 'PERCENTAGE',
    "jurisdiction_level" "TaxJurisdictionLevel" NOT NULL DEFAULT 'STATE',
    "jurisdiction_code" VARCHAR(20),
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_compound" BOOLEAN NOT NULL DEFAULT false,
    "client_id" UUID,
    "store_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("tax_rate_id")
);

-- ============================================================================
-- TRANSACTION TABLE UPDATES - Add FK columns (IF NOT EXISTS)
-- ============================================================================

-- Add columns to transaction_payments (with IF NOT EXISTS using DO blocks)
DO $$ BEGIN
    ALTER TABLE "transaction_payments" ADD COLUMN "tender_type_id" UUID;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "transaction_payments" ADD COLUMN "tender_code" VARCHAR(50);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Add columns to transaction_line_items (with IF NOT EXISTS using DO blocks)
DO $$ BEGIN
    ALTER TABLE "transaction_line_items" ADD COLUMN "department_id" UUID;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "transaction_line_items" ADD COLUMN "department_code" VARCHAR(50);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "transaction_line_items" ADD COLUMN "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- ============================================================================
-- INDEXES - Lookup Tables (CREATE INDEX IF NOT EXISTS)
-- ============================================================================

-- TenderType indexes
CREATE UNIQUE INDEX IF NOT EXISTS "unique_tender_code_per_client" ON "tender_types"("code", "client_id");
CREATE INDEX IF NOT EXISTS "tender_types_client_id_is_active_idx" ON "tender_types"("client_id", "is_active");
CREATE INDEX IF NOT EXISTS "tender_types_is_active_sort_order_idx" ON "tender_types"("is_active", "sort_order");
CREATE INDEX IF NOT EXISTS "tender_types_code_idx" ON "tender_types"("code");

-- Department indexes
CREATE UNIQUE INDEX IF NOT EXISTS "unique_dept_code_per_client" ON "departments"("code", "client_id");
CREATE INDEX IF NOT EXISTS "departments_client_id_is_active_idx" ON "departments"("client_id", "is_active");
CREATE INDEX IF NOT EXISTS "departments_parent_id_idx" ON "departments"("parent_id");
CREATE INDEX IF NOT EXISTS "departments_is_active_sort_order_idx" ON "departments"("is_active", "sort_order");
CREATE INDEX IF NOT EXISTS "departments_code_idx" ON "departments"("code");
CREATE INDEX IF NOT EXISTS "departments_is_lottery_idx" ON "departments"("is_lottery");

-- TaxRate indexes
CREATE UNIQUE INDEX IF NOT EXISTS "unique_tax_rate_per_scope_date" ON "tax_rates"("code", "client_id", "store_id", "effective_from");
CREATE INDEX IF NOT EXISTS "tax_rates_client_id_store_id_is_active_idx" ON "tax_rates"("client_id", "store_id", "is_active");
CREATE INDEX IF NOT EXISTS "tax_rates_effective_from_effective_to_idx" ON "tax_rates"("effective_from", "effective_to");
CREATE INDEX IF NOT EXISTS "tax_rates_code_idx" ON "tax_rates"("code");
CREATE INDEX IF NOT EXISTS "tax_rates_jurisdiction_level_idx" ON "tax_rates"("jurisdiction_level");
CREATE INDEX IF NOT EXISTS "tax_rates_store_id_idx" ON "tax_rates"("store_id");

-- ============================================================================
-- INDEXES - Transaction FK columns
-- ============================================================================

-- TransactionPayment FK indexes
CREATE INDEX IF NOT EXISTS "transaction_payments_tender_type_id_idx" ON "transaction_payments"("tender_type_id");
CREATE INDEX IF NOT EXISTS "transaction_payments_tender_code_idx" ON "transaction_payments"("tender_code");

-- TransactionLineItem FK indexes
CREATE INDEX IF NOT EXISTS "transaction_line_items_department_id_idx" ON "transaction_line_items"("department_id");
CREATE INDEX IF NOT EXISTS "transaction_line_items_department_code_idx" ON "transaction_line_items"("department_code");

-- ============================================================================
-- FOREIGN KEYS - Lookup Tables (with DO blocks for IF NOT EXISTS behavior)
-- ============================================================================

-- TenderType foreign keys
DO $$ BEGIN
    ALTER TABLE "tender_types" ADD CONSTRAINT "tender_types_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "companies"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tender_types" ADD CONSTRAINT "tender_types_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Department foreign keys
DO $$ BEGIN
    ALTER TABLE "departments" ADD CONSTRAINT "departments_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "companies"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "departments" ADD CONSTRAINT "departments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "departments"("department_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "departments" ADD CONSTRAINT "departments_default_tax_rate_id_fkey"
    FOREIGN KEY ("default_tax_rate_id") REFERENCES "tax_rates"("tax_rate_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- TaxRate foreign keys
DO $$ BEGIN
    ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "companies"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("store_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- FOREIGN KEYS - Transaction Tables
-- ============================================================================

-- TransactionPayment -> TenderType
DO $$ BEGIN
    ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_tender_type_id_fkey"
    FOREIGN KEY ("tender_type_id") REFERENCES "tender_types"("tender_type_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- TransactionLineItem -> Department
DO $$ BEGIN
    ALTER TABLE "transaction_line_items" ADD CONSTRAINT "transaction_line_items_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("department_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
