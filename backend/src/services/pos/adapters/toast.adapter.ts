/**
 * Toast POS Adapter
 *
 * Integration with Toast REST API for restaurants and c-store/restaurant hybrids.
 * Supports syncing of:
 * - Menu groups (mapped to departments)
 * - Payment types (mapped to tender types)
 * - Employees (mapped to cashiers)
 * - Tax rates
 * - Orders and transactions
 *
 * Toast is primarily a restaurant POS but is increasingly used in convenience
 * store/restaurant hybrid locations (gas stations with food service, etc.)
 *
 * @module services/pos/adapters/toast.adapter
 * @see https://doc.toasttab.com/
 * @security OAuth 2.0 client credentials flow with secure token handling
 * @see coding-rules: API-001 (Validation), API-003 (Error Handling), LM-001 (Logging)
 */

import type { POSSystemType } from "@prisma/client";
import {
  BaseRESTAdapter,
  RestApiError,
  type RateLimitConfig,
} from "./base-rest.adapter";
import type {
  POSConnectionConfig,
  POSConnectionTestResult,
  POSDepartment,
  POSTenderType,
  POSCashier,
  POSTaxRate,
  POSAdapterCapabilities,
  POSTransaction,
  POSTransactionLineItem,
  POSTransactionPayment,
} from "../../../types/pos-integration.types";

// ============================================================================
// Toast API Response Types
// ============================================================================

// Note: Toast error types reserved for future error handling implementation

/**
 * Toast restaurant (location)
 */
interface ToastRestaurant {
  guid: string;
  name: string;
  locationName?: string;
  locationCode?: string;
  description?: string;
  timeZone?: string;
  closeoutHour?: number;
  managementGroupGuid?: string;
  address?: {
    street1?: string;
    street2?: string;
    city?: string;
    stateCode?: string;
    zipCode?: string;
    country?: string;
    phone?: string;
  };
  deliveryEnabled?: boolean;
  onlineOrderingEnabled?: boolean;
  createdDate?: string;
  modifiedDate?: string;
  deletedDate?: string;
}

/**
 * Toast menu group (maps to department)
 */
interface ToastMenuGroup {
  guid: string;
  entityType: "MenuGroup";
  name: string;
  description?: string;
  visibility?: "ALL" | "POS_ONLY" | "TOAST_ONLINE_ORDERING" | "NONE";
  unitOfMeasure?: "NONE" | "LB" | "OZ" | "KG" | "G";
  inheritOptionGroups?: boolean;
  createdDate?: string;
  modifiedDate?: string;
  deletedDate?: string;
  ordinal?: number;
  parent?: {
    guid: string;
    entityType: string;
  };
  images?: ToastImage[];
}

/**
 * Toast image reference
 */
interface ToastImage {
  guid: string;
  url?: string;
}

/**
 * Toast payment type (tender)
 */
interface ToastPaymentType {
  guid: string;
  entityType: "AlternatePaymentType";
  name: string;
  isActive?: boolean;
  createdDate?: string;
  modifiedDate?: string;
  deletedDate?: string;
}

/**
 * Toast employee
 */
interface ToastEmployee {
  guid: string;
  entityType: "Employee";
  firstName: string;
  lastName?: string;
  chosenName?: string;
  email?: string;
  phoneNumber?: string;
  externalEmployeeId?: string;
  createdDate?: string;
  modifiedDate?: string;
  deletedDate?: string;
  disabled?: boolean;
  jobReferences?: ToastJobReference[];
  wageOverrides?: ToastWageOverride[];
}

/**
 * Toast job reference
 */
interface ToastJobReference {
  guid: string;
  entityType: string;
  externalId?: string;
}

/**
 * Toast wage override
 */
interface ToastWageOverride {
  guid: string;
  wage?: number;
}

/**
 * Toast tax rate
 */
interface ToastTaxRate {
  guid: string;
  entityType: "TaxRate";
  name: string;
  rate?: number;
  type?: "PERCENT" | "FIXED" | "NONE" | "TABLE";
  roundingType?: "HALF_UP" | "HALF_EVEN" | "ROUND_UP" | "ROUND_DOWN";
  taxTable?: ToastTaxTable;
  isDefault?: boolean;
  createdDate?: string;
  modifiedDate?: string;
  deletedDate?: string;
}

