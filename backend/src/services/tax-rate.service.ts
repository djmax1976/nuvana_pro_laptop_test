/**
 * Tax Rate Service
 *
 * Service for managing tax rates.
 * Phase 1.3: Shift & Day Summary Implementation Plan
 */

import {
  TaxRate,
  Prisma,
  TaxRateType,
  TaxJurisdictionLevel,
} from "@prisma/client";
import { prisma } from "../utils/db";
import {
  TaxRateCreateInput,
  TaxRateUpdateInput,
  TaxRateQueryOptions,
  TaxRateWithStore,
} from "../types/tax-rate.types";

/**
 * Error for tax rate not found
 */
export class TaxRateNotFoundError extends Error {
  constructor(id: string) {
    super(`Tax rate not found: ${id}`);
    this.name = "TaxRateNotFoundError";
  }
}

/**
 * Error for duplicate tax rate code
 */
export class TaxRateCodeExistsError extends Error {
  constructor(
    code: string,
    clientId: string | null,
    storeId: string | null,
    effectiveFrom: Date,
  ) {
    const scope = storeId
      ? "this store"
      : clientId
        ? "this client"
        : "system defaults";
    super(
      `Tax rate with code '${code}' already exists for ${scope} starting ${effectiveFrom.toISOString().split("T")[0]}`,
    );
    this.name = "TaxRateCodeExistsError";
  }
}

/**
 * Error for attempting to modify system tax rate
 */
export class SystemTaxRateError extends Error {
  constructor(action: string) {
    super(`Cannot ${action} system tax rate`);
    this.name = "SystemTaxRateError";
  }
}

/**
 * Error for overlapping effective dates
 */
export class OverlappingDateRangeError extends Error {
  constructor(code: string) {
    super(`Tax rate with code '${code}' has overlapping effective date range`);
    this.name = "OverlappingDateRangeError";
  }
}

/**
 * Tax Rate Service class
 */
class TaxRateService {
  /**
   * List all tax rates for a client/store
   *
   * By default, only returns company/store-specific tax rates (no system defaults).
   * POS-synced tax rates have both client_id and store_id set.
   *
   * @param options - Query options
   * @returns List of tax rates
   */
  async list(
    options: TaxRateQueryOptions = {},
  ): Promise<TaxRate[] | TaxRateWithStore[]> {
    const {
      client_id,
      store_id,
      include_inactive = false,
      include_system = false, // Changed: Don't include system defaults by default
      jurisdiction_level,
      effective_date,
      include_store = false,
    } = options;

    const where: Prisma.TaxRateWhereInput = {
      AND: [
        // Filter by active status
        ...(include_inactive ? [] : [{ is_active: true }]),
        // Filter by jurisdiction level
        ...(jurisdiction_level !== undefined ? [{ jurisdiction_level }] : []),
        // Filter by effective date
        ...(effective_date
          ? [
              {
                effective_from: { lte: effective_date },
                OR: [
                  { effective_to: null },
                  { effective_to: { gte: effective_date } },
                ],
              },
            ]
          : []),
        // Filter by scope (store, client, or system)
        {
          OR: [
            // System defaults (client_id = null, store_id = null)
            ...(include_system ? [{ client_id: null, store_id: null }] : []),
            // Client-specific entries (includes both company-wide and store-specific)
            // POS-synced data has both client_id and store_id set
            ...(client_id && !store_id ? [{ client_id }] : []),
            // Store-specific (if store_id provided, filter to just that store)
            ...(store_id ? [{ store_id }] : []),
          ],
        },
      ],
    };

    return prisma.taxRate.findMany({
      where,
      include: include_store
        ? {
            store: {
              select: {
                store_id: true,
                name: true,
              },
            },
          }
        : undefined,
      orderBy: [
        { jurisdiction_level: "asc" },
        { sort_order: "asc" },
        { display_name: "asc" },
      ],
    });
  }

  /**
   * Get a tax rate by ID
   *
   * @param id - Tax rate ID
   * @param includeStore - Include store relation
   * @returns Tax rate or null
   */
  async getById(
    id: string,
    includeStore: boolean = false,
  ): Promise<TaxRate | TaxRateWithStore | null> {
    return prisma.taxRate.findUnique({
      where: { tax_rate_id: id },
      include: includeStore
        ? {
            store: {
              select: {
                store_id: true,
                name: true,
              },
            },
          }
        : undefined,
    });
  }

