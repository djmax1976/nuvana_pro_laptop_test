/**
 * Clover POS Adapter
 *
 * Integration with Clover REST API for convenience stores and retail.
 * Supports syncing of:
 * - Categories (mapped to departments)
 * - Tender types
 * - Employees (mapped to cashiers)
 * - Tax rates
 * - Orders and transactions
 *
 * @module services/pos/adapters/clover.adapter
 * @see https://docs.clover.com/reference/api-reference-overview
 * @security OAuth 2.0 authentication with secure token handling
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
// Clover API Response Types
// ============================================================================

/**
 * Clover API pagination wrapper
 */
interface CloverPaginatedResponse<T> {
  elements: T[];
  href?: string;
}

/**
 * Clover merchant information
 */
interface CloverMerchant {
  id: string;
  name: string;
  address?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  phoneNumber?: string;
  website?: string;
  createdTime?: number;
  modifiedTime?: number;
  owner?: {
    id: string;
    name?: string;
    email?: string;
  };
}

/**
 * Clover category (maps to department)
 */
interface CloverCategory {
  id: string;
  name: string;
  sortOrder?: number;
  deleted?: boolean;
  modifiedTime?: number;
  items?: {
    elements?: CloverItem[];
  };
}

/**
 * Clover item (product)
 */
interface CloverItem {
  id: string;
  name: string;
  price: number;
  priceType?: "FIXED" | "VARIABLE" | "PER_UNIT";
  defaultTaxRates?: boolean;
  unitName?: string;
  sku?: string;
  code?: string;
  hidden?: boolean;
  isRevenue?: boolean;
  modifiedTime?: number;
  deleted?: boolean;
  taxRates?: {
    elements?: CloverTaxRate[];
  };
  categories?: {
    elements?: CloverCategory[];
  };
}

/**
 * Clover tender type
 */
interface CloverTender {
  id: string;
  label: string;
  labelKey?: string;
  enabled?: boolean;
  visible?: boolean;
  opensCashDrawer?: boolean;
  supportsTipping?: boolean;
  editable?: boolean;
  instructions?: string;
}

/**
 * Clover employee (maps to cashier)
 */
interface CloverEmployee {
  id: string;
  name: string;
  nickname?: string;
  email?: string;
  pin?: string;
  role?: "ADMIN" | "MANAGER" | "EMPLOYEE";
  customId?: string;
  inviteSent?: boolean;
  claimedTime?: number;
  deletedTime?: number;
  isOwner?: boolean;
  orders?: {
    elements?: CloverOrder[];
  };
}

/**
 * Clover tax rate
 */
interface CloverTaxRate {
  id: string;
  name: string;
  rate: number; // Rate as integer (e.g., 825000 = 8.25%)
  isDefault?: boolean;
  taxType?: "VAT" | "SALES_TAX";
  deletedTime?: number;
  modifiedTime?: number;
  taxAmount?: number;
}

/**
 * Clover order (transaction)
 */
interface CloverOrder {
  id: string;
  currency?: string;
  employee?: {
    id: string;
    name?: string;
  };
  total?: number;
  taxRemoved?: boolean;
  isVat?: boolean;
  state?: "OPEN" | "LOCKED" | "PAID";
  manualTransaction?: boolean;
  groupLineItems?: boolean;
  testMode?: boolean;
  payType?: "SPLIT_GUEST" | "SPLIT_ITEM" | "SPLIT_CUSTOM" | "FULL";
  createdTime?: number;
  modifiedTime?: number;
  deletedTime?: number;
  clientCreatedTime?: number;
  device?: {
    id: string;
  };
  lineItems?: {
    elements?: CloverLineItem[];
  };
  payments?: {
    elements?: CloverPayment[];
  };
}

/**
 * Clover line item
 */
interface CloverLineItem {
  id: string;
  item?: {
    id: string;
    name?: string;
  };
  name: string;
  price: number;
  unitQty?: number;
  unitName?: string;
  exchanged?: boolean;
  refunded?: boolean;
  isRevenue?: boolean;
  taxRates?: {
    elements?: CloverTaxRate[];
  };
  createdTime?: number;
  orderClientCreatedTime?: number;
}

/**
 * Clover payment
 */
interface CloverPayment {
  id: string;
  order?: {
    id: string;
  };
  tender?: {
    id: string;
    label?: string;
    labelKey?: string;
  };
  amount: number;
  tipAmount?: number;
  taxAmount?: number;
  cashTendered?: number;
  externalPaymentId?: string;
  employee?: {
    id: string;
    name?: string;
  };
  createdTime?: number;
  modifiedTime?: number;
  result?: "SUCCESS" | "FAIL" | "INITIATED" | "VOIDED" | "PENDING" | "AUTH";
  cardTransaction?: {
    cardType?: string;
    last4?: string;
    authCode?: string;
    referenceId?: string;
    transactionNo?: string;
  };
}

