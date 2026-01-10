/**
 * TenderType Service
 *
 * Service for managing tender types (payment methods).
 * Phase 1.1: Shift & Day Summary Implementation Plan
 */

import { TenderType, Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import {
  TenderTypeCreateInput,
  TenderTypeUpdateInput,
  TenderTypeQueryOptions,
} from "../types/tender-type.types";

/**
 * Error for tender type not found
 */
export class TenderTypeNotFoundError extends Error {
  constructor(id: string) {
    super(`Tender type not found: ${id}`);
    this.name = "TenderTypeNotFoundError";
  }
}

/**
 * Error for duplicate tender type code
 */
export class TenderTypeCodeExistsError extends Error {
  constructor(code: string, clientId: string | null) {
    super(
      `Tender type with code '${code}' already exists${clientId ? " for this client" : " as a system type"}`,
    );
    this.name = "TenderTypeCodeExistsError";
  }
}

/**
 * Error for attempting to modify system tender type
 */
export class SystemTenderTypeError extends Error {
  constructor(action: string) {
    super(`Cannot ${action} system tender type`);
    this.name = "SystemTenderTypeError";
  }
}

/**
 * TenderType Service class
 */
class TenderTypeService {
  /**
   * List all tender types for a client
   *
   * By default, only returns company-specific tender types (no system defaults).
   * POS-synced tender types have both client_id and store_id set.
   *
   * @param options - Query options
   * @returns List of tender types
   */
  async list(options: TenderTypeQueryOptions = {}): Promise<TenderType[]> {
    const {
      client_id,
      include_inactive = false,
      include_system = false, // Changed: Don't include system defaults by default
    } = options;

    const where: Prisma.TenderTypeWhereInput = {
      AND: [
        // Filter by active status
        ...(include_inactive ? [] : [{ is_active: true }]),
        // Filter by client or system
        {
          OR: [
            // System defaults (client_id = null)
            ...(include_system ? [{ client_id: null }] : []),
            // Client-specific (if client_id provided)
            ...(client_id ? [{ client_id }] : []),
          ],
        },
      ],
    };

    return prisma.tenderType.findMany({
      where,
      orderBy: [{ sort_order: "asc" }, { display_name: "asc" }],
    });
  }

  /**
   * Get a tender type by ID
   *
   * @param id - Tender type ID
   * @returns Tender type or null
   */
  async getById(id: string): Promise<TenderType | null> {
    return prisma.tenderType.findUnique({
      where: { tender_type_id: id },
    });
  }

  /**
   * Get a tender type by code and client
   *
   * @param code - Tender type code
   * @param clientId - Client ID (null for system defaults)
   * @returns Tender type or null
   */
  async getByCode(
    code: string,
    clientId: string | null = null,
  ): Promise<TenderType | null> {
    // Use findFirst because Prisma's findUnique doesn't handle nullable fields in compound unique properly
    return prisma.tenderType.findFirst({
      where: {
        code,
        client_id: clientId,
      },
    });
  }

  /**
   * Resolve a tender type for a transaction
   * First checks for client-specific, then falls back to system default
   *
   * @param code - Tender type code
   * @param clientId - Client ID
   * @returns Tender type or null
   */
  async resolveForTransaction(
    code: string,
    clientId: string | null,
  ): Promise<TenderType | null> {
    // First try client-specific
    const clientType = await this.getByCode(code, clientId);
    if (clientType && clientType.is_active) {
      return clientType;
    }

    // Fall back to system default
    const systemType = await this.getByCode(code, null);
    if (systemType && systemType.is_active) {
      return systemType;
    }

    return null;
  }

  /**
   * Create a new client-specific tender type
   *
   * @param input - Tender type data
   * @param clientId - Client ID
   * @param createdBy - User ID who created it
   * @returns Created tender type
   */
  async create(
    input: TenderTypeCreateInput,
    clientId: string,
    createdBy: string,
  ): Promise<TenderType> {
    // Check if code already exists for this client
    const existing = await this.getByCode(input.code, clientId);
    if (existing) {
      throw new TenderTypeCodeExistsError(input.code, clientId);
    }

    return prisma.tenderType.create({
      data: {
        code: input.code.toUpperCase(),
        display_name: input.display_name,
        description: input.description,
        is_cash_equivalent: input.is_cash_equivalent ?? false,
        requires_reference: input.requires_reference ?? false,
        is_electronic: input.is_electronic ?? false,
        affects_cash_drawer: input.affects_cash_drawer ?? true,
        sort_order: input.sort_order ?? 0,
        icon_name: input.icon_name,
        color_code: input.color_code,
        client_id: clientId,
        is_system: false,
        is_active: true,
        created_by: createdBy,
      },
    });
  }

  /**
   * Update an existing tender type
   *
   * @param id - Tender type ID
   * @param input - Update data
   * @returns Updated tender type
   */
  async update(id: string, input: TenderTypeUpdateInput): Promise<TenderType> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new TenderTypeNotFoundError(id);
    }

    // Cannot modify system tender types (except for some fields)
    if (existing.is_system) {
      // Only allow updating display-related fields for system types
      const allowedSystemFields = [
        "display_name",
        "description",
        "sort_order",
        "icon_name",
        "color_code",
      ];
      const updateKeys = Object.keys(input).filter(
        (key) => input[key as keyof TenderTypeUpdateInput] !== undefined,
      );
      const hasDisallowedFields = updateKeys.some(
        (key) => !allowedSystemFields.includes(key),
      );

      if (hasDisallowedFields) {
        throw new SystemTenderTypeError("modify behavior flags of");
      }
    }

    return prisma.tenderType.update({
      where: { tender_type_id: id },
      data: {
        ...(input.display_name && { display_name: input.display_name }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.is_cash_equivalent !== undefined && {
          is_cash_equivalent: input.is_cash_equivalent,
        }),
        ...(input.requires_reference !== undefined && {
          requires_reference: input.requires_reference,
        }),
        ...(input.is_electronic !== undefined && {
          is_electronic: input.is_electronic,
        }),
        ...(input.affects_cash_drawer !== undefined && {
          affects_cash_drawer: input.affects_cash_drawer,
        }),
        ...(input.sort_order !== undefined && { sort_order: input.sort_order }),
        ...(input.icon_name !== undefined && { icon_name: input.icon_name }),
        ...(input.color_code !== undefined && { color_code: input.color_code }),
        ...(input.is_active !== undefined && { is_active: input.is_active }),
      },
    });
  }

  /**
   * Soft delete a tender type (set is_active = false)
   *
   * @param id - Tender type ID
   * @returns Deactivated tender type
   */
  async deactivate(id: string): Promise<TenderType> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new TenderTypeNotFoundError(id);
    }

    if (existing.is_system) {
      throw new SystemTenderTypeError("deactivate");
    }

    return prisma.tenderType.update({
      where: { tender_type_id: id },
      data: { is_active: false },
    });
  }

  /**
   * Reactivate a deactivated tender type
   *
   * @param id - Tender type ID
   * @returns Reactivated tender type
   */
  async reactivate(id: string): Promise<TenderType> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new TenderTypeNotFoundError(id);
    }

    return prisma.tenderType.update({
      where: { tender_type_id: id },
      data: { is_active: true },
    });
  }

  /**
   * Hard delete a tender type (only for non-system types with no references)
   *
   * @param id - Tender type ID
   */
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new TenderTypeNotFoundError(id);
    }

    if (existing.is_system) {
      throw new SystemTenderTypeError("delete");
    }

    // Check for references in transaction_payments
    const paymentCount = await prisma.transactionPayment.count({
      where: { tender_type_id: id },
    });

    if (paymentCount > 0) {
      throw new Error(
        `Cannot delete tender type: it is referenced by ${paymentCount} transaction payments. Deactivate instead.`,
      );
    }

    await prisma.tenderType.delete({
      where: { tender_type_id: id },
    });
  }

  /**
   * Get all active tender types that affect cash drawer
   * Used for cash reconciliation calculations
   *
   * @param clientId - Optional client ID
   * @returns List of cash-affecting tender types
   */
  async getCashAffectingTypes(clientId?: string): Promise<TenderType[]> {
    return prisma.tenderType.findMany({
      where: {
        is_active: true,
        affects_cash_drawer: true,
        OR: [
          { client_id: null },
          ...(clientId ? [{ client_id: clientId }] : []),
        ],
      },
      orderBy: { sort_order: "asc" },
    });
  }

  /**
   * Get all active cash-equivalent tender types
   * Used for cash drawer counting
   *
   * @param clientId - Optional client ID
   * @returns List of cash-equivalent tender types
   */
  async getCashEquivalentTypes(clientId?: string): Promise<TenderType[]> {
    return prisma.tenderType.findMany({
      where: {
        is_active: true,
        is_cash_equivalent: true,
        OR: [
          { client_id: null },
          ...(clientId ? [{ client_id: clientId }] : []),
        ],
      },
      orderBy: { sort_order: "asc" },
    });
  }
}

// Export singleton instance
export const tenderTypeService = new TenderTypeService();
