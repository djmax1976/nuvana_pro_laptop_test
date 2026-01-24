import {
  Prisma,
  POSConnectionType,
  POSVendorType,
  POSTerminalStatus,
  SyncStatus,
} from "@prisma/client";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../utils/public-id";
import { rbacService } from "./rbac.service";
import { prisma } from "../utils/db";

/**
 * Store status enum values
 */
export type StoreStatus = "ACTIVE" | "INACTIVE" | "CLOSED";

/**
 * Store creation input
 * Includes both legacy location_json and structured address fields
 *
 * @enterprise-standards
 * - API-001: VALIDATION - All inputs validated via Zod schemas
 * - SEC-006: SQL_INJECTION - Prisma ORM prevents injection
 * - DB-006: TENANT_ISOLATION - Company scoping enforced
 */
export interface CreateStoreInput {
  company_id: string;
  name: string;
  /** @deprecated Use structured address fields instead */
  location_json?: {
    address?: string;
  };
  timezone?: string;
  status?: StoreStatus;
  // === Structured Address Fields ===
  /** Street address line 1 (e.g., "123 Main Street") */
  address_line1?: string;
  /** Street address line 2 (e.g., "Suite 100") */
  address_line2?: string | null;
  /** City name (denormalized for display) */
  city?: string;
  /** FK to us_states - CRITICAL: determines lottery game visibility */
  state_id?: string;
  /** FK to us_counties - for tax jurisdiction */
  county_id?: string | null;
  /** ZIP code (5-digit or ZIP+4 format) */
  zip_code?: string;
}

/**
 * Store update input
 *
 * @enterprise-standards
 * - API-001: VALIDATION - All inputs validated via Zod schemas
 * - SEC-006: SQL_INJECTION - Prisma ORM prevents injection
 * - DB-006: TENANT_ISOLATION - Company scoping enforced
 */
