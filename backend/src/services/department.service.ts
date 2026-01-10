/**
 * Department Service
 *
 * Service for managing departments (product categories).
 * Phase 1.2: Shift & Day Summary Implementation Plan
 */

import { Department, Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import {
  DepartmentCreateInput,
  DepartmentUpdateInput,
  DepartmentQueryOptions,
} from "../types/department.types";

/**
 * Error for department not found
 */
export class DepartmentNotFoundError extends Error {
  constructor(id: string) {
    super(`Department not found: ${id}`);
    this.name = "DepartmentNotFoundError";
  }
}

/**
 * Error for duplicate department code
 */
export class DepartmentCodeExistsError extends Error {
  constructor(code: string, clientId: string | null) {
    super(
      `Department with code '${code}' already exists${clientId ? " for this client" : " as a system type"}`,
    );
    this.name = "DepartmentCodeExistsError";
  }
}

/**
 * Error for attempting to modify system department
 */
export class SystemDepartmentError extends Error {
  constructor(action: string) {
    super(`Cannot ${action} system department`);
    this.name = "SystemDepartmentError";
  }
}

/**
 * Error for circular hierarchy
 */
export class CircularHierarchyError extends Error {
  constructor() {
    super("Cannot set parent: would create a circular hierarchy");
    this.name = "CircularHierarchyError";
  }
}

/**
 * Department Service class
 */
class DepartmentService {
  /**
   * List all departments for a client
   *
   * By default, only returns company-specific departments (no system defaults).
   * POS-synced departments have both client_id and store_id set.
   *
   * @param options - Query options
   * @returns List of departments
   */
  async list(options: DepartmentQueryOptions = {}): Promise<Department[]> {
    const {
      client_id,
      include_inactive = false,
      include_system = false, // Changed: Don't include system defaults by default
      parent_id,
      is_lottery,
      include_children = false,
    } = options;

    const where: Prisma.DepartmentWhereInput = {
      AND: [
        // Filter by active status
        ...(include_inactive ? [] : [{ is_active: true }]),
        // Filter by parent
        ...(parent_id !== undefined ? [{ parent_id }] : []),
        // Filter by lottery flag
        ...(is_lottery !== undefined ? [{ is_lottery }] : []),
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

    return prisma.department.findMany({
      where,
      include: include_children ? { children: true } : undefined,
      orderBy: [
        { level: "asc" },
        { sort_order: "asc" },
        { display_name: "asc" },
      ],
    });
  }

  /**
   * Get a department by ID
   *
   * @param id - Department ID
   * @param includeHierarchy - Include parent and children relations
   * @returns Department or null
   */
  async getById(
    id: string,
    includeHierarchy: boolean = false,
  ): Promise<Department | null> {
    return prisma.department.findUnique({
      where: { department_id: id },
      include: includeHierarchy
        ? {
            parent: true,
            children: {
              where: { is_active: true },
              orderBy: { sort_order: "asc" },
            },
          }
        : undefined,
    });
  }

  /**
   * Get a department by code and client
   *
   * @param code - Department code
   * @param clientId - Client ID (null for system defaults)
   * @returns Department or null
   */
  async getByCode(
    code: string,
    clientId: string | null = null,
  ): Promise<Department | null> {
    // Use findFirst because Prisma's findUnique doesn't handle nullable fields in compound unique properly
    return prisma.department.findFirst({
      where: {
        code,
        client_id: clientId,
      },
    });
  }

  /**
   * Resolve a department for a transaction
   * First checks for client-specific, then falls back to system default
   *
   * @param code - Department code
   * @param clientId - Client ID
   * @returns Department or null
   */
  async resolveForTransaction(
    code: string,
    clientId: string | null,
  ): Promise<Department | null> {
    // First try client-specific
    const clientDept = await this.getByCode(code, clientId);
    if (clientDept && clientDept.is_active) {
      return clientDept;
    }

    // Fall back to system default
    const systemDept = await this.getByCode(code, null);
    if (systemDept && systemDept.is_active) {
      return systemDept;
    }

    return null;
  }

  /**
   * Check if setting parent would create a circular hierarchy
   *
   * @param departmentId - Department to check
   * @param parentId - Proposed parent ID
   * @returns True if circular
   */
  private async wouldCreateCircle(
    departmentId: string,
    parentId: string,
  ): Promise<boolean> {
    if (departmentId === parentId) {
      return true;
    }

    // Walk up the parent chain
    let currentId: string | null = parentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === departmentId || visited.has(currentId)) {
        return true;
      }
      visited.add(currentId);

      const parentDept: { parent_id: string | null } | null =
        await prisma.department.findUnique({
          where: { department_id: currentId },
          select: { parent_id: true },
        });

      currentId = parentDept?.parent_id ?? null;
    }

    return false;
  }

  /**
   * Calculate the level based on parent
   *
   * @param parentId - Parent department ID
   * @returns Level number
   */
  private async calculateLevel(parentId: string | null): Promise<number> {
    if (!parentId) {
      return 1;
    }

    const parent = await prisma.department.findUnique({
      where: { department_id: parentId },
      select: { level: true },
    });

    return (parent?.level ?? 0) + 1;
  }

  /**
   * Create a new client-specific department
   *
   * @param input - Department data
   * @param clientId - Client ID
   * @param createdBy - User ID who created it
   * @returns Created department
   */
  async create(
    input: DepartmentCreateInput,
    clientId: string,
    createdBy: string,
  ): Promise<Department> {
    // Check if code already exists for this client
    const existing = await this.getByCode(input.code, clientId);
    if (existing) {
      throw new DepartmentCodeExistsError(input.code, clientId);
    }

    // Calculate level based on parent
    const level = await this.calculateLevel(input.parent_id ?? null);

    return prisma.department.create({
      data: {
        code: input.code.toUpperCase(),
        display_name: input.display_name,
        description: input.description,
        parent_id: input.parent_id,
        level,
        is_taxable: input.is_taxable ?? true,
        default_tax_rate_id: input.default_tax_rate_id,
        minimum_age: input.minimum_age,
        requires_id_scan: input.requires_id_scan ?? false,
        is_lottery: input.is_lottery ?? false,
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
   * Update an existing department
   *
   * @param id - Department ID
   * @param input - Update data
   * @returns Updated department
   */
  async update(id: string, input: DepartmentUpdateInput): Promise<Department> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new DepartmentNotFoundError(id);
    }

    // Cannot modify system departments (except for some fields)
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
        (key) => input[key as keyof DepartmentUpdateInput] !== undefined,
      );
      const hasDisallowedFields = updateKeys.some(
        (key) => !allowedSystemFields.includes(key),
      );

      if (hasDisallowedFields) {
        throw new SystemDepartmentError("modify behavior flags of");
      }
    }

    // Check for circular hierarchy if parent is changing
    if (input.parent_id !== undefined && input.parent_id !== null) {
      if (await this.wouldCreateCircle(id, input.parent_id)) {
        throw new CircularHierarchyError();
      }
    }

    // Calculate new level if parent is changing
    let level: number | undefined;
    if (input.parent_id !== undefined) {
      level = await this.calculateLevel(input.parent_id);
    }

    return prisma.department.update({
      where: { department_id: id },
      data: {
        ...(input.display_name && { display_name: input.display_name }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.parent_id !== undefined && { parent_id: input.parent_id }),
        ...(level !== undefined && { level }),
        ...(input.is_taxable !== undefined && { is_taxable: input.is_taxable }),
        ...(input.default_tax_rate_id !== undefined && {
          default_tax_rate_id: input.default_tax_rate_id,
        }),
        ...(input.minimum_age !== undefined && {
          minimum_age: input.minimum_age,
        }),
        ...(input.requires_id_scan !== undefined && {
          requires_id_scan: input.requires_id_scan,
        }),
        ...(input.is_lottery !== undefined && { is_lottery: input.is_lottery }),
        ...(input.sort_order !== undefined && { sort_order: input.sort_order }),
        ...(input.icon_name !== undefined && { icon_name: input.icon_name }),
        ...(input.color_code !== undefined && { color_code: input.color_code }),
        ...(input.is_active !== undefined && { is_active: input.is_active }),
      },
    });
  }

  /**
   * Soft delete a department (set is_active = false)
   *
   * @param id - Department ID
   * @returns Deactivated department
   */
  async deactivate(id: string): Promise<Department> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new DepartmentNotFoundError(id);
    }

    if (existing.is_system) {
      throw new SystemDepartmentError("deactivate");
    }

    return prisma.department.update({
      where: { department_id: id },
      data: { is_active: false },
    });
  }

  /**
   * Reactivate a deactivated department
   *
   * @param id - Department ID
   * @returns Reactivated department
   */
  async reactivate(id: string): Promise<Department> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new DepartmentNotFoundError(id);
    }

    return prisma.department.update({
      where: { department_id: id },
      data: { is_active: true },
    });
  }

  /**
   * Hard delete a department (only for non-system types with no references)
   *
   * @param id - Department ID
   */
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new DepartmentNotFoundError(id);
    }

    if (existing.is_system) {
      throw new SystemDepartmentError("delete");
    }

    // Check for children
    const childCount = await prisma.department.count({
      where: { parent_id: id },
    });

    if (childCount > 0) {
      throw new Error(
        `Cannot delete department: it has ${childCount} child departments. Remove children first.`,
      );
    }

    // Check for references in transaction_line_items
    const lineItemCount = await prisma.transactionLineItem.count({
      where: { department_id: id },
    });

    if (lineItemCount > 0) {
      throw new Error(
        `Cannot delete department: it is referenced by ${lineItemCount} transaction line items. Deactivate instead.`,
      );
    }

    await prisma.department.delete({
      where: { department_id: id },
    });
  }

  /**
   * Get all active lottery departments
   * Used for lottery-specific operations
   *
   * @param clientId - Optional client ID
   * @returns List of lottery departments
   */
  async getLotteryDepartments(clientId?: string): Promise<Department[]> {
    return prisma.department.findMany({
      where: {
        is_active: true,
        is_lottery: true,
        OR: [
          { client_id: null },
          ...(clientId ? [{ client_id: clientId }] : []),
        ],
      },
      orderBy: { sort_order: "asc" },
    });
  }

  /**
   * Get all active age-restricted departments
   * Used for compliance and ID verification
   *
   * @param clientId - Optional client ID
   * @returns List of age-restricted departments
   */
  async getAgeRestrictedDepartments(clientId?: string): Promise<Department[]> {
    return prisma.department.findMany({
      where: {
        is_active: true,
        minimum_age: { not: null },
        OR: [
          { client_id: null },
          ...(clientId ? [{ client_id: clientId }] : []),
        ],
      },
      orderBy: { sort_order: "asc" },
    });
  }

  /**
   * Get department tree (hierarchical structure)
   *
   * @param clientId - Optional client ID
   * @param rootOnly - Only return root departments
   * @returns List of departments with children
   */
  async getTree(
    clientId?: string,
    rootOnly: boolean = true,
  ): Promise<Department[]> {
    return prisma.department.findMany({
      where: {
        is_active: true,
        ...(rootOnly ? { parent_id: null } : {}),
        OR: [
          { client_id: null },
          ...(clientId ? [{ client_id: clientId }] : []),
        ],
      },
      include: {
        children: {
          where: { is_active: true },
          orderBy: { sort_order: "asc" },
          include: {
            children: {
              where: { is_active: true },
              orderBy: { sort_order: "asc" },
            },
          },
        },
      },
      orderBy: [{ sort_order: "asc" }, { display_name: "asc" }],
    });
  }
}

// Export singleton instance
export const departmentService = new DepartmentService();
