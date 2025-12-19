/**
 * Tax Rate Types
 *
 * TypeScript interfaces for tax rate configuration.
 * Phase 1.3: Shift & Day Summary Implementation Plan
 */

/**
 * Tax rate type enum
 */
export type TaxRateType = "PERCENTAGE" | "FIXED";

/**
 * Tax jurisdiction level enum
 */
export type TaxJurisdictionLevel =
  | "FEDERAL"
  | "STATE"
  | "COUNTY"
  | "CITY"
  | "DISTRICT"
  | "COMBINED";

/**
 * Tax Rate entity interface
 * Matches the Prisma TaxRate model
 */
export interface TaxRate {
  tax_rate_id: string;
  code: string;
  display_name: string;
  description: string | null;
  rate: number; // Decimal in DB, number in TS
  rate_type: TaxRateType;
  jurisdiction_level: TaxJurisdictionLevel;
  jurisdiction_code: string | null;
  effective_from: Date;
  effective_to: Date | null;
  sort_order: number;
  is_compound: boolean;
  client_id: string | null;
  store_id: string | null;
  is_active: boolean;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
}

/**
 * Tax Rate with optional store relation
 */
export interface TaxRateWithStore extends TaxRate {
  store?: {
    store_id: string;
    name: string;
  } | null;
}

/**
 * Input for creating a new tax rate
 */
export interface TaxRateCreateInput {
  code: string;
  display_name: string;
  description?: string;
  rate: number;
  rate_type?: TaxRateType;
  jurisdiction_level?: TaxJurisdictionLevel;
  jurisdiction_code?: string;
  effective_from: Date | string;
  effective_to?: Date | string | null;
  sort_order?: number;
  is_compound?: boolean;
  store_id?: string; // Optional store-level override
}

/**
 * Input for updating an existing tax rate
 * Note: null values are used for nullable fields to explicitly clear them
 */
export interface TaxRateUpdateInput {
  display_name?: string;
  description?: string | null;
  rate?: number;
  rate_type?: TaxRateType;
  jurisdiction_level?: TaxJurisdictionLevel;
  jurisdiction_code?: string | null;
  effective_from?: Date | string;
  effective_to?: Date | string | null;
  sort_order?: number;
  is_compound?: boolean;
  is_active?: boolean;
}

/**
 * Query options for listing tax rates
 */
export interface TaxRateQueryOptions {
  client_id?: string | null;
  store_id?: string | null;
  include_inactive?: boolean;
  include_system?: boolean;
  jurisdiction_level?: TaxJurisdictionLevel;
  effective_date?: Date; // Filter to rates active on this date
  include_store?: boolean; // Include store relation in response
}

/**
 * Tax Rate summary for reporting
 */
export interface TaxRateSummary {
  tax_rate_id: string;
  code: string;
  display_name: string;
  rate: number;
  taxable_amount: number;
  tax_collected: number;
  transaction_count: number;
}

/**
 * Combined tax rate for a location
 * Used when calculating total tax from multiple rates
 */
export interface CombinedTaxRate {
  rates: TaxRate[];
  total_rate: number;
  description: string;
}
