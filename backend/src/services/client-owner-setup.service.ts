/**
 * Client Owner Setup Service
 *
 * Handles atomic creation of User + Company + Store + Store Login in a single transaction.
 * This service supports the Super Admin wizard flow for creating a complete client setup.
 *
 * Transaction Guarantee:
 * - All 4 entities created atomically
 * - Full rollback on ANY failure (validation, DB constraint, etc.)
 * - Audit logs created within same transaction
 *
 * @enterprise-standards
 * - SEC-001: PASSWORD_HASHING - bcrypt with salt rounds 10
 * - SEC-006: SQL_INJECTION - Prisma ORM prevents injection
 * - DB-001: ORM_USAGE - Prisma query builder for all operations
 * - DB-006: TENANT_ISOLATION - Proper company/store scoping
 * - API-001: VALIDATION - Zod schema validation
 * - API-003: ERROR_HANDLING - Structured error responses
 * - LM-002: MONITORING - Audit logging for all operations
 */

import { Prisma, POSSystemType, POSConnectionType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../utils/db";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../utils/public-id";
import type { USAddressInput } from "../schemas/address.schema";
import type {
  ClientOwnerSetupRequest,
  ClientOwnerSetupResponse,
} from "../schemas/client-owner-setup.schema";

// =============================================================================
// Types
// =============================================================================

/**
 * Audit context for logging operations
 * DB-008: QUERY_LOGGING - Track who performed what action
 */
export interface AuditContext {
  userId: string;
  userEmail: string;
  userRoles: string[];
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Validated state information with denormalized data
 */
interface ValidatedStateInfo {
  stateId: string;
  stateCode: string;
  stateName: string;
  countyId: string | null;
  countyName: string | null;
}

/**
 * Custom validation error with field-level details for wizard step mapping
 */
export class ClientOwnerSetupValidationError extends Error {
  public details: Record<string, Record<string, string>>;

  constructor(details: Record<string, Record<string, string>>) {
    const firstEntity = Object.keys(details)[0];
    // eslint-disable-next-line security/detect-object-injection -- firstEntity from Object.keys of typed Record
    const entityDetails = firstEntity ? details[firstEntity] : undefined;
    const firstField = entityDetails
      ? Object.keys(entityDetails)[0]
      : undefined;
    const firstMessage =
      entityDetails && firstField
        ? // eslint-disable-next-line security/detect-object-injection -- firstField from Object.keys
          entityDetails[firstField] || "Validation failed"
        : "Validation failed";

    super(firstMessage);
    this.name = "ClientOwnerSetupValidationError";
    this.details = details;
  }
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Client Owner Setup Service
 *
 * Provides atomic creation of complete client setup:
 * 1. User (CLIENT_OWNER)
 * 2. Company (owned by user)
 * 3. Store (first store for company)
 * 4. Store Login (CLIENT_USER for store management)
 * 5. Store Manager (STORE_MANAGER for desktop app - required)
 * 6. Terminals (optional)
 */
class ClientOwnerSetupService {
  // ===========================================================================
  // Address Validation Methods
  // ===========================================================================

  /**
   * Validate structured address and return denormalized state/county info
   * Used for both company and store addresses
   */
  private async validateStructuredAddress(
    address: USAddressInput,
    entityType: "company" | "store",
    tx: Prisma.TransactionClient,
  ): Promise<ValidatedStateInfo> {
    // Validate state exists and is active
    const state = await this.validateStateWithEntity(
      address.state_id,
      entityType,
      tx,
    );

    // Validate county if provided
    let countyName: string | null = null;
    if (address.county_id) {
      const county = await this.validateCountyWithEntity(
        address.county_id,
        address.state_id,
        entityType,
        tx,
      );
      countyName = county.name;
    }

    return {
      stateId: state.state_id,
      stateCode: state.code,
      stateName: state.name,
      countyId: address.county_id || null,
      countyName,
    };
  }

  /**
   * Validate state with entity-specific error messages
   */
  private async validateStateWithEntity(
    stateId: string,
    entityType: "company" | "store",
    tx: Prisma.TransactionClient,
  ): Promise<{ state_id: string; code: string; name: string }> {
    const state = await tx.uSState.findUnique({
      where: { state_id: stateId },
      select: { state_id: true, code: true, name: true, is_active: true },
    });

    const fieldPath =
      entityType === "company" ? "address.state_id" : "state_id";

    if (!state) {
      throw new ClientOwnerSetupValidationError({
        [entityType]: { [fieldPath]: `State with ID ${stateId} not found` },
      });
    }

    if (!state.is_active) {
      throw new ClientOwnerSetupValidationError({
        [entityType]: { [fieldPath]: `State ${state.code} is not active` },
      });
    }

    return state;
  }

  /**
   * Validate county with entity-specific error messages
   */
  private async validateCountyWithEntity(
    countyId: string,
    stateId: string,
    entityType: "company" | "store",
    tx: Prisma.TransactionClient,
  ): Promise<{ county_id: string; name: string }> {
    const county = await tx.uSCounty.findUnique({
      where: { county_id: countyId },
      select: { county_id: true, name: true, state_id: true, is_active: true },
    });

    const fieldPath =
      entityType === "company" ? "address.county_id" : "county_id";

    if (!county) {
      throw new ClientOwnerSetupValidationError({
        [entityType]: { [fieldPath]: `County with ID ${countyId} not found` },
      });
    }

    if (!county.is_active) {
      throw new ClientOwnerSetupValidationError({
        [entityType]: { [fieldPath]: `County ${county.name} is not active` },
      });
    }

    if (county.state_id !== stateId) {
      throw new ClientOwnerSetupValidationError({
        [entityType]: {
          [fieldPath]: `County ${county.name} does not belong to the selected state`,
        },
      });
    }

    return { county_id: county.county_id, name: county.name };
  }

  /**
   * Format structured address as a single string for backward compatibility
   */
  private formatAddressAsString(
    address: {
      address_line1: string;
      address_line2?: string | null;
      city: string;
      zip_code: string;
    },
    stateCode: string,
  ): string {
    const parts: string[] = [];

    parts.push(address.address_line1);
    if (address.address_line2) {
      parts.push(address.address_line2);
    }
    parts.push(address.city);
    parts.push(`${stateCode} ${address.zip_code}`);

    // Join with commas, limit to 500 chars for legacy field
    const result = parts.join(", ");
    return result.length > 500 ? result.substring(0, 500) : result;
  }

  /**
   * Validate IANA timezone format using Intl.DateTimeFormat
   * SEC-014: INPUT_VALIDATION - Validate against actual timezone database
   */
  private isValidIANATimezone(timezone: string): boolean {
    if (!timezone || timezone.length > 50) {
      return false;
    }

    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Email Validation Methods
  // ===========================================================================

  /**
   * Validate emails are unique and different from each other
   * Pre-transaction check for fast-fail on obvious errors
   */
  private async validateEmailsPreTransaction(
    userEmail: string,
    storeLoginEmail: string,
    storeManagerEmail: string,
  ): Promise<void> {
    // Emails already validated to be different by Zod schema
    // Double-check here for defense in depth
    if (userEmail === storeLoginEmail) {
      throw new ClientOwnerSetupValidationError({
        storeLogin: {
          email: "Store login email must be different from user email",
        },
      });
    }

    if (userEmail === storeManagerEmail) {
      throw new ClientOwnerSetupValidationError({
        storeManager: {
          email: "Store manager email must be different from user email",
        },
      });
    }

    if (storeLoginEmail === storeManagerEmail) {
      throw new ClientOwnerSetupValidationError({
        storeManager: {
          email: "Store manager email must be different from store login email",
        },
      });
    }

    // Check all emails don't already exist in database
    // DB-001: ORM_USAGE - Prisma query builder for safe queries
    const existingUsers = await prisma.user.findMany({
      where: {
        email: { in: [userEmail, storeLoginEmail, storeManagerEmail] },
      },
      select: { email: true },
    });

    const existingEmails = new Set(
      existingUsers.map((u) => u.email.toLowerCase()),
    );

    if (existingEmails.has(userEmail.toLowerCase())) {
      throw new ClientOwnerSetupValidationError({
        user: { email: "Email address is already in use" },
      });
    }

    if (existingEmails.has(storeLoginEmail.toLowerCase())) {
      throw new ClientOwnerSetupValidationError({
        storeLogin: { email: "Store login email is already in use" },
      });
    }

    if (existingEmails.has(storeManagerEmail.toLowerCase())) {
      throw new ClientOwnerSetupValidationError({
        storeManager: { email: "Store manager email is already in use" },
      });
    }
  }

  /**
   * Re-validate email uniqueness inside transaction (TOCTOU prevention)
   */
  private async validateEmailUniquenessInTransaction(
    email: string,
    entityType: "user" | "storeLogin" | "storeManager",
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const existing = await tx.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { user_id: true },
    });

    if (existing) {
      throw new ClientOwnerSetupValidationError({
        [entityType]: { email: "Email address is already in use" },
      });
    }
  }

  // ===========================================================================
  // Terminal Validation Methods
  // ===========================================================================

  /**
   * Validate terminal device IDs are globally unique
   */
  private async validateTerminalDeviceIds(
    deviceIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (deviceIds.length === 0) return;

    const existingTerminals = await tx.pOSTerminal.findMany({
      where: {
        device_id: { in: deviceIds },
        deleted_at: null,
      },
      select: { device_id: true },
    });

    if (existingTerminals.length > 0) {
      const existingIds = existingTerminals.map((t) => t.device_id).join(", ");
      throw new ClientOwnerSetupValidationError({
        terminals: { device_id: `Device ID(s) already exist: ${existingIds}` },
      });
    }
  }

  // ===========================================================================
  // Main Service Method
  // ===========================================================================

  /**
   * Create complete client owner setup atomically
   *
   * Transaction Flow:
   * 1. Pre-validate emails (fast-fail)
   * 2. Start Prisma transaction
   * 3. Re-validate emails inside transaction (TOCTOU prevention)
   * 4. Get required roles (CLIENT_OWNER, CLIENT_USER)
   * 5. Hash passwords (bcrypt, salt rounds 10)
   * 6. Validate geographic references (state_id, county_id)
   * 7. Create User with CLIENT_OWNER role
   * 8. Create Company linked to User
   * 9. Create Store linked to Company
   * 10. Create Store Login User with CLIENT_USER role
   * 11. Link Store Login to Store (store_login_user_id)
   * 12. Create terminals if provided
   * 13. Create audit logs
   * 14. Commit or rollback atomically
   *
   * @throws ClientOwnerSetupValidationError with field-level details on validation failure
   * @throws Error on duplicate email (conflict)
   * @throws Error if state_id/county_id invalid
   */
  async createClientOwnerSetup(
    data: ClientOwnerSetupRequest,
    auditContext: AuditContext,
  ): Promise<ClientOwnerSetupResponse["data"]> {
    // Pre-transaction validations (fast-fail for obvious errors)
    await this.validateEmailsPreTransaction(
      data.user.email,
      data.storeLogin.email,
      data.storeManager.email,
    );

    // Validate timezone format before transaction
    if (!this.isValidIANATimezone(data.store.timezone)) {
      throw new ClientOwnerSetupValidationError({
        store: {
          timezone: `Invalid timezone format. Must be IANA timezone (e.g., America/New_York)`,
        },
      });
    }

    // Execute atomic transaction
    // DB-006: TENANT_ISOLATION - All entities properly scoped
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // 1. Re-validate email uniqueness inside transaction (TOCTOU prevention)
        await this.validateEmailUniquenessInTransaction(
          data.user.email,
          "user",
          tx,
        );
        await this.validateEmailUniquenessInTransaction(
          data.storeLogin.email,
          "storeLogin",
          tx,
        );
        await this.validateEmailUniquenessInTransaction(
          data.storeManager.email,
          "storeManager",
          tx,
        );

        // 2. Get required roles
        const [clientOwnerRole, clientUserRole, storeManagerRole] =
          await Promise.all([
            tx.role.findFirst({ where: { code: "CLIENT_OWNER" } }),
            tx.role.findFirst({ where: { code: "CLIENT_USER" } }),
            tx.role.findFirst({ where: { code: "STORE_MANAGER" } }),
          ]);

        if (!clientOwnerRole) {
          throw new Error(
            "CLIENT_OWNER role not found in system. Contact administrator.",
          );
        }

        if (!clientUserRole) {
          throw new Error(
            "CLIENT_USER role not found in system. Contact administrator.",
          );
        }

        if (!storeManagerRole) {
          throw new Error(
            "STORE_MANAGER role not found in system. Contact administrator.",
          );
        }

        // 3. Hash passwords
        // SEC-001: PASSWORD_HASHING - bcrypt with salt rounds 10
        const [
          userPasswordHash,
          storeLoginPasswordHash,
          storeManagerPasswordHash,
        ] = await Promise.all([
          bcrypt.hash(data.user.password, 10),
          bcrypt.hash(data.storeLogin.password, 10),
          bcrypt.hash(data.storeManager.password, 10),
        ]);

        // 4. Validate company address geographic references
        const companyStateInfo = await this.validateStructuredAddress(
          data.company.address,
          "company",
          tx,
        );

        // 5. Validate store address geographic references
        const storeStateInfo = await this.validateStateWithEntity(
          data.store.state_id,
          "store",
          tx,
        );
        let storeCountyName: string | null = null;
        if (data.store.county_id) {
          const storeCounty = await this.validateCountyWithEntity(
            data.store.county_id,
            data.store.state_id,
            "store",
            tx,
          );
          storeCountyName = storeCounty.name;
        }

        // 6. Validate terminal device IDs if provided
        if (data.terminals && data.terminals.length > 0) {
          const deviceIds = data.terminals
            .map((t) => t.device_id)
            .filter(
              (id): id is string =>
                id !== null && id !== undefined && id !== "",
            );

          if (deviceIds.length > 0) {
            await this.validateTerminalDeviceIds(deviceIds, tx);
          }
        }

        // 7. Create CLIENT_OWNER User
        const user = await tx.user.create({
          data: {
            public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
            email: data.user.email.toLowerCase().trim(),
            name: data.user.name.trim(),
            password_hash: userPasswordHash,
            status: "ACTIVE",
            is_client_user: true,
          },
        });

        // 8. Create Company
        const legacyCompanyAddress = this.formatAddressAsString(
          data.company.address,
          companyStateInfo.stateCode,
        );

        const company = await tx.company.create({
          data: {
            public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
            name: data.company.name.trim(),
            // Legacy address field for backward compatibility
            address: legacyCompanyAddress,
            // Structured address fields
            address_line1: data.company.address.address_line1,
            address_line2: data.company.address.address_line2 || null,
            city: data.company.address.city,
            state_id: data.company.address.state_id,
            county_id: data.company.address.county_id || null,
            zip_code: data.company.address.zip_code,
            // Ownership
            owner_user_id: user.user_id,
            status: "ACTIVE",
          },
        });

        // 9. Assign CLIENT_OWNER role to user
        const userRole = await tx.userRole.create({
          data: {
            user_id: user.user_id,
            role_id: clientOwnerRole.role_id,
            company_id: company.company_id,
            assigned_by: auditContext.userId,
          },
        });

        // 10. Create Store
        const store = await tx.store.create({
          data: {
            public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
            company_id: company.company_id,
            name: data.store.name.trim(),
            timezone: data.store.timezone,
            status: data.store.status || "ACTIVE",
            // Structured address fields
            address_line1: data.store.address_line1,
            address_line2: data.store.address_line2 || null,
            city: data.store.city,
            state_id: data.store.state_id,
            county_id: data.store.county_id || null,
            zip_code: data.store.zip_code,
            // POS configuration
            pos_type:
              (data.store.pos_config?.pos_type as POSSystemType) ||
              "MANUAL_ENTRY",
            pos_connection_type:
              (data.store.pos_config
                ?.pos_connection_type as POSConnectionType) || "MANUAL",
            pos_connection_config: data.store.pos_config?.pos_connection_config
              ? (data.store.pos_config
                  .pos_connection_config as Prisma.InputJsonValue)
              : Prisma.DbNull,
          },
        });

        // 11. Create Store Login User
        const storeLoginUser = await tx.user.create({
          data: {
            public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
            email: data.storeLogin.email.toLowerCase().trim(),
            name: data.store.name.trim(), // Use store name as display name
            password_hash: storeLoginPasswordHash,
            status: "ACTIVE",
            is_client_user: true,
          },
        });

        // 12. Assign CLIENT_USER role to store login user
        await tx.userRole.create({
          data: {
            user_id: storeLoginUser.user_id,
            role_id: clientUserRole.role_id,
            company_id: company.company_id,
            store_id: store.store_id,
            assigned_by: auditContext.userId,
          },
        });

        // 13. Link store login to store
        await tx.store.update({
          where: { store_id: store.store_id },
          data: { store_login_user_id: storeLoginUser.user_id },
        });

        // 14. Create Store Manager User (required for desktop app)
        const storeManagerUser = await tx.user.create({
          data: {
            public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
            email: data.storeManager.email.toLowerCase().trim(),
            name: `${data.store.name.trim()} Manager`, // Use store name + Manager as display name
            password_hash: storeManagerPasswordHash,
            status: "ACTIVE",
            is_client_user: true,
          },
        });

        // 15. Assign STORE_MANAGER role to store manager user
        await tx.userRole.create({
          data: {
            user_id: storeManagerUser.user_id,
            role_id: storeManagerRole.role_id,
            company_id: company.company_id,
            store_id: store.store_id,
            assigned_by: auditContext.userId,
          },
        });

        // 16. Create terminals if provided
        const createdTerminals: Array<{
          pos_terminal_id: string;
          name: string;
          device_id: string | null;
          connection_type: string;
          pos_type: string;
        }> = [];

        if (data.terminals && data.terminals.length > 0) {
          for (const terminalData of data.terminals) {
            const terminal = await tx.pOSTerminal.create({
              data: {
                store_id: store.store_id,
                name: terminalData.name.trim(),
                device_id: terminalData.device_id || null,
                connection_type:
                  (terminalData.connection_type as POSConnectionType) ||
                  "MANUAL",
                pos_type:
                  (terminalData.pos_type as POSSystemType) || "MANUAL_ENTRY",
                connection_config: terminalData.connection_config
                  ? (terminalData.connection_config as Prisma.InputJsonValue)
                  : {},
                terminal_status: "ACTIVE",
                sync_status: "NEVER",
              },
            });

            createdTerminals.push({
              pos_terminal_id: terminal.pos_terminal_id,
              name: terminal.name,
              device_id: terminal.device_id,
              connection_type: terminal.connection_type,
              pos_type: terminal.pos_type,
            });
          }
        }

        // 17. Create comprehensive audit log
        // LM-002: MONITORING - Track all data changes
        await tx.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "CREATE",
            table_name: "client_owner_setup",
            record_id: user.user_id,
            new_values: {
              user_id: user.user_id,
              user_email: user.email,
              company_id: company.company_id,
              company_name: company.name,
              store_id: store.store_id,
              store_name: store.name,
              store_login_user_id: storeLoginUser.user_id,
              store_login_email: storeLoginUser.email,
              store_manager_user_id: storeManagerUser.user_id,
              store_manager_email: storeManagerUser.email,
              terminals_created: createdTerminals.length,
            } as Prisma.InputJsonValue,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason:
              `Client Owner setup created by ${auditContext.userEmail}: ` +
              `User(${user.email}), Company(${company.name}), ` +
              `Store(${store.name}), StoreLogin(${storeLoginUser.email}), ` +
              `StoreManager(${storeManagerUser.email})` +
              (createdTerminals.length > 0
                ? `, ${createdTerminals.length} terminal(s)`
                : ""),
          },
        });

        return {
          user,
          userRole,
          company,
          store,
          storeLoginUser,
          storeManagerUser,
          createdTerminals,
          companyStateInfo,
          storeStateInfo: {
            stateId: storeStateInfo.state_id,
            stateCode: storeStateInfo.code,
            stateName: storeStateInfo.name,
            countyId: data.store.county_id || null,
            countyName: storeCountyName,
          },
        };
      },
      {
        // Transaction options
        maxWait: 10000, // 10 seconds max wait to acquire
        timeout: 30000, // 30 seconds max execution
      },
    );

    // Format response with denormalized data for convenience
    return {
      user: {
        user_id: result.user.user_id,
        public_id: result.user.public_id,
        email: result.user.email,
        name: result.user.name,
        status: result.user.status,
        roles: [
          {
            user_role_id: result.userRole.user_role_id,
            role_code: "CLIENT_OWNER",
            scope: "COMPANY",
            company_id: result.company.company_id,
          },
        ],
        created_at: result.user.created_at.toISOString(),
      },
      company: {
        company_id: result.company.company_id,
        public_id: result.company.public_id,
        name: result.company.name,
        address_line1: result.company.address_line1!,
        address_line2: result.company.address_line2,
        city: result.company.city!,
        state_id: result.company.state_id!,
        state_code: result.companyStateInfo.stateCode,
        state_name: result.companyStateInfo.stateName,
        county_id: result.company.county_id,
        county_name: result.companyStateInfo.countyName,
        zip_code: result.company.zip_code!,
        status: result.company.status,
        created_at: result.company.created_at.toISOString(),
      },
      store: {
        store_id: result.store.store_id,
        public_id: result.store.public_id,
        name: result.store.name,
        timezone: result.store.timezone,
        address_line1: result.store.address_line1!,
        address_line2: result.store.address_line2,
        city: result.store.city!,
        state_id: result.store.state_id!,
        state_code: result.storeStateInfo.stateCode,
        state_name: result.storeStateInfo.stateName,
        county_id: result.store.county_id,
        county_name: result.storeStateInfo.countyName,
        zip_code: result.store.zip_code!,
        pos_type: result.store.pos_type,
        pos_connection_type: result.store.pos_connection_type,
        pos_connection_config: result.store.pos_connection_config as Record<
          string,
          unknown
        > | null,
        status: result.store.status,
        created_at: result.store.created_at.toISOString(),
      },
      storeLogin: {
        user_id: result.storeLoginUser.user_id,
        public_id: result.storeLoginUser.public_id,
        email: result.storeLoginUser.email,
        name: result.storeLoginUser.name,
        status: result.storeLoginUser.status,
        created_at: result.storeLoginUser.created_at.toISOString(),
      },
      storeManager: {
        user_id: result.storeManagerUser.user_id,
        public_id: result.storeManagerUser.public_id,
        email: result.storeManagerUser.email,
        name: result.storeManagerUser.name,
        status: result.storeManagerUser.status,
        created_at: result.storeManagerUser.created_at.toISOString(),
      },
      terminals:
        result.createdTerminals.length > 0
          ? result.createdTerminals
          : undefined,
    };
  }
}

// Export singleton instance
export const clientOwnerSetupService = new ClientOwnerSetupService();