export interface UpdateStoreInput {
  name?: string;
  /** @deprecated Use structured address fields instead */
  location_json?: {
    address?: string;
  };
  timezone?: string;
  status?: StoreStatus;
  // === Structured Address Fields ===
  /** Street address line 1 (e.g., "123 Main Street") */
  address_line1?: string;
  /** Street address line 2 (e.g., "Suite 100") */
  address_line2?: string | null;
  /** City name (denormalized for display) */
  city?: string;
  /** FK to us_states - CRITICAL: determines lottery game visibility */
  state_id?: string;
  /** FK to us_counties - for tax jurisdiction */
  county_id?: string;
  /** ZIP code (5-digit or ZIP+4 format) */
  zip_code?: string;
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
  async createStore(data: CreateStoreInput, tx?: Prisma.TransactionClient) {
    const client: Prisma.TransactionClient | typeof prisma = tx ?? prisma;
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
    const company = await client.company.findUnique({
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

    // === Validate Structured Address Fields ===
    // SEC-014: INPUT_VALIDATION - Validate all address inputs

    // Validate address_line1
    if (data.address_line1 !== undefined) {
      if (typeof data.address_line1 !== "string") {
        throw new Error("address_line1 must be a string");
      }
      if (data.address_line1.trim().length > 255) {
        throw new Error("address_line1 cannot exceed 255 characters");
      }
      // XSS protection: Reject addresses containing dangerous HTML
      const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
      if (xssPattern.test(data.address_line1)) {
        throw new Error(
          "Invalid address_line1: HTML tags and scripts are not allowed",
        );
      }
    }

    // Validate address_line2
    if (data.address_line2 !== undefined && data.address_line2 !== null) {
      if (typeof data.address_line2 !== "string") {
        throw new Error("address_line2 must be a string");
      }
      if (data.address_line2.trim().length > 255) {
        throw new Error("address_line2 cannot exceed 255 characters");
      }
      const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
      if (xssPattern.test(data.address_line2)) {
        throw new Error(
          "Invalid address_line2: HTML tags and scripts are not allowed",
        );
      }
    }

    // Validate city
    if (data.city !== undefined) {
      if (typeof data.city !== "string") {
        throw new Error("city must be a string");
      }
      if (data.city.trim().length > 100) {
        throw new Error("city cannot exceed 100 characters");
      }
    }

    // Validate state_id (UUID format)
    if (data.state_id !== undefined) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(data.state_id)) {
        throw new Error("state_id must be a valid UUID");
      }
    }

    // Validate county_id (UUID format)
    if (data.county_id !== undefined && data.county_id !== null) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(data.county_id)) {
        throw new Error("county_id must be a valid UUID");
      }
    }

    // Validate zip_code (5-digit or ZIP+4 format)
    if (data.zip_code !== undefined) {
      if (typeof data.zip_code !== "string") {
        throw new Error("zip_code must be a string");
      }
      // eslint-disable-next-line security/detect-unsafe-regex -- Safe: bounded quantifiers with fixed length
      const zipRegex = /^[0-9]{5}(-[0-9]{4})?$/;
      if (!zipRegex.test(data.zip_code)) {
        throw new Error("zip_code must be in format 12345 or 12345-6789");
      }
    }

    try {
      const store = await client.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          company_id: data.company_id,
          name: data.name.trim(),
          location_json: data.location_json || undefined,
          timezone: data.timezone || "America/New_York",
          status: data.status || "ACTIVE",
          // === Structured Address Fields ===
          address_line1: data.address_line1?.trim() || null,
          address_line2:
            data.address_line2 === null
              ? null
              : data.address_line2?.trim() || null,
          city: data.city?.trim() || null,
          state_id: data.state_id || null,
          county_id: data.county_id || null,
          zip_code: data.zip_code || null,
        },
        include: {
          state: {
            select: {
              state_id: true,
              code: true,
              name: true,
            },
          },
          county: {
            select: {
              county_id: true,
              name: true,
            },
          },
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

    // Validate location_json structure if provided (deprecated)
    if (data.location_json) {
      if (
        data.location_json.address !== undefined &&
        typeof data.location_json.address !== "string"
      ) {
        throw new Error("location_json.address must be a string");
      }
    }

    // === Validate Structured Address Fields ===
    // SEC-014: INPUT_VALIDATION - Validate all address inputs

    // Validate address_line1
    if (data.address_line1 !== undefined) {
      if (typeof data.address_line1 !== "string") {
        throw new Error("address_line1 must be a string");
      }
      if (data.address_line1.trim().length > 255) {
        throw new Error("address_line1 cannot exceed 255 characters");
      }
      // XSS protection: Reject addresses containing dangerous HTML
      const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
      if (xssPattern.test(data.address_line1)) {
        throw new Error(
          "Invalid address_line1: HTML tags and scripts are not allowed",
        );
      }
    }

    // Validate address_line2
    if (data.address_line2 !== undefined && data.address_line2 !== null) {
      if (typeof data.address_line2 !== "string") {
        throw new Error("address_line2 must be a string");
      }
      if (data.address_line2.trim().length > 255) {
        throw new Error("address_line2 cannot exceed 255 characters");
      }
      const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
      if (xssPattern.test(data.address_line2)) {
        throw new Error(
          "Invalid address_line2: HTML tags and scripts are not allowed",
        );
      }
    }

    // Validate city
    if (data.city !== undefined) {
      if (typeof data.city !== "string") {
        throw new Error("city must be a string");
      }
      if (data.city.trim().length > 100) {
        throw new Error("city cannot exceed 100 characters");
      }
    }

    // Validate state_id (UUID format)
    if (data.state_id !== undefined) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(data.state_id)) {
        throw new Error("state_id must be a valid UUID");
      }
    }

    // Validate county_id (UUID format)
    if (data.county_id !== undefined) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(data.county_id)) {
        throw new Error("county_id must be a valid UUID");
      }
    }

    // Validate zip_code (5-digit or ZIP+4 format)
    if (data.zip_code !== undefined) {
      if (typeof data.zip_code !== "string") {
        throw new Error("zip_code must be a string");
      }
      // eslint-disable-next-line security/detect-unsafe-regex -- Safe: bounded quantifiers with fixed length
      const zipRegex = /^[0-9]{5}(-[0-9]{4})?$/;
      if (!zipRegex.test(data.zip_code)) {
        throw new Error("zip_code must be in format 12345 or 12345-6789");
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

      // === Structured Address Fields ===
      if (data.address_line1 !== undefined) {
        updateData.address_line1 = data.address_line1.trim();
      }
      if (data.address_line2 !== undefined) {
        updateData.address_line2 =
          data.address_line2 === null ? null : data.address_line2.trim();
      }
      if (data.city !== undefined) {
        updateData.city = data.city.trim();
      }
      if (data.state_id !== undefined) {
        updateData.state_id = data.state_id;
      }
      if (data.county_id !== undefined) {
        updateData.county_id = data.county_id;
      }
      if (data.zip_code !== undefined) {
        updateData.zip_code = data.zip_code;
      }

      const store = await prisma.store.update({
        where: {
          store_id: storeId,
        },
        data: updateData,
        include: {
          state: {
            select: {
              state_id: true,
              code: true,
              name: true,
            },
          },
          county: {
            select: {
              county_id: true,
              name: true,
            },
          },
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
      console.error("Error updating store:", error);
      throw error;
    }
  }

  /**
   * Get store settings for client users
   * Returns store name and configuration (address, timezone, contact_email, operating_hours)
   * @param storeId - Store UUID
   * @param clientUserId - Client user UUID (owner of the company that owns the store)
   * @returns Store settings data
   * @throws Error if store not found or user doesn't own the store
   */
  async getStoreSettings(storeId: string, clientUserId: string) {
    try {
      // Verify store belongs to client user's companies
      const store = await prisma.store.findFirst({
        where: {
          store_id: storeId,
          company: {
            owner_user_id: clientUserId,
          },
        },
        select: {
          store_id: true,
          name: true,
          configuration: true,
          location_json: true,
          timezone: true,
        },
      });

      if (!store) {
        throw new Error(
          "Forbidden: You can only access settings for stores you own",
        );
      }

      // Extract configuration data
      const config = (store.configuration as any) || {};
      const location = config.location || {};
      const locationJson = (store.location_json as Record<string, any>) || {};
      const address = location.address || locationJson.address || null;

      // Build response with store name and configuration
      return {
        name: store.name,
        address: address,
        timezone: config.timezone || store.timezone || "America/New_York",
        contact_email: config.contact_email || null,
        operating_hours: config.operating_hours || null,
      };
    } catch (error: any) {
      if (error.message.includes("Forbidden")) {
        throw error;
      }
      console.error("Error retrieving store settings:", error);
      throw error;
    }
  }

  /**
   * Update store settings for client users
   * Updates store configuration (address, timezone, contact_email, operating_hours)
   * @param storeId - Store UUID
   * @param clientUserId - Client user UUID (owner of the company that owns the store)
   * @param config - Store configuration data
   * @returns Updated store record
   * @throws Error if store not found, validation fails, or user doesn't own the store
   */
  async updateStoreSettings(
    storeId: string,
    clientUserId: string,
    config: {
      address?: string;
      timezone?: string;
      contact_email?: string;
      operating_hours?: OperatingHours;
    },
  ) {
    // Validate timezone format if provided
    if (config.timezone && !isValidIANATimezone(config.timezone)) {
      throw new Error(
        `Invalid timezone format. Must be IANA timezone format (e.g., America/New_York, Europe/London)`,
      );
    }

    // Validate email format if provided
    if (config.contact_email !== undefined) {
      if (config.contact_email && typeof config.contact_email !== "string") {
        throw new Error("contact_email must be a string");
      }
      if (config.contact_email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(config.contact_email)) {
          throw new Error("Invalid email format");
        }
      }
    }

    // Validate address if provided
    if (config.address !== undefined) {
      if (config.address && typeof config.address !== "string") {
        throw new Error("address must be a string");
      }
      // XSS protection: Reject addresses containing script tags or other dangerous HTML
      if (config.address) {
        const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
        if (xssPattern.test(config.address)) {
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
      // Verify store belongs to client user's companies
      const existingStore = await prisma.store.findFirst({
        where: {
          store_id: storeId,
          company: {
            owner_user_id: clientUserId,
          },
        },
      });

      if (!existingStore) {
        throw new Error(
          "Forbidden: You can only update settings for stores you own",
        );
      }

      // Merge new configuration with existing configuration (deep merge)
      const existingConfig = (existingStore.configuration as any) || {};
      const mergedConfig = {
        ...existingConfig,
        ...(config.timezone !== undefined && { timezone: config.timezone }),
        ...(config.contact_email !== undefined && {
          contact_email: config.contact_email,
        }),
        ...(config.address !== undefined && {
          address: config.address,
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
      if (error.message.includes("Forbidden")) {
        throw error;
      }
      console.error("Error updating store settings:", error);
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
   * Check if user has access to a store
   * Handles SYSTEM scope (system admin) bypass and company isolation for other users
   * @param userId - User UUID
   * @param storeId - Store UUID
   * @returns true if user has access, false otherwise
   * @throws Error if there's a database or service error
   */
  async checkUserStoreAccess(
    userId: string,
    storeId: string,
  ): Promise<boolean> {
    try {
      // Get user's roles
      const userRoles = await rbacService.getUserRoles(userId);

      // Check for superadmin (system scope - can access all stores)
      const hasSuperadminRole = userRoles.some(
        (role) => role.scope === "SYSTEM" || role.role_code === "SUPERADMIN",
      );

      if (hasSuperadminRole) {
        // Superadmins can access any store, just verify store exists
        const store = await prisma.store.findUnique({
          where: { store_id: storeId },
          select: { store_id: true },
        });
        return !!store;
      }

      // Find user's company ID from company-scoped role
      const companyRole = userRoles.find(
        (role) => role.scope === "COMPANY" && role.company_id,
      );

      if (!companyRole?.company_id) {
        // Check for store-scoped roles
        const storeRoles = userRoles.filter(
          (role) => role.scope === "STORE" && role.store_id,
        );
        // User can access if they have a role scoped to this specific store
        return storeRoles.some((role) => role.store_id === storeId);
      }

      // Check if store belongs to user's company
      const store = await prisma.store.findUnique({
        where: { store_id: storeId },
        select: { company_id: true },
      });

      if (!store) {
        return false;
      }

      return store.company_id === companyRole.company_id;
    } catch (error: any) {
      // Log the error for debugging
      console.error("Error in checkUserStoreAccess:", error);
      // Re-throw to let the calling method handle it
      throw error;
    }
  }

  /**
   * Get terminals for a store with active shift status
   * Story 4.8: Cashier Shift Start Flow
   * @param storeId - Store UUID
   * @param userId - User UUID (for authorization check)
   * @returns Array of terminals with has_active_shift boolean flag
   * @throws Error if store not found or user doesn't have access to store
   */
  async getStoreTerminals(storeId: string, userId: string) {
    try {
      // Check if user has access to the store (handles SYSTEM scope bypass)
      // Note: checkUserStoreAccess also verifies store exists, so no redundant check needed
      let hasAccess: boolean;
      try {
        hasAccess = await this.checkUserStoreAccess(userId, storeId);
      } catch (accessError: any) {
        // If checkUserStoreAccess throws an error, log it and re-throw
        console.error("Error checking user store access:", accessError);
        throw new Error(
          `Failed to verify store access: ${accessError.message || "Unknown error"}`,
        );
      }

      if (!hasAccess) {
        throw new Error("Forbidden: You do not have access to this store");
      }

      // PERFORMANCE OPTIMIZATION: Use eager loading with filtered relation to eliminate N+1 queries
      // Instead of making N separate queries for each terminal's active shift, we fetch all data
      // in a single query using Prisma's include with filtered relations.
      // This reduces from N+1 queries to just 2 queries (terminals + shifts via IN clause).
      const terminals = await prisma.pOSTerminal.findMany({
        where: {
          store_id: storeId,
          deleted_at: null, // Only get non-deleted terminals
        },
        include: {
          // Include only active shifts - Prisma will use efficient IN clause
          shifts: {
            where: {
              status: {
                in: ["OPEN", "ACTIVE", "CLOSING", "RECONCILING"],
              },
              closed_at: null,
            },
            take: 1, // We only need to know if at least one exists
            select: {
              shift_id: true,
              // Include cashier relation to get the name for active shift display
              cashier: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      // Map terminals to response format with has_active_shift boolean and cashier name
      // This is an O(N) in-memory operation, much faster than N database queries
      const terminalsWithStatus = terminals.map((terminal) => {
        const activeShift = terminal.shifts[0];
        return {
          pos_terminal_id: terminal.pos_terminal_id,
          store_id: terminal.store_id,
          name: terminal.name,
          device_id: terminal.device_id,
          connection_type: terminal.connection_type,
          connection_config: terminal.connection_config,
          vendor_type: terminal.vendor_type,
          terminal_status: terminal.terminal_status,
          last_sync_at: terminal.last_sync_at,
          sync_status: terminal.sync_status,
          has_active_shift: terminal.shifts.length > 0,
          // Include cashier name when there's an active shift
          active_shift_cashier_name: activeShift?.cashier?.name ?? null,
          created_at: terminal.created_at,
          updated_at: terminal.updated_at,
        };
      });

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
   * @param userId - User UUID (for authorization check)
   * @returns Created terminal
   * @throws Error if store not found, device_id is duplicate, or user doesn't have access to store
   */
  async createTerminal(
    storeId: string,
    data: {
      name: string;
      device_id?: string;
      connection_type?: POSConnectionType;
      connection_config?: any;
      vendor_type?: POSVendorType;
      terminal_status?: POSTerminalStatus;
      sync_status?: SyncStatus;
    },
    userId: string,
  ) {
    try {
      // Check if user has access to the store (handles SYSTEM scope bypass)
      let hasAccess: boolean;
      try {
        hasAccess = await this.checkUserStoreAccess(userId, storeId);
      } catch (accessError: any) {
        // If checkUserStoreAccess throws an error, log it and re-throw
        console.error("Error checking user store access:", accessError);
        throw new Error(
          `Failed to verify store access: ${accessError.message || "Unknown error"}`,
        );
      }

      if (!hasAccess) {
        throw new Error("Forbidden: You do not have access to this store");
      }

      // Verify store exists (checkUserStoreAccess already verified, but double-check for safety)
      const store = await prisma.store.findUnique({
        where: {
          store_id: storeId,
        },
      });

      if (!store) {
        throw new Error(`Store with ID ${storeId} not found`);
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
          connection_type: data.connection_type,
          connection_config: data.connection_config ?? null,
          vendor_type: data.vendor_type,
          terminal_status: data.terminal_status,
          sync_status: data.sync_status,
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
   * @param userId - User UUID (for authorization check)
   * @returns Updated terminal
   * @throws Error if terminal not found, device_id is duplicate, or user doesn't have access to store
   */
  async updateTerminal(
    terminalId: string,
    data: {
      name?: string;
      device_id?: string;
      connection_type?: POSConnectionType;
      connection_config?: any;
      vendor_type?: POSVendorType;
      terminal_status?: POSTerminalStatus;
      sync_status?: SyncStatus;
    },
    userId: string,
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
              store_id: true,
            },
          },
        },
      });

      if (!terminal) {
        throw new Error(`Terminal with ID ${terminalId} not found`);
      }

      // Check if user has access to the store (handles SYSTEM scope bypass)
      const hasAccess = await this.checkUserStoreAccess(
        userId,
        terminal.store_id,
      );
      if (!hasAccess) {
        throw new Error("Forbidden: You do not have access to this store");
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
      if (data.connection_type !== undefined) {
        updateData.connection_type = data.connection_type;
      }
      if (data.connection_config !== undefined) {
        updateData.connection_config = data.connection_config || null;
      }
      if (data.vendor_type !== undefined) {
        updateData.vendor_type = data.vendor_type;
      }
      if (data.terminal_status !== undefined) {
        updateData.terminal_status = data.terminal_status;
      }
      if (data.sync_status !== undefined) {
        updateData.sync_status = data.sync_status;
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
   * @param userId - User UUID (for authorization check)
   * @throws Error if terminal not found, terminal doesn't belong to store, terminal has active shift, or user doesn't have access to store
   */
  async deleteTerminal(
    terminalId: string,
    storeId: string,
    userId: string,
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
              store_id: true,
            },
          },
        },
      });

      if (!terminal) {
        throw new Error(`Terminal with ID ${terminalId} not found`);
      }

      // Check if user has access to the store (handles SYSTEM scope bypass)
      const hasAccess = await this.checkUserStoreAccess(
        userId,
        terminal.store_id,
      );
      if (!hasAccess) {
        throw new Error("Forbidden: You do not have access to this store");
      }

      // Validate terminal belongs to the provided store
      if (terminal.store_id !== storeId) {
        throw new Error(
          `Terminal with ID ${terminalId} does not belong to store ${storeId}`,
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