  /**
   * Get a tax rate by code and scope
   *
   * @param code - Tax rate code
   * @param clientId - Client ID (null for system defaults)
   * @param storeId - Store ID (null for client/system level)
   * @param effectiveDate - Optional date to find rate effective on that date
   * @returns Tax rate or null
   */
  async getByCode(
    code: string,
    clientId: string | null = null,
    storeId: string | null = null,
    effectiveDate?: Date,
  ): Promise<TaxRate | null> {
    const where: Prisma.TaxRateWhereInput = {
      code,
      client_id: clientId,
      store_id: storeId,
      ...(effectiveDate
        ? {
            effective_from: { lte: effectiveDate },
            OR: [
              { effective_to: null },
              { effective_to: { gte: effectiveDate } },
            ],
          }
        : {}),
    };

    return prisma.taxRate.findFirst({
      where,
      orderBy: { effective_from: "desc" },
    });
  }

  /**
   * Resolve a tax rate for a transaction
   * Priority: store-specific → client-specific → system default
   *
   * @param code - Tax rate code
   * @param clientId - Client ID
   * @param storeId - Store ID
   * @param effectiveDate - Date to find rate effective on
   * @returns Tax rate or null
   */
  async resolveForTransaction(
    code: string,
    clientId: string,
    storeId: string,
    effectiveDate: Date = new Date(),
  ): Promise<TaxRate | null> {
    // First try store-specific
    const storeRate = await this.getByCode(
      code,
      clientId,
      storeId,
      effectiveDate,
    );
    if (storeRate && storeRate.is_active) {
      return storeRate;
    }

    // Then try client-specific
    const clientRate = await this.getByCode(
      code,
      clientId,
      null,
      effectiveDate,
    );
    if (clientRate && clientRate.is_active) {
      return clientRate;
    }

    // Fall back to system default
    const systemRate = await this.getByCode(code, null, null, effectiveDate);
    if (systemRate && systemRate.is_active) {
      return systemRate;
    }

    return null;
  }

  /**
   * Get all active tax rates for a store location
   * Used to calculate combined tax
   *
   * @param clientId - Client ID
   * @param storeId - Store ID
   * @param effectiveDate - Date to find rates effective on
   * @returns List of applicable tax rates
   */
  async getActiveRatesForLocation(
    clientId: string,
    storeId: string,
    effectiveDate: Date = new Date(),
  ): Promise<TaxRate[]> {
    // Get all rates that apply to this location
    const rates = await prisma.taxRate.findMany({
      where: {
        is_active: true,
        effective_from: { lte: effectiveDate },
        OR: [{ effective_to: null }, { effective_to: { gte: effectiveDate } }],
        AND: {
          OR: [
            { store_id: storeId },
            { client_id: clientId, store_id: null },
            { client_id: null, store_id: null },
          ],
        },
      },
      orderBy: [
        { jurisdiction_level: "asc" },
        { is_compound: "asc" }, // Non-compound first
        { sort_order: "asc" },
      ],
    });

    // Remove duplicates (prefer store over client over system)
    const ratesByCode = new Map<string, TaxRate>();
    for (const rate of rates) {
      const existing = ratesByCode.get(rate.code);
      if (!existing) {
        ratesByCode.set(rate.code, rate);
      } else {
        // Prefer more specific scope
        const existingSpecificity = this.getScopeSpecificity(existing);
        const newSpecificity = this.getScopeSpecificity(rate);
        if (newSpecificity > existingSpecificity) {
          ratesByCode.set(rate.code, rate);
        }
      }
    }

    return Array.from(ratesByCode.values());
  }

  /**
   * Get scope specificity for rate priority
   * Higher = more specific
   */
  private getScopeSpecificity(rate: TaxRate): number {
    if (rate.store_id) return 3; // Store-specific
    if (rate.client_id) return 2; // Client-specific
    return 1; // System default
  }