/**
 * Toast tax table
 */
interface ToastTaxTable {
  guid: string;
  name?: string;
}

/**
 * Toast order
 */
interface ToastOrder {
  guid: string;
  entityType: "Order";
  externalId?: string;
  revenueCenter?: {
    guid: string;
    entityType: string;
    name?: string;
  };
  server?: {
    guid: string;
    entityType: string;
    externalId?: string;
  };
  openedDate?: string;
  closedDate?: string;
  modifiedDate?: string;
  deletedDate?: string;
  promisedDate?: string;
  diningOption?: {
    guid: string;
    entityType: string;
    name?: string;
  };
  checks?: ToastCheck[];
  table?: {
    guid: string;
    entityType: string;
    name?: string;
  };
  requiredPrepTime?: string;
  estimatedFulfillmentDate?: string;
  numberOfGuests?: number;
  voided?: boolean;
  voidDate?: string;
  voidBusinessDate?: number;
  paidDate?: string;
  source?: "In Store" | "Online" | "API" | "Kiosk";
  duration?: number;
  businessDate?: number;
  displayNumber?: string;
}

/**
 * Toast check (ticket within order)
 */
interface ToastCheck {
  guid: string;
  entityType: "Check";
  displayNumber?: string;
  openedDate?: string;
  closedDate?: string;
  modifiedDate?: string;
  deletedDate?: string;
  selections?: ToastSelection[];
  payments?: ToastPayment[];
  customer?: {
    guid: string;
    entityType: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  tabName?: string;
  taxExempt?: boolean;
  amount?: number;
  taxAmount?: number;
  totalAmount?: number;
  tipAmount?: number;
  voided?: boolean;
}

/**
 * Toast selection (line item)
 */
interface ToastSelection {
  guid: string;
  entityType: "MenuItemSelection";
  itemGroup?: {
    guid: string;
    entityType: string;
    name?: string;
  };
  item?: {
    guid: string;
    entityType: string;
    name?: string;
  };
  displayName?: string;
  quantity?: number;
  unitOfMeasure?: string;
  selectionType?: "NONE" | "OPEN_ITEM" | "SPECIAL_REQUEST" | "PORTION";
  price?: number;
  preDiscountPrice?: number;
  tax?: number;
  voided?: boolean;
  voidDate?: string;
  voidReason?: {
    guid: string;
    entityType: string;
  };
  refundDetails?: {
    refundAmount?: number;
    refundDate?: string;
  };
  optionGroup?: {
    guid: string;
    entityType: string;
  };
  modifiers?: ToastModifier[];
  seatNumber?: number;
  createdDate?: string;
  modifiedDate?: string;
  deferredMenuItemGuid?: string;
  deferredMenuItemName?: string;
  salesCategory?: {
    guid: string;
    entityType: string;
    name?: string;
  };
  appliedTaxRates?: ToastAppliedTaxRate[];
}

/**
 * Toast modifier
 */
interface ToastModifier {
  guid: string;
  entityType: "MenuItemModifier";
  displayName?: string;
  quantity?: number;
  price?: number;
  modifierOption?: {
    guid: string;
    entityType: string;
    name?: string;
  };
}

/**
 * Toast applied tax rate
 */
interface ToastAppliedTaxRate {
  guid: string;
  entityType: string;
  rate?: number;
  name?: string;
  taxAmount?: number;
}

/**
 * Toast payment
 */
interface ToastPayment {
  guid: string;
  entityType: "Payment";
  externalId?: string;
  originalProcessingFee?: number;
  amount?: number;
  tipAmount?: number;
  amountTendered?: number;
  refundStatus?: "NONE" | "PARTIAL" | "FULL";
  type?:
    | "CASH"
    | "CREDIT"
    | "GIFTCARD"
    | "HOUSE_ACCOUNT"
    | "REWARDCARD"
    | "LEVELUP"
    | "OTHER"
    | "UNDETERMINED";
  voidInfo?: {
    voidUser?: {
      guid: string;
    };
    voidDate?: string;
    voidBusinessDate?: number;
    voidApprover?: {
      guid: string;
    };
  };
  cashDrawer?: {
    guid: string;
    entityType: string;
  };
  lastModifiedDevice?: {
    id: string;
  };
  checkGuid?: string;
  otherPayment?: {
    guid: string;
    entityType: string;
    name?: string;
  };
  cardType?:
    | "VISA"
    | "MASTERCARD"
    | "AMEX"
    | "DISCOVER"
    | "JCB"
    | "DINERS"
    | "CUP"
    | "UNKNOWN";
  last4Digits?: string;
  createdDate?: string;
  paidDate?: string;
  paidBusinessDate?: number;
  paymentStatus?:
    | "OPEN"
    | "PROCESSING"
    | "AUTHORIZED"
    | "CAPTURED"
    | "DENIED"
    | "VOIDED"
    | "CANCELLED";
}

// ============================================================================
// Toast Connection Configuration Extension
// ============================================================================

/**
 * Extended configuration for Toast connections
 */
export interface ToastConnectionConfig extends POSConnectionConfig {
  /** Toast restaurant GUID */
  restaurantGuid: string;
  /** Toast management group GUID (optional, for multi-location) */
  managementGroupGuid?: string;
  /** Toast environment */
  environment?: "sandbox" | "production";
  /** Toast API hostname override */
  apiHostname?: string;
}

// ============================================================================
// Toast Adapter Implementation
// ============================================================================

/**
 * Toast POS Adapter
 *
 * Implements full integration with Toast REST API including:
 * - OAuth 2.0 client credentials authentication
 * - Menu group synchronization (departments)
 * - Payment type mapping (tender types)
 * - Employee synchronization (cashiers)
 * - Tax rate synchronization
 * - Order/transaction retrieval
 *
 * Rate Limits (per Toast documentation):
 * - Standard: 100 requests per second per restaurant
 * - Bulk endpoints: Lower limits apply
 *
 * @example
 * ```typescript
 * const adapter = new ToastAdapter();
 * const config: ToastConnectionConfig = {
 *   host: 'toast-api-server',
 *   port: 443,
 *   useSsl: true,
 *   timeoutMs: 30000,
 *   authType: 'OAUTH2',
 *   credentials: {
 *     type: 'OAUTH2',
 *     clientId: 'your-client-id',
 *     clientSecret: 'your-client-secret',
 *     tokenUrl: 'https://toast-api-server/authentication/v1/authentication/login',
 *     accessToken: 'cached-token',
 *     tokenExpiresAt: new Date('2025-12-31'),
 *   },
 *   restaurantGuid: 'restaurant-guid',
 * };
 *
 * const departments = await adapter.syncDepartments(config);
 * ```
 */
export class ToastAdapter extends BaseRESTAdapter {
  readonly posType: POSSystemType = "TOAST_REST";
  readonly displayName = "Toast";