// ============================================================================
// Clover Connection Configuration Extension
// ============================================================================

/**
 * Extended configuration for Clover connections
 */
export interface CloverConnectionConfig extends POSConnectionConfig {
  /** Clover merchant ID */
  merchantId: string;
  /** Clover environment (sandbox or production) */
  environment?: "sandbox" | "production";
  /** API version to use */
  apiVersion?: string;
}

// ============================================================================
// Clover Adapter Implementation
// ============================================================================

/**
 * Clover POS Adapter
 *
 * Implements full integration with Clover REST API including:
 * - OAuth 2.0 authentication
 * - Category/department synchronization
 * - Tender type synchronization
 * - Employee/cashier synchronization
 * - Tax rate synchronization
 * - Transaction retrieval
 *
 * Rate Limits (per Clover documentation):
 * - 16 requests per second per token
 * - 50,000 requests per day per app
 *
 * @example
 * ```typescript
 * const adapter = new CloverAdapter();
 * const config: CloverConnectionConfig = {
 *   host: 'api.clover.com',
 *   port: 443,
 *   useSsl: true,
 *   timeoutMs: 30000,
 *   authType: 'OAUTH2',
 *   credentials: {
 *     type: 'OAUTH2',
 *     clientId: 'your-client-id',
 *     clientSecret: 'your-client-secret',
 *     tokenUrl: 'https://api.clover.com/oauth/token',
 *     accessToken: 'cached-token',
 *     tokenExpiresAt: new Date('2025-12-31'),
 *   },
 *   merchantId: 'merchant-uuid',
 * };
 *
 * const departments = await adapter.syncDepartments(config);
 * ```
 */
export class CloverAdapter extends BaseRESTAdapter {
  readonly posType: POSSystemType = "CLOVER_REST";
  readonly displayName = "Clover";

  /**
   * Base URL for Clover API
   * Set dynamically based on environment
   */
  protected readonly baseUrl: string = "https://api.clover.com/v3";

  /**
   * Sandbox base URL
   * @internal Used for environment detection
   */
  protected readonly SANDBOX_BASE_URL = "https://sandbox.dev.clover.com/v3";

  /**
   * Production base URL
   * @internal Used for environment detection
   */
  protected readonly PRODUCTION_BASE_URL = "https://api.clover.com/v3";