  /**
   * Check for overlapping date ranges
   *
   * @param code - Tax rate code
   * @param clientId - Client ID
   * @param storeId - Store ID
   * @param effectiveFrom - Start date
   * @param effectiveTo - End date (null = open-ended)
   * @param excludeId - Exclude this ID from check (for updates)
   * @returns True if overlap exists
   */
  private async hasOverlappingDates(
    code: string,
    clientId: string | null,
    storeId: string | null,
    effectiveFrom: Date,
    effectiveTo: Date | null,
    excludeId?: string,
  ): Promise<boolean> {
    const where: Prisma.TaxRateWhereInput = {
      code,
      client_id: clientId,
      store_id: storeId,
      ...(excludeId ? { NOT: { tax_rate_id: excludeId } } : {}),
      // Check for any overlap
      AND: [
        {
          // New range starts before existing ends (or existing is open-ended)
          OR: [
            { effective_to: null },
            { effective_to: { gte: effectiveFrom } },
          ],
        },
        {
          // New range ends after existing starts (or new is open-ended)
          OR: effectiveTo ? [{ effective_from: { lte: effectiveTo } }] : [{}], // If new is open-ended, it overlaps with everything after its start
        },
      ],
    };

    const count = await prisma.taxRate.count({ where });
    return count > 0;
  }

  /**
   * Create a new tax rate
   *
   * @param input - Tax rate data
   * @param clientId - Client ID
   * @param createdBy - User ID who created it
   * @returns Created tax rate
   */
  async create(
    input: TaxRateCreateInput,
    clientId: string,
    createdBy: string,
  ): Promise<TaxRate> {
    const effectiveFrom = new Date(input.effective_from);
    const effectiveTo = input.effective_to
      ? new Date(input.effective_to)
      : null;
    const storeId = input.store_id || null;

    // Check if code already exists with overlapping dates
    const hasOverlap = await this.hasOverlappingDates(
      input.code,
      clientId,
      storeId,
      effectiveFrom,
      effectiveTo,
    );

    if (hasOverlap) {
      throw new OverlappingDateRangeError(input.code);
    }

    return prisma.taxRate.create({
      data: {
        code: input.code.toUpperCase(),
        display_name: input.display_name,
        description: input.description,
        rate: input.rate,
        rate_type: (input.rate_type || "PERCENTAGE") as TaxRateType,
        jurisdiction_level: (input.jurisdiction_level ||
          "STATE") as TaxJurisdictionLevel,
        jurisdiction_code: input.jurisdiction_code,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        sort_order: input.sort_order ?? 0,
        is_compound: input.is_compound ?? false,
        client_id: clientId,
        store_id: storeId,
        is_system: false,
        is_active: true,
        created_by: createdBy,
      },
    });
  }