  /**
   * Base URL for Toast API
   */
  protected readonly baseUrl: string = "https://ws-api.toasttab.com";

  /**
   * Sandbox base URL
   * @internal Used for environment detection
   */
  protected readonly SANDBOX_BASE_URL = "https://ws-sandbox-api.toasttab.com";

  /**
   * Rate limit configuration for Toast API
   * Toast allows ~100 requests/second per restaurant
   */
  protected override readonly rateLimitConfig: RateLimitConfig = {
    maxRequests: 50, // Conservative limit for safety
    windowMs: 1000,
    queueRequests: true,
  };

  /**
   * Default page size for pagination
   */
  private readonly defaultPageSize = 100;

  /**
   * Maximum items to fetch per entity type
   */
  private readonly maxItemsPerSync = 10000;

  // ============================================================================
  // Capability Declaration
  // ============================================================================

  /**
   * Get adapter capabilities
   */
  override getCapabilities(): POSAdapterCapabilities {
    return {
      syncDepartments: true,
      syncTenderTypes: true,
      syncCashiers: true,
      syncTaxRates: true,
      syncProducts: true,
      realTimeTransactions: false,
      webhookSupport: true, // Toast supports webhooks
    };
  }

  // ============================================================================
  // Connection Test
  // ============================================================================

