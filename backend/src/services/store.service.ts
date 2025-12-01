import { Prisma, PrismaClient } from "@prisma/client";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../utils/public-id";

const prisma = new PrismaClient();

/**
 * Store status enum values
 */
export type StoreStatus = "ACTIVE" | "INACTIVE" | "CLOSED";

/**
 * Store creation input
 */
export interface CreateStoreInput {
  company_id: string;
  name: string;
  location_json?: {
    address?: string;
  };
  timezone?: string;
  status?: StoreStatus;
}

/**
 * Store update input
 */
export interface UpdateStoreInput {
  name?: string;
  location_json?: {
    address?: string;
  };
  timezone?: string;
  status?: StoreStatus;
}

/**
 * Operating hours for a single day
 */
export interface DayOperatingHours {
  open: string; // Time in HH:mm format (e.g., "09:00")
  close: string; // Time in HH:mm format (e.g., "17:00")
  closed?: boolean; // If true, store is closed on this day
}

/**
 * Operating hours structure
 * Keys are day names: "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
 */
export interface OperatingHours {
  monday?: DayOperatingHours;
  tuesday?: DayOperatingHours;
  wednesday?: DayOperatingHours;
  thursday?: DayOperatingHours;
  friday?: DayOperatingHours;
  saturday?: DayOperatingHours;
  sunday?: DayOperatingHours;
}

/**
 * Store configuration structure
 * Contains timezone, location, and operating hours
 */
export interface StoreConfiguration {
  timezone?: string; // IANA timezone format (e.g., America/New_York)
  location?: {
    address?: string;
  };
  operating_hours?: OperatingHours;
}

/**
 * Validate IANA timezone using Intl.DateTimeFormat
 * This validates that the timezone is an actual valid IANA timezone,
 * not just a format that looks valid.
 * @param timezone - Timezone string to validate
 * @returns true if valid IANA timezone
 */