  /**
   * Rate limit configuration for Clover API
   * Clover allows 16 requests/second, we use 15 for safety margin
   */
  protected override readonly rateLimitConfig: RateLimitConfig = {
    maxRequests: 15,
    windowMs: 1000, // 1 second window
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
      syncProducts: true, // Clover supports item sync
      realTimeTransactions: false, // Would require webhooks
      webhookSupport: true, // Clover supports webhooks
    };
  }

  // ============================================================================
  // Connection Test
  // ============================================================================

  /**
   * Test connection to Clover API
   *
   * Validates credentials by fetching merchant information.
   *
   * @param config - Clover connection configuration
   * @returns Connection test result with merchant details
   */
  async testConnection(
    config: POSConnectionConfig,
  ): Promise<POSConnectionTestResult> {
    const startTime = Date.now();
    const cloverConfig = this.validateCloverConfig(config);

    try {
      this.log("info", "Testing Clover connection", {
        merchantId: cloverConfig.merchantId,
      });

      // Fetch merchant info to validate connection
      const response = await this.get<CloverMerchant>(
        config,
        `/merchants/${cloverConfig.merchantId}`,
      );

      const merchant = response.data;

      return {
        success: true,
        message: `Connected to ${merchant.name}`,
        posVersion: "Clover REST API v3",
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      this.log("error", "Clover connection test failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        merchantId: cloverConfig.merchantId,
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
  // Department Sync (Categories)
  // ============================================================================

  /**
   * Sync departments from Clover (categories)
   *
   * Clover uses "categories" to organize items, which we map to departments.
   *
   * @param config - Clover connection configuration
   * @returns Array of standardized departments
   */
  async syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]> {
    const cloverConfig = this.validateCloverConfig(config);

    this.log("info", "Syncing departments (categories) from Clover", {
      merchantId: cloverConfig.merchantId,
    });

    try {
      const categories = await this.paginateAll<CloverCategory>(
        config,
        `/merchants/${cloverConfig.merchantId}/categories`,
        {
          pageSize: this.defaultPageSize,
          maxItems: this.maxItemsPerSync,
          extractItems: (data) =>
            (data as CloverPaginatedResponse<CloverCategory>).elements || [],
          hasMore: (data, _fetched) => {
            const response = data as CloverPaginatedResponse<CloverCategory>;
            return (response.elements?.length || 0) >= this.defaultPageSize;
          },
          query: {
            expand: "items",
          },
        },
      );

      const departments = categories
        .filter((cat) => !cat.deleted)
        .map((cat, index) => this.mapCategoryToDepartment(cat, index));

      this.log("info", `Synced ${departments.length} departments from Clover`);
      return departments;
    } catch (error) {
      this.log("error", "Failed to sync departments from Clover", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync departments");
    }
  }

  /**
   * Map Clover category to standardized department
   */
  private mapCategoryToDepartment(
    category: CloverCategory,
    index: number,
  ): POSDepartment {
    return {
      posCode: category.id,
      displayName: category.name,
      isTaxable: this.isCategoryTaxable(category),
      minimumAge: this.detectMinimumAge(category.name),
      isLottery: this.isLotteryCategory(category.name),
      isActive: !category.deleted,
      sortOrder: category.sortOrder ?? index,
      description: undefined,
    };
  }

  /**
   * Determine if a category contains taxable items
   */
  private isCategoryTaxable(category: CloverCategory): boolean {
    // Check if any items in the category have tax rates
    const items = category.items?.elements || [];
    if (items.length === 0) {
      // Default to taxable if no items to check
      return true;
    }

    // If majority of items have tax rates, consider category taxable
    const taxableItems = items.filter(
      (item) =>
        item.defaultTaxRates !== false &&
        (item.taxRates?.elements?.length ?? 0) > 0,
    );
    return taxableItems.length >= items.length / 2;
  }

  /**
   * Detect minimum age requirement from category name
   */
  private detectMinimumAge(name: string): number | undefined {
    const upperName = name.toUpperCase();

    // Alcohol-related categories
    if (
      upperName.includes("ALCOHOL") ||
      upperName.includes("BEER") ||
      upperName.includes("WINE") ||
      upperName.includes("LIQUOR") ||
      upperName.includes("SPIRITS")
    ) {
      return 21;
    }

    // Tobacco-related categories
    if (
      upperName.includes("TOBACCO") ||
      upperName.includes("CIGARETTE") ||
      upperName.includes("CIGAR") ||
      upperName.includes("VAPE") ||
      upperName.includes("E-CIG")
    ) {
      return 21;
    }

    return undefined;
  }

  /**
   * Check if category is lottery-related
   */
  private isLotteryCategory(name: string): boolean {
    const upperName = name.toUpperCase();
    return (
      upperName.includes("LOTTERY") ||
      upperName.includes("LOTTO") ||
      upperName.includes("SCRATCH") ||
      upperName.includes("POWERBALL") ||
      upperName.includes("MEGA MILLIONS")
    );
  }

  // ============================================================================
  // Tender Type Sync
  // ============================================================================

  /**
   * Sync tender types from Clover
   *
   * @param config - Clover connection configuration
   * @returns Array of standardized tender types
   */
  async syncTenderTypes(config: POSConnectionConfig): Promise<POSTenderType[]> {
    const cloverConfig = this.validateCloverConfig(config);

    this.log("info", "Syncing tender types from Clover", {
      merchantId: cloverConfig.merchantId,
    });

    try {
      const response = await this.get<CloverPaginatedResponse<CloverTender>>(
        config,
        `/merchants/${cloverConfig.merchantId}/tenders`,
      );

      const tenders = response.data.elements || [];

      const tenderTypes = tenders
        .filter((tender) => tender.enabled !== false)
        .map((tender, index) => this.mapCloverTender(tender, index));

      this.log("info", `Synced ${tenderTypes.length} tender types from Clover`);
      return tenderTypes;
    } catch (error) {
      this.log("error", "Failed to sync tender types from Clover", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync tender types");
    }
  }

  /**
   * Map Clover tender to standardized tender type
   */
  private mapCloverTender(tender: CloverTender, index: number): POSTenderType {
    const labelKey = tender.labelKey?.toUpperCase() || "";
    const label = tender.label.toUpperCase();

    // Determine tender characteristics based on label
    const isCash = labelKey === "CASH" || label.includes("CASH");
    const isCard =
      labelKey.includes("CREDIT") ||
      labelKey.includes("DEBIT") ||
      label.includes("CARD") ||
      label.includes("CREDIT") ||
      label.includes("DEBIT");
    const isCheck = labelKey === "CHECK" || label.includes("CHECK");
    const isGiftCard = labelKey.includes("GIFT") || label.includes("GIFT CARD");

    return {
      posCode: tender.id,
      displayName: tender.label,
      isCashEquivalent: isCash || isCheck,
      isElectronic: isCard || isGiftCard,
      affectsCashDrawer: tender.opensCashDrawer ?? isCash,
      requiresReference: isCard || isCheck,
      isActive: tender.enabled !== false && tender.visible !== false,
      sortOrder: index,
      description: tender.instructions,
    };
  }

  // ============================================================================
  // Cashier Sync (Employees)
  // ============================================================================

  /**
   * Sync cashiers from Clover (employees)
   *
   * @param config - Clover connection configuration
   * @returns Array of standardized cashiers
   */
  async syncCashiers(config: POSConnectionConfig): Promise<POSCashier[]> {
    const cloverConfig = this.validateCloverConfig(config);

    this.log("info", "Syncing cashiers (employees) from Clover", {
      merchantId: cloverConfig.merchantId,
    });

    try {
      const employees = await this.paginateAll<CloverEmployee>(
        config,
        `/merchants/${cloverConfig.merchantId}/employees`,
        {
          pageSize: this.defaultPageSize,
          maxItems: this.maxItemsPerSync,
          extractItems: (data) =>
            (data as CloverPaginatedResponse<CloverEmployee>).elements || [],
          hasMore: (data) => {
            const response = data as CloverPaginatedResponse<CloverEmployee>;
            return (response.elements?.length || 0) >= this.defaultPageSize;
          },
        },
      );

      const cashiers = employees
        .filter((emp) => !emp.deletedTime)
        .map((emp) => this.mapEmployeeToCashier(emp));

      this.log("info", `Synced ${cashiers.length} cashiers from Clover`);
      return cashiers;
    } catch (error) {
      this.log("error", "Failed to sync cashiers from Clover", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync cashiers");
    }
  }

  /**
   * Map Clover employee to standardized cashier
   */
  private mapEmployeeToCashier(employee: CloverEmployee): POSCashier {
    // Parse name into first/last
    const nameParts = (employee.name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    return {
      posCode: employee.id,
      firstName: firstName || employee.nickname || "Unknown",
      lastName: lastName,
      isActive: !employee.deletedTime,
      employeeId: employee.customId,
      // Note: We don't sync PIN hashes for security reasons
    };
  }

  // ============================================================================
  // Tax Rate Sync
  // ============================================================================

  /**
   * Sync tax rates from Clover
   *
   * @param config - Clover connection configuration
   * @returns Array of standardized tax rates
   */
  async syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]> {
    const cloverConfig = this.validateCloverConfig(config);

    this.log("info", "Syncing tax rates from Clover", {
      merchantId: cloverConfig.merchantId,
    });

    try {
      const response = await this.get<CloverPaginatedResponse<CloverTaxRate>>(
        config,
        `/merchants/${cloverConfig.merchantId}/tax_rates`,
      );

      const taxRates = response.data.elements || [];

      const mappedRates = taxRates
        .filter((rate) => !rate.deletedTime)
        .map((rate) => this.mapCloverTaxRate(rate));

      this.log("info", `Synced ${mappedRates.length} tax rates from Clover`);
      return mappedRates;
    } catch (error) {
      this.log("error", "Failed to sync tax rates from Clover", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync tax rates");
    }
  }

  /**
   * Map Clover tax rate to standardized tax rate
   *
   * Clover stores rates as integers where 1000000 = 100%
   * So 825000 = 8.25%
   */
  private mapCloverTaxRate(taxRate: CloverTaxRate): POSTaxRate {
    // Convert Clover rate (integer, 1000000 = 100%) to decimal (0.0825 = 8.25%)
    const rate = taxRate.rate / 10000000;

    return {
      posCode: taxRate.id,
      displayName: taxRate.name,
      rate: rate,
      isActive: !taxRate.deletedTime,
      description: taxRate.taxType,
    };
  }

  // ============================================================================
  // Transaction Retrieval
  // ============================================================================

  /**
   * Fetch orders/transactions from Clover
   *
   * @param config - Clover connection configuration
   * @param options - Query options
   * @returns Array of standardized transactions
   */
  async fetchTransactions(
    config: POSConnectionConfig,
    options: {
      /** Start date for transaction query */
      startDate?: Date;
      /** End date for transaction query */
      endDate?: Date;
      /** Maximum transactions to fetch */
      limit?: number;
      /** Only fetch paid orders */
      paidOnly?: boolean;
    } = {},
  ): Promise<POSTransaction[]> {
    const cloverConfig = this.validateCloverConfig(config);
    const { startDate, endDate, limit = 1000, paidOnly = true } = options;

    this.log("info", "Fetching transactions from Clover", {
      merchantId: cloverConfig.merchantId,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      limit,
    });

    try {
      // Build filter query
      const filters: string[] = [];

      if (startDate) {
        filters.push(`createdTime>=${startDate.getTime()}`);
      }
      if (endDate) {
        filters.push(`createdTime<=${endDate.getTime()}`);
      }
      if (paidOnly) {
        filters.push("state=paid");
      }

      const orders = await this.paginateAll<CloverOrder>(
        config,
        `/merchants/${cloverConfig.merchantId}/orders`,
        {
          pageSize: Math.min(100, limit),
          maxItems: limit,
          extractItems: (data) =>
            (data as CloverPaginatedResponse<CloverOrder>).elements || [],
          hasMore: (data, fetched) => {
            const response = data as CloverPaginatedResponse<CloverOrder>;
            return (
              fetched < limit &&
              (response.elements?.length || 0) >= this.defaultPageSize
            );
          },
          query: {
            expand: "lineItems,payments",
            filter: filters.length > 0 ? filters.join("&filter=") : undefined,
            orderBy: "createdTime DESC",
          },
        },
      );

      const transactions = orders
        .filter((order) => !order.deletedTime && order.state === "PAID")
        .map((order) => this.mapOrderToTransaction(order));

      this.log(
        "info",
        `Fetched ${transactions.length} transactions from Clover`,
      );
      return transactions;
    } catch (error) {
      this.log("error", "Failed to fetch transactions from Clover", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to fetch transactions");
    }
  }

  /**
   * Map Clover order to standardized transaction
   */
  private mapOrderToTransaction(order: CloverOrder): POSTransaction {
    const lineItems: POSTransactionLineItem[] = (
      order.lineItems?.elements || []
    ).map((item) => this.mapLineItem(item));

    const payments: POSTransactionPayment[] = (
      order.payments?.elements || []
    ).map((payment) => this.mapPayment(payment));

    // Calculate totals from line items
    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const tax = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);

    return {
      posTransactionId: order.id,
      timestamp: new Date(order.createdTime || Date.now()),
      cashierCode: order.employee?.id || "UNKNOWN",
      terminalId: order.device?.id,
      subtotal: subtotal / 100, // Clover uses cents
      tax: tax / 100,
      total: (order.total || 0) / 100,
      lineItems,
      payments,
    };
  }

  /**
   * Map Clover line item
   */
  private mapLineItem(item: CloverLineItem): POSTransactionLineItem {
    // Calculate tax from tax rates
    const taxRates = item.taxRates?.elements || [];
    const taxRate = taxRates.reduce(
      (sum, rate) => sum + (rate.rate || 0) / 10000000,
      0,
    );
    const lineTotal = item.price * (item.unitQty || 1);
    const taxAmount = Math.round(lineTotal * taxRate);

    return {
      departmentCode: item.item?.id || "UNCATEGORIZED",
      sku: item.item?.id,
      description: item.name,
      quantity: item.unitQty || 1,
      unitPrice: item.price / 100, // Convert cents to dollars
      taxAmount: taxAmount / 100,
      lineTotal: lineTotal / 100,
    };
  }

  /**
   * Map Clover payment
   */
  private mapPayment(payment: CloverPayment): POSTransactionPayment {
    return {
      tenderCode: payment.tender?.id || "UNKNOWN",
      amount: (payment.amount + (payment.tipAmount || 0)) / 100, // Include tip
      reference:
        payment.cardTransaction?.referenceId ||
        payment.externalPaymentId ||
        undefined,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Validate and cast config to Clover-specific config
   */
  private validateCloverConfig(
    config: POSConnectionConfig,
  ): CloverConnectionConfig {
    const cloverConfig = config as CloverConnectionConfig;

    if (!cloverConfig.merchantId) {
      throw new RestApiError(
        "Clover merchantId is required",
        400,
        "MISSING_MERCHANT_ID",
        undefined,
        false,
      );
    }

    return cloverConfig;
  }

  /**
   * Get appropriate base URL for environment
   */
  protected override buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    // Use parent implementation but could override for sandbox
    return super.buildUrl(path, query);
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