  /**
   * Test connection to Toast API
   *
   * Validates credentials by fetching restaurant information.
   *
   * @param config - Toast connection configuration
   * @returns Connection test result with restaurant details
   */
  async testConnection(
    config: POSConnectionConfig,
  ): Promise<POSConnectionTestResult> {
    const startTime = Date.now();
    const toastConfig = this.validateToastConfig(config);

    try {
      this.log("info", "Testing Toast connection", {
        restaurantGuid: toastConfig.restaurantGuid,
      });

      // Fetch restaurant info to validate connection
      const response = await this.get<ToastRestaurant>(
        config,
        `/restaurants/v1/restaurants/${toastConfig.restaurantGuid}`,
        {
          headers: {
            "Toast-Restaurant-External-ID": toastConfig.restaurantGuid,
          },
        },
      );

      const restaurant = response.data;

      return {
        success: true,
        message: `Connected to ${restaurant.name || "Toast Restaurant"}`,
        posVersion: "Toast API v1",
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      this.log("error", "Toast connection test failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        restaurantGuid: toastConfig.restaurantGuid,
      });

      return {
        success: false,
        message: this.getErrorMessage(error),
        latencyMs: Date.now() - startTime,
        errorCode: this.getErrorCode(error),
        errorDetails: error instanceof RestApiError ? error.details : undefined,
      };
    }
  }

  // ============================================================================
  // Department Sync (Menu Groups)
  // ============================================================================