function isValidIANATimezone(timezone: string): boolean {
  // Limit to reasonable length to prevent abuse
  if (!timezone || timezone.length > 50) {
    return false;
  }

  // Use Intl.DateTimeFormat to validate actual timezone existence
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Store service for managing store CRUD operations
 * Handles store creation, retrieval, updates, and soft deletion
 * Enforces company isolation - users can only access stores for their assigned company
 */
export class StoreService {
  /**
   * Create a new store
   * @param data - Store creation data
   * @returns Created store record
   * @throws Error if validation fails or database error occurs
   */
  async createStore(data: CreateStoreInput) {
    // Validate input
    if (!data.name || data.name.trim().length === 0) {
      throw new Error(
        "Store name is required and cannot be empty or whitespace",
      );
    }

    // Reject whitespace-only names
    if (data.name.trim() !== data.name.replace(/\s+/g, " ").trim()) {
      throw new Error("Store name cannot contain excessive whitespace");
    }

    // Check max length (255 chars)
    if (data.name.trim().length > 255) {
      throw new Error("Store name cannot exceed 255 characters");
    }

    // Validate company_id exists
    if (!data.company_id) {
      throw new Error("Company ID is required");
    }

    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { company_id: data.company_id },
    });
    if (!company) {
      throw new Error(`Company with ID ${data.company_id} not found`);
    }

    // Validate timezone format (IANA timezone database)
    if (data.timezone && !isValidIANATimezone(data.timezone)) {
      throw new Error(
        `Invalid timezone format. Must be IANA timezone format (e.g., America/New_York, Europe/London)`,
      );
    }

    // Validate location_json structure if provided
    if (data.location_json) {
      if (
        data.location_json.address !== undefined &&
        typeof data.location_json.address !== "string"
      ) {
        throw new Error("location_json.address must be a string");
      }
    }

    // Validate status
    if (
      data.status &&
      !["ACTIVE", "INACTIVE", "CLOSED"].includes(data.status)
    ) {
      throw new Error("Invalid status. Must be ACTIVE, INACTIVE, or CLOSED");
    }

    try {
      const store = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          company_id: data.company_id,
          name: data.name.trim(),
          location_json: data.location_json || undefined,
          timezone: data.timezone || "America/New_York",
          status: data.status || "ACTIVE",
        },
      });

      return store;
    } catch (error: any) {
      console.error("Error creating store:", error);
      throw error;
    }
  }

  /**
   * Get store by ID with company isolation check
   * @param storeId - Store UUID
   * @param userCompanyId - User's assigned company ID (for isolation check)
   * @returns Store record
   * @throws Error if store not found or user tries to access store from different company
   */
  async getStoreById(storeId: string, userCompanyId: string) {
    try {
      const store = await prisma.store.findUnique({
        where: {
          store_id: storeId,
        },
      });

      if (!store) {
        throw new Error(`Store with ID ${storeId} not found`);
      }

      // Company isolation check: user can only access stores for their company
      if (store.company_id !== userCompanyId) {
        throw new Error(
          "Forbidden: You can only access stores for your assigned company",
        );
      }

      return store;
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("Forbidden")
      ) {
        throw error;
      }
      console.error("Error retrieving store:", error);
      throw error;
    }
  }

  /**
   * Get all stores for a company (Corporate Admin only, filtered by company_id)
   * @param companyId - Company UUID
   * @returns Array of stores for the company
   */
  async getStoresByCompany(companyId: string) {
    try {
      const stores = await prisma.store.findMany({
        where: {
          company_id: companyId,
        },
        orderBy: {
          created_at: "desc",
        },
      });

      return stores;
    } catch (error: any) {
      console.error("Error retrieving stores:", error);
      throw error;
    }
  }

  /**
   * Update store with company isolation check
   * @param storeId - Store UUID
   * @param userCompanyId - User's assigned company ID (for isolation check)
   * @param data - Store update data
   * @returns Updated store record
   * @throws Error if store not found, validation fails, or user tries to update store from different company
   */
  async updateStore(
    storeId: string,
    userCompanyId: string,
    data: UpdateStoreInput,
  ) {
    // Validate input
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new Error("Store name cannot be empty or whitespace");
    }

    // Check max length if name is being updated
    if (data.name !== undefined && data.name.trim().length > 255) {
      throw new Error("Store name cannot exceed 255 characters");
    }

    // Validate timezone format (IANA timezone database)
    if (data.timezone && !isValidIANATimezone(data.timezone)) {
      throw new Error(
        `Invalid timezone format. Must be IANA timezone format (e.g., America/New_York, Europe/London)`,
      );
    }

    // Validate location_json structure if provided
    if (data.location_json) {
      if (
        data.location_json.address !== undefined &&
        typeof data.location_json.address !== "string"
      ) {
        throw new Error("location_json.address must be a string");
      }
    }

    // Validate status
    if (
      data.status &&
      !["ACTIVE", "INACTIVE", "CLOSED"].includes(data.status)
    ) {
      throw new Error("Invalid status. Must be ACTIVE, INACTIVE, or CLOSED");
    }

    try {
      // Check if store exists and get company info for validation
      const existingStore = await prisma.store.findUnique({
        where: {
          store_id: storeId,
        },
        include: {
          company: {
            select: {
              company_id: true,
              name: true,
              status: true,
            },
          },
        },
      });

      if (!existingStore) {
        throw new Error(`Store with ID ${storeId} not found`);
      }

      // Company isolation check: user can only update stores for their company
      if (existingStore.company_id !== userCompanyId) {
        throw new Error(
          "Forbidden: You can only update stores for your assigned company",
        );
      }

      // Prevent activating a store if its company is inactive
      if (
        data.status === "ACTIVE" &&
        existingStore.status !== "ACTIVE" &&
        existingStore.company &&
        existingStore.company.status !== "ACTIVE"
      ) {
        throw new Error(
          `Cannot activate store because its company "${existingStore.company.name}" is ${existingStore.company.status}. Please activate the company first.`,
        );
      }

      // Prepare update data
      const updateData: any = {};
      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }
      if (data.location_json !== undefined) {
        updateData.location_json = data.location_json;
      }
      if (data.timezone !== undefined) {
        updateData.timezone = data.timezone;
      }
      if (data.status !== undefined) {
        updateData.status = data.status;
      }

      const store = await prisma.store.update({
        where: {
          store_id: storeId,
        },
        data: updateData,
      });

      return store;
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("Forbidden")
      ) {
        throw error;
      }
      console.error("Error updating store:", error);
      throw error;
    }
  }

  /**
   * Update store configuration with company isolation check
   * @param storeId - Store UUID
   * @param userCompanyId - User's assigned company ID (for isolation check)
   * @param config - Store configuration data
   * @returns Updated store record
   * @throws Error if store not found, validation fails, or user tries to update store from different company
   */
  async updateStoreConfiguration(
    storeId: string,
    userCompanyId: string,
    config: StoreConfiguration,
  ) {
    // Validate timezone format if provided
    if (config.timezone && !isValidIANATimezone(config.timezone)) {
      throw new Error(
        `Invalid timezone format. Must be IANA timezone format (e.g., America/New_York, Europe/London)`,
      );
    }

    // Validate location structure if provided
    if (config.location) {
      if (
        config.location.address !== undefined &&
        typeof config.location.address !== "string"
      ) {
        throw new Error("location.address must be a string");
      }
      // XSS protection: Reject addresses containing script tags or other dangerous HTML
      if (config.location.address) {
        const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
        if (xssPattern.test(config.location.address)) {
          throw new Error(
            "Invalid address: HTML tags and scripts are not allowed",
          );
        }
      }
    }

    // Validate operating hours format if provided
    if (config.operating_hours) {
      const days = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ];
      for (const day of days) {
        const dayHours = config.operating_hours?.[day as keyof OperatingHours];
        if (dayHours) {
          // If closed is true, skip other validations
          if (dayHours.closed === true) {
            continue;
          }
          // Validate time format (HH:mm)
          const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
          if (!dayHours.open || !timeRegex.test(dayHours.open)) {
            throw new Error(
              `${day} open time must be in HH:mm format (e.g., 09:00)`,
            );
          }
          if (!dayHours.close || !timeRegex.test(dayHours.close)) {
            throw new Error(
              `${day} close time must be in HH:mm format (e.g., 17:00)`,
            );
          }
          // Validate that close time is after open time
          const [openHour, openMin] = dayHours.open.split(":").map(Number);
          const [closeHour, closeMin] = dayHours.close.split(":").map(Number);
          const openMinutes = openHour * 60 + openMin;
          const closeMinutes = closeHour * 60 + closeMin;
          if (closeMinutes <= openMinutes) {
            throw new Error(`${day} close time must be after open time`);
          }
        }
      }
    }

    try {
      // Check if store exists and verify company isolation
      const existingStore = await prisma.store.findUnique({
        where: {
          store_id: storeId,
        },
      });

      if (!existingStore) {
        throw new Error(`Store with ID ${storeId} not found`);
      }

      // Company isolation check: user can only update stores for their company
      if (existingStore.company_id !== userCompanyId) {
        throw new Error(
          "Forbidden: You can only update stores for your assigned company",
        );
      }

      // Merge new configuration with existing configuration (deep merge)
      const existingConfig = (existingStore.configuration as any) || {};
      const mergedConfig = {
        ...existingConfig,
        ...(config.timezone !== undefined && { timezone: config.timezone }),
        ...(config.location !== undefined && {
          location: {
            ...(existingConfig.location || {}),
            ...config.location,
          },
        }),
        ...(config.operating_hours !== undefined && {
          operating_hours: {
            ...(existingConfig.operating_hours || {}),
            ...config.operating_hours,
          },
        }),
      };

      // Update store configuration
      const store = await prisma.store.update({
        where: {
          store_id: storeId,
        },
        data: {
          configuration: mergedConfig as any,
        },
      });

      return store;
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("Forbidden")
      ) {
        throw error;
      }
      console.error("Error updating store configuration:", error);
      throw error;
    }
  }

  /**
   * Get terminals for a store with active shift status
   * Story 4.8: Cashier Shift Start Flow
   * @param storeId - Store UUID
   * @param userCompanyId - User's assigned company ID (for isolation check)
   * @returns Array of terminals with has_active_shift boolean flag
   * @throws Error if store not found or user tries to access store from different company
   */
  async getStoreTerminals(storeId: string, userCompanyId: string) {
    try {
      // Verify store exists and user has access (company isolation)
      const store = await prisma.store.findUnique({
        where: {
          store_id: storeId,
        },
      });

      if (!store) {
        throw new Error(`Store with ID ${storeId} not found`);
      }

      // Company isolation check: user can only access terminals for their company
      if (store.company_id !== userCompanyId) {
        throw new Error(
          "Forbidden: You can only access terminals for your assigned company",
        );
      }

      // Get all non-deleted terminals for the store
      const terminals = await prisma.pOSTerminal.findMany({
        where: {
          store_id: storeId,
          deleted_at: null, // Only get non-deleted terminals
        },
        orderBy: {
          name: "asc",
        },
      });

      // For each terminal, check if it has an active shift
      const terminalsWithStatus = await Promise.all(
        terminals.map(async (terminal) => {
          // Check for active shifts (status IN ['OPEN', 'ACTIVE', 'CLOSING', 'RECONCILING'])
          const activeShift = await prisma.shift.findFirst({
            where: {
              pos_terminal_id: terminal.pos_terminal_id,
              status: {
                in: ["OPEN", "ACTIVE", "CLOSING", "RECONCILING"],
              },
              closed_at: null,
            },
          });

          return {
            pos_terminal_id: terminal.pos_terminal_id,
            store_id: terminal.store_id,
            name: terminal.name,
            device_id: terminal.device_id,
            has_active_shift: !!activeShift,
            created_at: terminal.created_at,
            updated_at: terminal.updated_at,
          };
        }),
      );

      return terminalsWithStatus;
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("Forbidden")
      ) {
        throw error;
      }
      console.error("Error retrieving store terminals:", error);
      throw error;
    }
  }

  /**
   * Create a new POS terminal for a store
   * @param storeId - Store UUID
   * @param data - Terminal creation data
   * @param userCompanyId - User's assigned company ID (for isolation check)
   * @returns Created terminal
   * @throws Error if store not found, device_id is duplicate, or user tries to create terminal for store from different company
   */
  async createTerminal(
    storeId: string,
    data: { name: string; device_id?: string },
    userCompanyId: string,
  ) {
    try {
      // Verify store exists and user has access (company isolation)
      const store = await prisma.store.findUnique({
        where: {
          store_id: storeId,
        },
      });

      if (!store) {
        throw new Error(`Store with ID ${storeId} not found`);
      }

      // Company isolation check: user can only create terminals for their company
      if (store.company_id !== userCompanyId) {
        throw new Error(
          "Forbidden: You can only create terminals for your assigned company",
        );
      }

      // Validate terminal name
      if (!data.name || data.name.trim().length === 0) {
        throw new Error("Terminal name is required");
      }

      if (data.name.length > 100) {
        throw new Error("Terminal name must be 100 characters or less");
      }

      // Validate device_id if provided
      if (data.device_id !== undefined) {
        if (data.device_id.trim().length === 0) {
          // Empty string means no device_id
          data.device_id = undefined;
        } else {
          if (data.device_id.length > 255) {
            throw new Error("Device ID must be 255 characters or less");
          }

          const trimmedDeviceId = data.device_id.trim();

          // Check global uniqueness (device_id must be unique across all stores)
          const existingGlobal = await prisma.pOSTerminal.findFirst({
            where: {
              device_id: trimmedDeviceId,
              deleted_at: null, // Only check non-deleted terminals
            },
          });

          if (existingGlobal) {
            throw new Error(
              `Device ID "${trimmedDeviceId}" is already in use. Device IDs must be globally unique.`,
            );
          }

          data.device_id = trimmedDeviceId;
        }
      }

      // Create terminal
      const terminal = await prisma.pOSTerminal.create({
        data: {
          store_id: storeId,
          name: data.name.trim(),
          device_id: data.device_id || null,
        },
      });

      return terminal;
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("Forbidden") ||
        error.message.includes("required") ||
        error.message.includes("must be") ||
        error.message.includes("already in use") ||
        error.code === "P2002" // Prisma unique constraint violation
      ) {
        if (error.code === "P2002") {
          // Handle Prisma unique constraint error
          if (error.meta?.target?.includes("device_id")) {
            throw new Error(
              "Device ID is already in use. Device IDs must be globally unique.",
            );
          }
        }
        throw error;
      }
      console.error("Error creating terminal:", error);
      throw error;
    }
  }

  /**
   * Update a POS terminal
   * @param terminalId - Terminal UUID
   * @param data - Terminal update data
   * @param userCompanyId - User's assigned company ID (for isolation check)
   * @returns Updated terminal
   * @throws Error if terminal not found, device_id is duplicate, or user tries to update terminal from different company
   */
  async updateTerminal(
    terminalId: string,
    data: { name?: string; device_id?: string },
    userCompanyId: string,
  ) {
    try {
      // Verify terminal exists and get store info (exclude soft-deleted)
      const terminal = await prisma.pOSTerminal.findFirst({
        where: {
          pos_terminal_id: terminalId,
          deleted_at: null, // Only find non-deleted terminals
        },
        include: {
          store: {
            select: {
              company_id: true,
            },
          },
        },
      });

      if (!terminal) {
        throw new Error(`Terminal with ID ${terminalId} not found`);
      }

      // Company isolation check: user can only update terminals for their company
      if (terminal.store.company_id !== userCompanyId) {
        throw new Error(
          "Forbidden: You can only update terminals for your assigned company",
        );
      }

      // Validate terminal name if provided
      if (data.name !== undefined) {
        if (data.name.trim().length === 0) {
          throw new Error("Terminal name is required");
        }

        if (data.name.length > 100) {
          throw new Error("Terminal name must be 100 characters or less");
        }
      }

      // Validate device_id if provided
      if (data.device_id !== undefined) {
        if (data.device_id.trim().length === 0) {
          // Empty string means no device_id
          data.device_id = undefined;
        } else {
          if (data.device_id.length > 255) {
            throw new Error("Device ID must be 255 characters or less");
          }

          const trimmedDeviceId = data.device_id.trim();

          // Check global uniqueness (device_id must be unique across all stores)
          // Exclude current terminal from check
          const existingGlobal = await prisma.pOSTerminal.findFirst({
            where: {
              device_id: trimmedDeviceId,
              deleted_at: null, // Only check non-deleted terminals
              pos_terminal_id: {
                not: terminalId, // Exclude current terminal
              },
            },
          });

          if (existingGlobal) {
            throw new Error(
              `Device ID "${trimmedDeviceId}" is already in use. Device IDs must be globally unique.`,
            );
          }

          data.device_id = trimmedDeviceId;
        }
      }

      // Build update data
      const updateData: any = {};
      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }
      if (data.device_id !== undefined) {
        updateData.device_id = data.device_id || null;
      }

      // Update terminal
      const updatedTerminal = await prisma.pOSTerminal.update({
        where: {
          pos_terminal_id: terminalId,
        },
        data: updateData,
      });

      return updatedTerminal;
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("Forbidden") ||
        error.message.includes("required") ||
        error.message.includes("must be") ||
        error.message.includes("already in use") ||
        error.code === "P2002" // Prisma unique constraint violation
      ) {
        if (error.code === "P2002") {
          // Handle Prisma unique constraint error
          if (error.meta?.target?.includes("device_id")) {
            throw new Error(
              "Device ID is already in use. Device IDs must be globally unique.",
            );
          }
        }
        throw error;
      }
      console.error("Error updating terminal:", error);
      throw error;
    }
  }

  /**
   * Soft delete a POS terminal
   * Sets deleted_at timestamp instead of hard deleting
   * @param terminalId - Terminal UUID
   * @param storeId - Store UUID (must match terminal's store)
   * @param userCompanyId - User's assigned company ID (for isolation check)
   * @throws Error if terminal not found, terminal doesn't belong to store, terminal has active shift, or user tries to delete terminal from different company
   */
  async deleteTerminal(
    terminalId: string,
    storeId: string,
    userCompanyId: string,
  ): Promise<void> {
    try {
      // Verify terminal exists and get store info (exclude soft-deleted)
      const terminal = await prisma.pOSTerminal.findFirst({
        where: {
          pos_terminal_id: terminalId,
          deleted_at: null, // Only find non-deleted terminals
        },
        include: {
          store: {
            select: {
              company_id: true,
            },
          },
        },
      });

      if (!terminal) {
        throw new Error(`Terminal with ID ${terminalId} not found`);
      }

      // Validate terminal belongs to the provided store
      if (terminal.store_id !== storeId) {
        throw new Error(
          `Terminal with ID ${terminalId} does not belong to store ${storeId}`,
        );
      }

      // Company isolation check: user can only delete terminals for their company
      if (terminal.store.company_id !== userCompanyId) {
        throw new Error(
          "Forbidden: You can only delete terminals for your assigned company",
        );
      }

      // Check for active shifts on this terminal
      const activeShift = await prisma.shift.findFirst({
        where: {
          pos_terminal_id: terminalId,
          status: {
            in: ["OPEN", "ACTIVE", "CLOSING", "RECONCILING"],
          },
          closed_at: null,
        },
      });

      if (activeShift) {
        throw new Error(
          "Cannot delete terminal with active shift. Close the shift first.",
        );
      }

      // Soft delete terminal (set deleted_at timestamp)
      await prisma.pOSTerminal.update({
        where: {
          pos_terminal_id: terminalId,
        },
        data: {
          deleted_at: new Date(),
        },
      });
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("Forbidden") ||
        error.message.includes("active shift")
      ) {
        throw error;
      }
      console.error("Error deleting terminal:", error);
      throw error;
    }
  }

  /**
   * Hard delete store with company isolation check
   * Permanently removes the store and cascades to all user roles associated with this store
   * @param storeId - Store UUID
   * @param userCompanyId - User's assigned company ID (for isolation check)
   * @throws Error if store not found, store is ACTIVE, or user tries to delete store from different company
   */
  async deleteStore(storeId: string, userCompanyId: string): Promise<void> {
    try {
      // Check if store exists and verify company isolation
      const existingStore = await prisma.store.findUnique({
        where: {
          store_id: storeId,
        },
      });

      if (!existingStore) {
        throw new Error(`Store with ID ${storeId} not found`);
      }

      // Company isolation check: user can only delete stores for their company
      if (existingStore.company_id !== userCompanyId) {
        throw new Error(
          "Forbidden: You can only delete stores for your assigned company",
        );
      }

      // Prevent deletion of ACTIVE stores - they must be set to INACTIVE first
      if (existingStore.status === "ACTIVE") {
        throw new Error(
          "Cannot delete ACTIVE store. Set status to INACTIVE first.",
        );
      }

      // Use transaction to hard delete store and cascade to user roles
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Delete all UserRoles associated with this store
        await tx.userRole.deleteMany({
          where: {
            store_id: storeId,
          },
        });

        // Delete the store
        await tx.store.delete({
          where: {
            store_id: storeId,
          },
        });
      });
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("Forbidden") ||
        error.message.includes("ACTIVE store")
      ) {
        throw error;
      }
      console.error("Error deleting store:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const storeService = new StoreService();