  /**
   * Update an existing tax rate
   *
   * @param id - Tax rate ID
   * @param input - Update data
   * @returns Updated tax rate
   */
  async update(id: string, input: TaxRateUpdateInput): Promise<TaxRate> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new TaxRateNotFoundError(id);
    }

    // Cannot modify system tax rates (except for some fields)
    if (existing.is_system) {
      const allowedSystemFields = ["display_name", "description", "sort_order"];
      const updateKeys = Object.keys(input).filter(
        (key) => input[key as keyof TaxRateUpdateInput] !== undefined,
      );
      const hasDisallowedFields = updateKeys.some(
        (key) => !allowedSystemFields.includes(key),
      );

      if (hasDisallowedFields) {
        throw new SystemTaxRateError("modify rate or dates of");
      }
    }

    // Check for overlapping dates if dates are changing
    if (
      input.effective_from !== undefined ||
      input.effective_to !== undefined
    ) {
      const effectiveFrom = input.effective_from
        ? new Date(input.effective_from)
        : existing.effective_from;
      const effectiveTo =
        input.effective_to !== undefined
          ? input.effective_to
            ? new Date(input.effective_to)
            : null
          : existing.effective_to;

      const hasOverlap = await this.hasOverlappingDates(
        existing.code,
        existing.client_id,
        existing.store_id,
        effectiveFrom,
        effectiveTo,
        id,
      );

      if (hasOverlap) {
        throw new OverlappingDateRangeError(existing.code);
      }
    }

    return prisma.taxRate.update({
      where: { tax_rate_id: id },
      data: {
        ...(input.display_name && { display_name: input.display_name }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.rate !== undefined && { rate: input.rate }),
        ...(input.rate_type !== undefined && {
          rate_type: input.rate_type as TaxRateType,
        }),
        ...(input.jurisdiction_level !== undefined && {
          jurisdiction_level: input.jurisdiction_level as TaxJurisdictionLevel,
        }),
        ...(input.jurisdiction_code !== undefined && {
          jurisdiction_code: input.jurisdiction_code,
        }),
        ...(input.effective_from !== undefined && {
          effective_from: new Date(input.effective_from),
        }),
        ...(input.effective_to !== undefined && {
          effective_to: input.effective_to
            ? new Date(input.effective_to)
            : null,
        }),
        ...(input.sort_order !== undefined && { sort_order: input.sort_order }),
        ...(input.is_compound !== undefined && {
          is_compound: input.is_compound,
        }),
        ...(input.is_active !== undefined && { is_active: input.is_active }),
      },
    });
  }

  /**
   * Soft delete a tax rate (set is_active = false)
   *
   * @param id - Tax rate ID
   * @returns Deactivated tax rate
   */
  async deactivate(id: string): Promise<TaxRate> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new TaxRateNotFoundError(id);
    }

    if (existing.is_system) {
      throw new SystemTaxRateError("deactivate");
    }

    return prisma.taxRate.update({
      where: { tax_rate_id: id },
      data: { is_active: false },
    });
  }

  /**
   * Reactivate a deactivated tax rate
   *
   * @param id - Tax rate ID
   * @returns Reactivated tax rate
   */
  async reactivate(id: string): Promise<TaxRate> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new TaxRateNotFoundError(id);
    }

    return prisma.taxRate.update({
      where: { tax_rate_id: id },
      data: { is_active: true },
    });
  }

  /**
   * Hard delete a tax rate (only for non-system types with no references)
   *
   * @param id - Tax rate ID
   */
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new TaxRateNotFoundError(id);
    }

    if (existing.is_system) {
      throw new SystemTaxRateError("delete");
    }

    // Check for references in departments
    const departmentCount = await prisma.department.count({
      where: { default_tax_rate_id: id },
    });

    if (departmentCount > 0) {
      throw new Error(
        `Cannot delete tax rate: it is referenced by ${departmentCount} departments. Deactivate instead.`,
      );
    }

    await prisma.taxRate.delete({
      where: { tax_rate_id: id },
    });
  }

  /**
   * Calculate combined tax rate for a location
   * Handles compound taxes correctly
   *
   * @param rates - List of applicable tax rates
   * @returns Total tax rate as decimal
   */
  calculateCombinedRate(rates: TaxRate[]): number {
    if (rates.length === 0) return 0;

    // Separate compound and non-compound rates
    const nonCompound = rates.filter((r) => !r.is_compound);
    const compound = rates.filter((r) => r.is_compound);

    // Sum non-compound rates
    const baseRate = nonCompound.reduce((sum, r) => sum + Number(r.rate), 0);

    // Apply compound rates on top
    let totalRate = baseRate;
    for (const rate of compound) {
      totalRate = totalRate * (1 + Number(rate.rate));
    }

    return totalRate;
  }

  /**
   * Get tax rates by jurisdiction level
   *
   * @param jurisdictionLevel - Jurisdiction level to filter by
   * @param clientId - Optional client ID
   * @param storeId - Optional store ID
   * @returns List of tax rates
   */
  async getByJurisdictionLevel(
    jurisdictionLevel: TaxJurisdictionLevel,
    clientId?: string,
    storeId?: string,
  ): Promise<TaxRate[]> {
    return prisma.taxRate.findMany({
      where: {
        is_active: true,
        jurisdiction_level: jurisdictionLevel,
        OR: [
          { client_id: null, store_id: null },
          ...(clientId ? [{ client_id: clientId, store_id: null }] : []),
          ...(storeId ? [{ store_id: storeId }] : []),
        ],
      },
      orderBy: { sort_order: "asc" },
    });
  }
}

// Export singleton instance
export const taxRateService = new TaxRateService();