  /**
   * Sync departments from Toast (menu groups)
   *
   * Toast uses menu groups to organize menu items.
   *
   * @param config - Toast connection configuration
   * @returns Array of standardized departments
   */
  async syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]> {
    const toastConfig = this.validateToastConfig(config);

    this.log("info", "Syncing departments (menu groups) from Toast", {
      restaurantGuid: toastConfig.restaurantGuid,
    });

    try {
      const menuGroups = await this.fetchMenuGroups(
        config,
        toastConfig.restaurantGuid,
      );

      const departments = menuGroups
        .filter((group) => !group.deletedDate)
        .map((group, index) => this.mapMenuGroupToDepartment(group, index));

      this.log("info", `Synced ${departments.length} departments from Toast`);
      return departments;
    } catch (error) {
      this.log("error", "Failed to sync departments from Toast", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync departments");
    }
  }

  /**
   * Fetch menu groups from Toast
   */
  private async fetchMenuGroups(
    config: POSConnectionConfig,
    restaurantGuid: string,
  ): Promise<ToastMenuGroup[]> {
    const allGroups: ToastMenuGroup[] = [];
    let pageToken: string | undefined;

    do {
      const queryParams: Record<string, string | number | boolean | undefined> =
        {
          pageSize: this.defaultPageSize,
        };

      if (pageToken) {
        queryParams.pageToken = pageToken;
      }

      const response = await this.get<
        | ToastMenuGroup[]
        | { menuGroups: ToastMenuGroup[]; nextPageToken?: string }
      >(config, `/menus/v2/menuGroups`, {
        headers: {
          "Toast-Restaurant-External-ID": restaurantGuid,
        },
        query: queryParams,
      });

      // Handle both array response and paginated response formats
      let groups: ToastMenuGroup[];
      if (Array.isArray(response.data)) {
        groups = response.data;
        pageToken = undefined;
      } else {
        groups = response.data.menuGroups || [];
        pageToken = response.data.nextPageToken;
      }

      allGroups.push(...groups);

      if (allGroups.length >= this.maxItemsPerSync) {
        break;
      }
    } while (pageToken);

    return allGroups;
  }

  /**
   * Map Toast menu group to standardized department
   */
  private mapMenuGroupToDepartment(
    menuGroup: ToastMenuGroup,
    index: number,
  ): POSDepartment {
    const name = menuGroup.name;

    return {
      posCode: menuGroup.guid,
      displayName: name,
      isTaxable: true, // Toast items handle their own taxes
      minimumAge: this.detectMinimumAge(name),
      isLottery: this.isLotteryCategory(name),
      isActive: !menuGroup.deletedDate && menuGroup.visibility !== "NONE",
      sortOrder: menuGroup.ordinal ?? index,
      description: menuGroup.description,
    };
  }

  /**
   * Detect minimum age requirement from menu group name
   */
  private detectMinimumAge(name: string): number | undefined {
    const upperName = name.toUpperCase();

    if (
      upperName.includes("ALCOHOL") ||
      upperName.includes("BEER") ||
      upperName.includes("WINE") ||
      upperName.includes("LIQUOR") ||
      upperName.includes("SPIRITS") ||
      upperName.includes("COCKTAIL") ||
      upperName.includes("BAR")
    ) {
      return 21;
    }

    if (
      upperName.includes("TOBACCO") ||
      upperName.includes("CIGARETTE") ||
      upperName.includes("CIGAR") ||
      upperName.includes("VAPE")
    ) {
      return 21;
    }

    return undefined;
  }

  /**
   * Check if menu group is lottery-related
   */
  private isLotteryCategory(name: string): boolean {
    const upperName = name.toUpperCase();
    return (
      upperName.includes("LOTTERY") ||
      upperName.includes("LOTTO") ||
      upperName.includes("SCRATCH")
    );
  }

  // ============================================================================
  // Tender Type Sync
  // ============================================================================

  /**
   * Sync tender types from Toast
   *
   * Returns a combination of standard Toast payment types and
   * custom alternate payment types configured for the restaurant.
   *
   * @param config - Toast connection configuration
   * @returns Array of standardized tender types
   */
  async syncTenderTypes(config: POSConnectionConfig): Promise<POSTenderType[]> {
    const toastConfig = this.validateToastConfig(config);

    this.log("info", "Syncing tender types from Toast", {
      restaurantGuid: toastConfig.restaurantGuid,
    });

    try {
      // Fetch custom alternate payment types
      const customPaymentTypes = await this.fetchAlternatePaymentTypes(
        config,
        toastConfig.restaurantGuid,
      );

      // Start with standard Toast payment types
      const standardTypes: POSTenderType[] = [
        {
          posCode: "CASH",
          displayName: "Cash",
          isCashEquivalent: true,
          isElectronic: false,
          affectsCashDrawer: true,
          requiresReference: false,
          isActive: true,
          sortOrder: 0,
        },
        {
          posCode: "CREDIT",
          displayName: "Credit Card",
          isCashEquivalent: false,
          isElectronic: true,
          affectsCashDrawer: false,
          requiresReference: true,
          isActive: true,
          sortOrder: 1,
        },
        {
          posCode: "GIFTCARD",
          displayName: "Gift Card",
          isCashEquivalent: false,
          isElectronic: true,
          affectsCashDrawer: false,
          requiresReference: true,
          isActive: true,
          sortOrder: 2,
        },
        {
          posCode: "HOUSE_ACCOUNT",
          displayName: "House Account",
          isCashEquivalent: false,
          isElectronic: false,
          affectsCashDrawer: false,
          requiresReference: true,
          isActive: true,
          sortOrder: 3,
        },
      ];

      // Map custom alternate payment types
      const customTypes = customPaymentTypes
        .filter((pt) => !pt.deletedDate && pt.isActive !== false)
        .map((pt, index) =>
          this.mapPaymentTypeToTender(pt, index + standardTypes.length),
        );

      const allTypes = [...standardTypes, ...customTypes];

      this.log("info", `Synced ${allTypes.length} tender types from Toast`);
      return allTypes;
    } catch (error) {
      this.log("error", "Failed to sync tender types from Toast", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync tender types");
    }
  }

  /**
   * Fetch alternate payment types from Toast
   */
  private async fetchAlternatePaymentTypes(
    config: POSConnectionConfig,
    restaurantGuid: string,
  ): Promise<ToastPaymentType[]> {
    try {
      const response = await this.get<ToastPaymentType[]>(
        config,
        `/config/v2/alternatePaymentTypes`,
        {
          headers: {
            "Toast-Restaurant-External-ID": restaurantGuid,
          },
        },
      );

      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      // If endpoint fails, return empty array (standard types still available)
      this.log("warn", "Could not fetch alternate payment types", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return [];
    }
  }

  /**
   * Map Toast payment type to standardized tender type
   */
  private mapPaymentTypeToTender(
    paymentType: ToastPaymentType,
    sortOrder: number,
  ): POSTenderType {
    const name = paymentType.name.toUpperCase();

    return {
      posCode: paymentType.guid,
      displayName: paymentType.name,
      isCashEquivalent: name.includes("CASH") || name.includes("CHECK"),
      isElectronic:
        name.includes("CARD") ||
        name.includes("MOBILE") ||
        name.includes("APP"),
      affectsCashDrawer: name.includes("CASH"),
      requiresReference: name.includes("CARD") || name.includes("CHECK"),
      isActive: paymentType.isActive !== false && !paymentType.deletedDate,
      sortOrder,
    };
  }

  // ============================================================================
  // Cashier Sync (Employees)
  // ============================================================================

  /**
   * Sync cashiers from Toast (employees)
   *
   * @param config - Toast connection configuration
   * @returns Array of standardized cashiers
   */
  async syncCashiers(config: POSConnectionConfig): Promise<POSCashier[]> {
    const toastConfig = this.validateToastConfig(config);

    this.log("info", "Syncing cashiers (employees) from Toast", {
      restaurantGuid: toastConfig.restaurantGuid,
    });

    try {
      const employees = await this.fetchEmployees(
        config,
        toastConfig.restaurantGuid,
      );

      const cashiers = employees
        .filter((emp) => !emp.deletedDate && !emp.disabled)
        .map((emp) => this.mapEmployeeToCashier(emp));

      this.log("info", `Synced ${cashiers.length} cashiers from Toast`);
      return cashiers;
    } catch (error) {
      this.log("error", "Failed to sync cashiers from Toast", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync cashiers");
    }
  }

  /**
   * Fetch employees from Toast
   */
  private async fetchEmployees(
    config: POSConnectionConfig,
    restaurantGuid: string,
  ): Promise<ToastEmployee[]> {
    const allEmployees: ToastEmployee[] = [];
    let pageToken: string | undefined;

    do {
      const queryParams: Record<string, string | number | boolean | undefined> =
        {
          pageSize: this.defaultPageSize,
        };

      if (pageToken) {
        queryParams.pageToken = pageToken;
      }

      const response = await this.get<
        ToastEmployee[] | { employees: ToastEmployee[]; nextPageToken?: string }
      >(config, `/labor/v1/employees`, {
        headers: {
          "Toast-Restaurant-External-ID": restaurantGuid,
        },
        query: queryParams,
      });

      // Handle both array response and paginated response formats
      let employees: ToastEmployee[];
      if (Array.isArray(response.data)) {
        employees = response.data;
        pageToken = undefined;
      } else {
        employees = response.data.employees || [];
        pageToken = response.data.nextPageToken;
      }

      allEmployees.push(...employees);

      if (allEmployees.length >= this.maxItemsPerSync) {
        break;
      }
    } while (pageToken);

    return allEmployees;
  }

  /**
   * Map Toast employee to standardized cashier
   */
  private mapEmployeeToCashier(employee: ToastEmployee): POSCashier {
    return {
      posCode: employee.guid,
      firstName: employee.chosenName || employee.firstName,
      lastName: employee.lastName || "",
      isActive: !employee.disabled && !employee.deletedDate,
      employeeId: employee.externalEmployeeId,
    };
  }

  // ============================================================================
  // Tax Rate Sync
  // ============================================================================

  /**
   * Sync tax rates from Toast
   *
   * @param config - Toast connection configuration
   * @returns Array of standardized tax rates
   */
  async syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]> {
    const toastConfig = this.validateToastConfig(config);

    this.log("info", "Syncing tax rates from Toast", {
      restaurantGuid: toastConfig.restaurantGuid,
    });

    try {
      const taxRates = await this.fetchTaxRates(
        config,
        toastConfig.restaurantGuid,
      );

      const mappedRates = taxRates
        .filter((rate) => !rate.deletedDate)
        .map((rate) => this.mapToastTaxRate(rate));

      this.log("info", `Synced ${mappedRates.length} tax rates from Toast`);
      return mappedRates;
    } catch (error) {
      this.log("error", "Failed to sync tax rates from Toast", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync tax rates");
    }
  }

  /**
   * Fetch tax rates from Toast
   */
  private async fetchTaxRates(
    config: POSConnectionConfig,
    restaurantGuid: string,
  ): Promise<ToastTaxRate[]> {
    const response = await this.get<ToastTaxRate[]>(
      config,
      `/config/v2/taxRates`,
      {
        headers: {
          "Toast-Restaurant-External-ID": restaurantGuid,
        },
      },
    );

    return Array.isArray(response.data) ? response.data : [];
  }

  /**
   * Map Toast tax rate to standardized tax rate
   */
  private mapToastTaxRate(taxRate: ToastTaxRate): POSTaxRate {
    // Toast stores rate as decimal percentage (e.g., 8.25 for 8.25%)
    const rate = (taxRate.rate ?? 0) / 100;

    return {
      posCode: taxRate.guid,
      displayName: taxRate.name,
      rate: rate,
      isActive: !taxRate.deletedDate,
      description: taxRate.type === "FIXED" ? "Fixed Amount Tax" : undefined,
    };
  }

  // ============================================================================
  // Transaction Retrieval
  // ============================================================================

  /**
   * Fetch orders/transactions from Toast
   *
   * @param config - Toast connection configuration
   * @param options - Query options
   * @returns Array of standardized transactions
   */
  async fetchTransactions(
    config: POSConnectionConfig,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      closedOnly?: boolean;
    } = {},
  ): Promise<POSTransaction[]> {
    const toastConfig = this.validateToastConfig(config);
    const { startDate, endDate, limit = 1000, closedOnly = true } = options;

    this.log("info", "Fetching transactions from Toast", {
      restaurantGuid: toastConfig.restaurantGuid,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      limit,
    });

    try {
      const orders = await this.fetchOrders(
        config,
        toastConfig.restaurantGuid,
        startDate,
        endDate,
        limit,
      );

      const transactions = orders
        .filter((order) => {
          if (order.voided) return false;
          if (closedOnly && !order.closedDate) return false;
          return true;
        })
        .map((order) => this.mapOrderToTransaction(order));

      this.log(
        "info",
        `Fetched ${transactions.length} transactions from Toast`,
      );
      return transactions;
    } catch (error) {
      this.log("error", "Failed to fetch transactions from Toast", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to fetch transactions");
    }
  }

  /**
   * Fetch orders from Toast
   */
  private async fetchOrders(
    config: POSConnectionConfig,
    restaurantGuid: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 1000,
  ): Promise<ToastOrder[]> {
    const allOrders: ToastOrder[] = [];
    let pageToken: string | undefined;

    // Build query parameters
    const baseQuery: Record<string, string | number | boolean | undefined> = {
      pageSize: Math.min(this.defaultPageSize, limit),
    };

    if (startDate) {
      baseQuery.startDate = startDate.toISOString();
    }
    if (endDate) {
      baseQuery.endDate = endDate.toISOString();
    }

    do {
      const queryParams = { ...baseQuery };
      if (pageToken) {
        queryParams.pageToken = pageToken;
      }

      const response = await this.get<
        ToastOrder[] | { orders: ToastOrder[]; nextPageToken?: string }
      >(config, `/orders/v2/orders`, {
        headers: {
          "Toast-Restaurant-External-ID": restaurantGuid,
        },
        query: queryParams,
      });

      // Handle both array response and paginated response formats
      let orders: ToastOrder[];
      if (Array.isArray(response.data)) {
        orders = response.data;
        pageToken = undefined;
      } else {
        orders = response.data.orders || [];
        pageToken = response.data.nextPageToken;
      }

      allOrders.push(...orders);

      if (allOrders.length >= limit) {
        break;
      }
    } while (pageToken);

    return allOrders.slice(0, limit);
  }

  /**
   * Map Toast order to standardized transaction
   */
  private mapOrderToTransaction(order: ToastOrder): POSTransaction {
    // Aggregate line items and payments from all checks
    const lineItems: POSTransactionLineItem[] = [];
    const payments: POSTransactionPayment[] = [];
    let subtotal = 0;
    let tax = 0;
    let total = 0;

    for (const check of order.checks || []) {
      if (check.voided) continue;

      // Map selections to line items
      for (const selection of check.selections || []) {
        if (selection.voided) continue;
        lineItems.push(this.mapSelectionToLineItem(selection));
      }

      // Map payments
      for (const payment of check.payments || []) {
        if (
          payment.paymentStatus === "VOIDED" ||
          payment.paymentStatus === "CANCELLED"
        )
          continue;
        payments.push(this.mapPaymentToTender(payment));
      }

      // Accumulate totals
      subtotal += (check.amount ?? 0) - (check.taxAmount ?? 0);
      tax += check.taxAmount ?? 0;
      total += check.totalAmount ?? 0;
    }

    return {
      posTransactionId: order.guid,
      timestamp: new Date(order.closedDate || order.openedDate || Date.now()),
      cashierCode: order.server?.guid || "UNKNOWN",
      terminalId: order.revenueCenter?.name || order.displayNumber,
      subtotal: subtotal / 100, // Toast stores in cents
      tax: tax / 100,
      total: total / 100,
      lineItems,
      payments,
    };
  }

  /**
   * Map Toast selection to line item
   */
  private mapSelectionToLineItem(
    selection: ToastSelection,
  ): POSTransactionLineItem {
    const quantity = selection.quantity ?? 1;
    const price = selection.price ?? 0;
    const taxAmount = selection.tax ?? 0;
    const lineTotal = price * quantity;

    return {
      departmentCode:
        selection.itemGroup?.guid ||
        selection.salesCategory?.guid ||
        "UNCATEGORIZED",
      sku: selection.item?.guid,
      description:
        selection.displayName || selection.item?.name || "Unknown Item",
      quantity,
      unitPrice: price / 100, // Toast stores in cents
      taxAmount: taxAmount / 100,
      lineTotal: lineTotal / 100,
    };
  }

  /**
   * Map Toast payment to tender
   */
  private mapPaymentToTender(payment: ToastPayment): POSTransactionPayment {
    const amount = ((payment.amount ?? 0) + (payment.tipAmount ?? 0)) / 100;

    // Build reference from card details if available
    let reference: string | undefined;
    if (payment.last4Digits) {
      reference = `${payment.cardType || "CARD"} ****${payment.last4Digits}`;
    } else if (payment.externalId) {
      reference = payment.externalId;
    }

    // Map Toast payment type to our tender code
    let tenderCode: string = payment.type || "OTHER";
    if (payment.otherPayment?.guid) {
      tenderCode = payment.otherPayment.guid;
    }

    return {
      tenderCode,
      amount,
      reference,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Validate and cast config to Toast-specific config
   */
  private validateToastConfig(
    config: POSConnectionConfig,
  ): ToastConnectionConfig {
    const toastConfig = config as ToastConnectionConfig;

    if (!toastConfig.restaurantGuid) {
      throw new RestApiError(
        "Toast restaurantGuid is required",
        400,
        "MISSING_RESTAURANT_GUID",
        undefined,
        false,
      );
    }

    return toastConfig;
  }

  /**
   * Get error message from error object
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof RestApiError) {
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "Unknown error occurred";
  }

  /**
   * Get error code from error object
   */
  private getErrorCode(error: unknown): string {
    if (error instanceof RestApiError) {
      return error.errorCode;
    }
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("unauthorized") || message.includes("401")) {
        return "AUTH_ERROR";
      }
      if (message.includes("forbidden") || message.includes("403")) {
        return "FORBIDDEN";
      }
      if (message.includes("not found") || message.includes("404")) {
        return "NOT_FOUND";
      }
      if (message.includes("timeout")) {
        return "TIMEOUT";
      }
    }
    return "UNKNOWN_ERROR";
  }

  /**
   * Wrap error with context
   */
  private wrapError(error: unknown, context: string): Error {
    if (error instanceof RestApiError) {
      return new RestApiError(
        `${context}: ${error.message}`,
        error.statusCode,
        error.errorCode,
        error.details,
        error.retryable,
      );
    }
    if (error instanceof Error) {
      return new Error(`${context}: ${error.message}`);
    }
    return new Error(`${context}: Unknown error`);
  }
}
