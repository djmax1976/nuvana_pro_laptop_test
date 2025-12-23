/**
 * Square POS Adapter
 *
 * Integration with Square REST API for retail and convenience stores.
 * Supports syncing of:
 * - Categories (mapped to departments)
 * - Payment types (mapped to tender types)
 * - Team members (mapped to cashiers)
 * - Tax rates
 * - Orders and transactions
 *
 * @module services/pos/adapters/square.adapter
 * @see https://developer.squareup.com/reference/square
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
// Square API Response Types
// ============================================================================

/**
 * Square API error response
 */
interface SquareError {
  category: string;
  code: string;
  detail?: string;
  field?: string;
}

/**
 * Square API base response wrapper
 */
interface SquareResponse<T> {
  errors?: SquareError[];
  cursor?: string;
  [key: string]: T | SquareError[] | string | undefined;
}

/**
 * Square location (store)
 */
interface SquareLocation {
  id: string;
  name: string;
  address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    administrative_district_level_1?: string;
    postal_code?: string;
    country?: string;
  };
  timezone?: string;
  capabilities?: string[];
  status?: "ACTIVE" | "INACTIVE";
  created_at?: string;
  merchant_id?: string;
  country?: string;
  language_code?: string;
  currency?: string;
  phone_number?: string;
  business_name?: string;
  type?: "PHYSICAL" | "MOBILE";
  business_hours?: {
    periods?: Array<{
      day_of_week: string;
      start_local_time: string;
      end_local_time: string;
    }>;
  };
}

/**
 * Square catalog object (category, item, tax, etc.)
 */
interface SquareCatalogObject {
  type:
    | "CATEGORY"
    | "ITEM"
    | "TAX"
    | "DISCOUNT"
    | "MODIFIER"
    | "MODIFIER_LIST"
    | "IMAGE";
  id: string;
  updated_at?: string;
  created_at?: string;
  version?: number;
  is_deleted?: boolean;
  present_at_all_locations?: boolean;
  present_at_location_ids?: string[];
  absent_at_location_ids?: string[];
  category_data?: SquareCategoryData;
  item_data?: SquareItemData;
  tax_data?: SquareTaxData;
}

/**
 * Square category data
 */
interface SquareCategoryData {
  name: string;
  category_type?: "REGULAR_CATEGORY" | "MENU_CATEGORY" | "KITCHEN_CATEGORY";
  parent_category?: {
    id: string;
  };
  is_top_level?: boolean;
  online_visibility?: boolean;
}

/**
 * Square item data
 */
interface SquareItemData {
  name: string;
  description?: string;
  abbreviation?: string;
  label_color?: string;
  available_online?: boolean;
  available_for_pickup?: boolean;
  available_electronically?: boolean;
  category_id?: string;
  tax_ids?: string[];
  variations?: SquareItemVariation[];
  product_type?: "REGULAR" | "GIFT_CARD" | "APPOINTMENTS_SERVICE";
  skip_modifier_screen?: boolean;
  is_taxable?: boolean;
}

/**
 * Square item variation
 */
interface SquareItemVariation {
  type: "ITEM_VARIATION";
  id: string;
  item_variation_data?: {
    item_id?: string;
    name?: string;
    sku?: string;
    upc?: string;
    ordinal?: number;
    pricing_type?: "FIXED_PRICING" | "VARIABLE_PRICING";
    price_money?: SquareMoney;
    track_inventory?: boolean;
    sellable?: boolean;
    stockable?: boolean;
  };
}

/**
 * Square tax data
 */
interface SquareTaxData {
  name: string;
  calculation_phase?: "TAX_SUBTOTAL_PHASE" | "TAX_TOTAL_PHASE";
  inclusion_type?: "ADDITIVE" | "INCLUSIVE";
  percentage?: string;
  applies_to_custom_amounts?: boolean;
  enabled?: boolean;
}

/**
 * Square money object
 */
interface SquareMoney {
  amount?: number;
  currency?: string;
}

/**
 * Square team member
 */
interface SquareTeamMember {
  id: string;
  reference_id?: string;
  is_owner?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  given_name?: string;
  family_name?: string;
  email_address?: string;
  phone_number?: string;
  created_at?: string;
  updated_at?: string;
  assigned_locations?: {
    assignment_type?: "ALL_CURRENT_AND_FUTURE_LOCATIONS" | "EXPLICIT_LOCATIONS";
    location_ids?: string[];
  };
}

/**
 * Square order
 */
interface SquareOrder {
  id: string;
  location_id: string;
  reference_id?: string;
  source?: {
    name?: string;
  };
  customer_id?: string;
  line_items?: SquareOrderLineItem[];
  taxes?: SquareOrderTax[];
  discounts?: SquareOrderDiscount[];
  fulfillments?: SquareOrderFulfillment[];
  returns?: SquareOrderReturn[];
  return_amounts?: SquareOrderMoneyAmounts;
  net_amounts?: SquareOrderMoneyAmounts;
  total_money?: SquareMoney;
  total_tax_money?: SquareMoney;
  total_discount_money?: SquareMoney;
  total_tip_money?: SquareMoney;
  total_service_charge_money?: SquareMoney;
  tenders?: SquareOrderTender[];
  refunds?: SquareOrderRefund[];
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  state?: "OPEN" | "COMPLETED" | "CANCELED" | "DRAFT";
  version?: number;
  ticket_name?: string;
}

/**
 * Square order line item
 */
interface SquareOrderLineItem {
  uid?: string;
  name?: string;
  quantity: string;
  catalog_object_id?: string;
  catalog_version?: number;
  variation_name?: string;
  note?: string;
  base_price_money?: SquareMoney;
  variation_total_price_money?: SquareMoney;
  gross_sales_money?: SquareMoney;
  total_tax_money?: SquareMoney;
  total_discount_money?: SquareMoney;
  total_money?: SquareMoney;
  applied_taxes?: Array<{
    uid?: string;
    tax_uid?: string;
    applied_money?: SquareMoney;
  }>;
  applied_discounts?: Array<{
    uid?: string;
    discount_uid?: string;
    applied_money?: SquareMoney;
  }>;
  item_type?: "ITEM" | "CUSTOM_AMOUNT" | "GIFT_CARD";
}

/**
 * Square order tax
 */
interface SquareOrderTax {
  uid?: string;
  catalog_object_id?: string;
  catalog_version?: number;
  name?: string;
  type?: "UNKNOWN_TAX" | "ADDITIVE" | "INCLUSIVE";
  percentage?: string;
  applied_money?: SquareMoney;
  scope?: "OTHER_TAX_SCOPE" | "LINE_ITEM" | "ORDER";
}

/**
 * Square order discount
 */
interface SquareOrderDiscount {
  uid?: string;
  catalog_object_id?: string;
  name?: string;
  type?:
    | "UNKNOWN_DISCOUNT"
    | "FIXED_PERCENTAGE"
    | "FIXED_AMOUNT"
    | "VARIABLE_PERCENTAGE"
    | "VARIABLE_AMOUNT";
  percentage?: string;
  amount_money?: SquareMoney;
  applied_money?: SquareMoney;
  scope?: "OTHER_DISCOUNT_SCOPE" | "LINE_ITEM" | "ORDER";
}

/**
 * Square order fulfillment
 */
interface SquareOrderFulfillment {
  uid?: string;
  type?: "PICKUP" | "SHIPMENT" | "DELIVERY";
  state?:
    | "PROPOSED"
    | "RESERVED"
    | "PREPARED"
    | "COMPLETED"
    | "CANCELED"
    | "FAILED";
}

/**
 * Square order return
 */
interface SquareOrderReturn {
  uid?: string;
  source_order_id?: string;
  return_line_items?: SquareOrderLineItem[];
}

/**
 * Square order money amounts
 */
interface SquareOrderMoneyAmounts {
  total_money?: SquareMoney;
  tax_money?: SquareMoney;
  discount_money?: SquareMoney;
  tip_money?: SquareMoney;
  service_charge_money?: SquareMoney;
}

/**
 * Square order tender (payment)
 */
interface SquareOrderTender {
  id?: string;
  location_id?: string;
  transaction_id?: string;
  created_at?: string;
  note?: string;
  amount_money?: SquareMoney;
  tip_money?: SquareMoney;
  processing_fee_money?: SquareMoney;
  customer_id?: string;
  type?:
    | "CARD"
    | "CASH"
    | "THIRD_PARTY_CARD"
    | "SQUARE_GIFT_CARD"
    | "NO_SALE"
    | "WALLET"
    | "OTHER";
  card_details?: {
    status?: string;
    card?: {
      card_brand?: string;
      last_4?: string;
      exp_month?: number;
      exp_year?: number;
      fingerprint?: string;
      card_type?: string;
      prepaid_type?: string;
      bin?: string;
    };
    entry_method?: string;
  };
  cash_details?: {
    buyer_tendered_money?: SquareMoney;
    change_back_money?: SquareMoney;
  };
  payment_id?: string;
}

/**
 * Square order refund
 */
interface SquareOrderRefund {
  id?: string;
  location_id?: string;
  transaction_id?: string;
  tender_id?: string;
  created_at?: string;
  reason?: string;
  amount_money?: SquareMoney;
  status?: "PENDING" | "APPROVED" | "REJECTED" | "FAILED";
}

// ============================================================================
// Square Connection Configuration Extension
// ============================================================================

/**
 * Extended configuration for Square connections
 */
export interface SquareConnectionConfig extends POSConnectionConfig {
  /** Square location ID (required for most operations) */
  locationId: string;
  /** Square merchant ID (optional, for multi-location accounts) */
  merchantId?: string;
  /** Square environment */
  environment?: "sandbox" | "production";
  /** API version (defaults to latest) */
  apiVersion?: string;
}

// ============================================================================
// Square Adapter Implementation
// ============================================================================

/**
 * Square POS Adapter
 *
 * Implements full integration with Square REST API including:
 * - OAuth 2.0 authentication
 * - Catalog category synchronization (departments)
 * - Payment type mapping (tender types)
 * - Team member synchronization (cashiers)
 * - Tax rate synchronization
 * - Order/transaction retrieval
 *
 * Rate Limits (per Square documentation):
 * - Default: 1000 requests per minute per application
 * - Batch endpoints: Lower limits apply
 *
 * @example
 * ```typescript
 * const adapter = new SquareAdapter();
 * const config: SquareConnectionConfig = {
 *   host: 'connect.squareup.com',
 *   port: 443,
 *   useSsl: true,
 *   timeoutMs: 30000,
 *   authType: 'OAUTH2',
 *   credentials: {
 *     type: 'OAUTH2',
 *     clientId: 'your-client-id',
 *     clientSecret: 'your-client-secret',
 *     tokenUrl: 'https://connect.squareup.com/oauth2/token',
 *     accessToken: 'cached-token',
 *     tokenExpiresAt: new Date('2025-12-31'),
 *   },
 *   locationId: 'location-uuid',
 * };
 *
 * const departments = await adapter.syncDepartments(config);
 * ```
 */
export class SquareAdapter extends BaseRESTAdapter {
  readonly posType: POSSystemType = "SQUARE_REST";
  readonly displayName = "Square";

  /**
   * Base URL for Square API
   */
  protected readonly baseUrl: string = "https://connect.squareup.com/v2";

  /**
   * Sandbox base URL
   * @internal Used for environment detection
   */
  protected readonly SANDBOX_BASE_URL =
    "https://connect.squareupsandbox.com/v2";

  /**
   * Rate limit configuration for Square API
   * Square allows ~1000 requests/minute, we use 900 for safety
   */
  protected override readonly rateLimitConfig: RateLimitConfig = {
    maxRequests: 15, // 15 per second = 900/minute
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
      webhookSupport: true,
    };
  }

  // ============================================================================
  // Connection Test
  // ============================================================================

  /**
   * Test connection to Square API
   *
   * Validates credentials by fetching location information.
   *
   * @param config - Square connection configuration
   * @returns Connection test result with location details
   */
  async testConnection(
    config: POSConnectionConfig,
  ): Promise<POSConnectionTestResult> {
    const startTime = Date.now();
    const squareConfig = this.validateSquareConfig(config);

    try {
      this.log("info", "Testing Square connection", {
        locationId: squareConfig.locationId,
      });

      // Fetch location info to validate connection
      const response = await this.get<SquareResponse<SquareLocation>>(
        config,
        `/locations/${squareConfig.locationId}`,
      );

      // Check for Square API errors
      if (response.data.errors && response.data.errors.length > 0) {
        const error = response.data.errors[0];
        return {
          success: false,
          message: error.detail || error.code,
          latencyMs: Date.now() - startTime,
          errorCode: error.code,
        };
      }

      const location = response.data.location as SquareLocation;

      return {
        success: true,
        message: `Connected to ${location?.name || "Square Location"}`,
        posVersion: "Square API v2",
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      this.log("error", "Square connection test failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        locationId: squareConfig.locationId,
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
  // Department Sync (Catalog Categories)
  // ============================================================================

  /**
   * Sync departments from Square (catalog categories)
   *
   * Square uses catalog categories to organize items.
   *
   * @param config - Square connection configuration
   * @returns Array of standardized departments
   */
  async syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]> {
    const squareConfig = this.validateSquareConfig(config);

    this.log("info", "Syncing departments (categories) from Square", {
      locationId: squareConfig.locationId,
    });

    try {
      const categories = await this.fetchCatalogObjects(config, "CATEGORY");

      const departments = categories
        .filter((obj) => !obj.is_deleted && obj.category_data)
        .map((obj, index) =>
          this.mapCategoryToDepartment(obj, squareConfig.locationId, index),
        );

      this.log("info", `Synced ${departments.length} departments from Square`);
      return departments;
    } catch (error) {
      this.log("error", "Failed to sync departments from Square", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync departments");
    }
  }

  /**
   * Fetch catalog objects of a specific type
   */
  private async fetchCatalogObjects(
    config: POSConnectionConfig,
    type: string,
  ): Promise<SquareCatalogObject[]> {
    const allObjects: SquareCatalogObject[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.post<SquareResponse<SquareCatalogObject[]>>(
        config,
        "/catalog/search",
        {
          object_types: [type],
          limit: this.defaultPageSize,
          cursor,
        },
      );

      // Check for errors
      if (response.data.errors && response.data.errors.length > 0) {
        throw new RestApiError(
          response.data.errors[0].detail || response.data.errors[0].code,
          400,
          response.data.errors[0].code,
          undefined,
          false,
        );
      }

      const objects = (response.data.objects as SquareCatalogObject[]) || [];
      allObjects.push(...objects);

      cursor = response.data.cursor;

      if (allObjects.length >= this.maxItemsPerSync) {
        break;
      }
    } while (cursor);

    return allObjects;
  }

  /**
   * Map Square catalog category to standardized department
   */
  private mapCategoryToDepartment(
    catalogObject: SquareCatalogObject,
    locationId: string,
    index: number,
  ): POSDepartment {
    const category = catalogObject.category_data!;
    const name = category.name;

    // Check if category is present at this location
    const isActive =
      catalogObject.present_at_all_locations ||
      (catalogObject.present_at_location_ids?.includes(locationId) ?? true);

    return {
      posCode: catalogObject.id,
      displayName: name,
      isTaxable: true, // Square items within categories handle their own tax
      minimumAge: this.detectMinimumAge(name),
      isLottery: this.isLotteryCategory(name),
      isActive: isActive && !catalogObject.is_deleted,
      sortOrder: index,
      description: category.category_type,
    };
  }

  /**
   * Detect minimum age requirement from category name
   */
  private detectMinimumAge(name: string): number | undefined {
    const upperName = name.toUpperCase();

    if (
      upperName.includes("ALCOHOL") ||
      upperName.includes("BEER") ||
      upperName.includes("WINE") ||
      upperName.includes("LIQUOR") ||
      upperName.includes("SPIRITS")
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
   * Check if category is lottery-related
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
   * Sync tender types from Square
   *
   * Square has fixed tender types, so we return a standard set.
   *
   * @param config - Square connection configuration
   * @returns Array of standardized tender types
   */
  async syncTenderTypes(config: POSConnectionConfig): Promise<POSTenderType[]> {
    this.validateSquareConfig(config);

    this.log("info", "Syncing tender types from Square");

    // Square has a fixed set of tender types
    // We return the standard Square payment methods
    const tenderTypes: POSTenderType[] = [
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
        posCode: "CARD",
        displayName: "Card",
        isCashEquivalent: false,
        isElectronic: true,
        affectsCashDrawer: false,
        requiresReference: true,
        isActive: true,
        sortOrder: 1,
      },
      {
        posCode: "SQUARE_GIFT_CARD",
        displayName: "Square Gift Card",
        isCashEquivalent: false,
        isElectronic: true,
        affectsCashDrawer: false,
        requiresReference: true,
        isActive: true,
        sortOrder: 2,
      },
      {
        posCode: "WALLET",
        displayName: "Mobile Wallet",
        isCashEquivalent: false,
        isElectronic: true,
        affectsCashDrawer: false,
        requiresReference: true,
        isActive: true,
        sortOrder: 3,
        description: "Apple Pay, Google Pay, etc.",
      },
      {
        posCode: "THIRD_PARTY_CARD",
        displayName: "Third Party Card",
        isCashEquivalent: false,
        isElectronic: true,
        affectsCashDrawer: false,
        requiresReference: true,
        isActive: true,
        sortOrder: 4,
      },
      {
        posCode: "OTHER",
        displayName: "Other",
        isCashEquivalent: false,
        isElectronic: false,
        affectsCashDrawer: false,
        requiresReference: false,
        isActive: true,
        sortOrder: 5,
      },
    ];

    this.log("info", `Synced ${tenderTypes.length} tender types from Square`);
    return tenderTypes;
  }

  // ============================================================================
  // Cashier Sync (Team Members)
  // ============================================================================

  /**
   * Sync cashiers from Square (team members)
   *
   * @param config - Square connection configuration
   * @returns Array of standardized cashiers
   */
  async syncCashiers(config: POSConnectionConfig): Promise<POSCashier[]> {
    const squareConfig = this.validateSquareConfig(config);

    this.log("info", "Syncing cashiers (team members) from Square", {
      locationId: squareConfig.locationId,
    });

    try {
      const teamMembers = await this.fetchTeamMembers(
        config,
        squareConfig.locationId,
      );

      const cashiers = teamMembers
        .filter((member) => member.status === "ACTIVE")
        .map((member) => this.mapTeamMemberToCashier(member));

      this.log("info", `Synced ${cashiers.length} cashiers from Square`);
      return cashiers;
    } catch (error) {
      this.log("error", "Failed to sync cashiers from Square", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync cashiers");
    }
  }

  /**
   * Fetch team members from Square
   */
  private async fetchTeamMembers(
    config: POSConnectionConfig,
    locationId: string,
  ): Promise<SquareTeamMember[]> {
    const allMembers: SquareTeamMember[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.post<SquareResponse<SquareTeamMember[]>>(
        config,
        "/team-members/search",
        {
          query: {
            filter: {
              location_ids: [locationId],
              status: "ACTIVE",
            },
          },
          limit: this.defaultPageSize,
          cursor,
        },
      );

      // Check for errors
      if (response.data.errors && response.data.errors.length > 0) {
        throw new RestApiError(
          response.data.errors[0].detail || response.data.errors[0].code,
          400,
          response.data.errors[0].code,
          undefined,
          false,
        );
      }

      const members = (response.data.team_members as SquareTeamMember[]) || [];
      allMembers.push(...members);

      cursor = response.data.cursor;

      if (allMembers.length >= this.maxItemsPerSync) {
        break;
      }
    } while (cursor);

    return allMembers;
  }

  /**
   * Map Square team member to standardized cashier
   */
  private mapTeamMemberToCashier(member: SquareTeamMember): POSCashier {
    return {
      posCode: member.id,
      firstName: member.given_name || "Unknown",
      lastName: member.family_name || "",
      isActive: member.status === "ACTIVE",
      employeeId: member.reference_id,
    };
  }

  // ============================================================================
  // Tax Rate Sync
  // ============================================================================

  /**
   * Sync tax rates from Square (catalog taxes)
   *
   * @param config - Square connection configuration
   * @returns Array of standardized tax rates
   */
  async syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]> {
    const squareConfig = this.validateSquareConfig(config);

    this.log("info", "Syncing tax rates from Square", {
      locationId: squareConfig.locationId,
    });

    try {
      const taxes = await this.fetchCatalogObjects(config, "TAX");

      const taxRates = taxes
        .filter((obj) => !obj.is_deleted && obj.tax_data)
        .map((obj) => this.mapTaxToTaxRate(obj, squareConfig.locationId));

      this.log("info", `Synced ${taxRates.length} tax rates from Square`);
      return taxRates;
    } catch (error) {
      this.log("error", "Failed to sync tax rates from Square", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync tax rates");
    }
  }

  /**
   * Map Square catalog tax to standardized tax rate
   */
  private mapTaxToTaxRate(
    catalogObject: SquareCatalogObject,
    locationId: string,
  ): POSTaxRate {
    const tax = catalogObject.tax_data!;

    // Square stores percentage as string (e.g., "8.25")
    const percentage = parseFloat(tax.percentage || "0");
    const rate = percentage / 100; // Convert to decimal (0.0825)

    const isActive =
      (catalogObject.present_at_all_locations ||
        (catalogObject.present_at_location_ids?.includes(locationId) ??
          true)) &&
      tax.enabled !== false;

    return {
      posCode: catalogObject.id,
      displayName: tax.name,
      rate: rate,
      isActive: isActive && !catalogObject.is_deleted,
      description:
        tax.inclusion_type === "INCLUSIVE" ? "Inclusive Tax" : "Additive Tax",
    };
  }

  // ============================================================================
  // Transaction Retrieval
  // ============================================================================

  /**
   * Fetch orders/transactions from Square
   *
   * @param config - Square connection configuration
   * @param options - Query options
   * @returns Array of standardized transactions
   */
  async fetchTransactions(
    config: POSConnectionConfig,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      completedOnly?: boolean;
    } = {},
  ): Promise<POSTransaction[]> {
    const squareConfig = this.validateSquareConfig(config);
    const { startDate, endDate, limit = 1000, completedOnly = true } = options;

    this.log("info", "Fetching transactions from Square", {
      locationId: squareConfig.locationId,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      limit,
    });

    try {
      const orders = await this.fetchOrders(
        config,
        squareConfig.locationId,
        startDate,
        endDate,
        limit,
        completedOnly,
      );

      const transactions = orders
        .filter((order) => order.state === "COMPLETED")
        .map((order) => this.mapOrderToTransaction(order));

      this.log(
        "info",
        `Fetched ${transactions.length} transactions from Square`,
      );
      return transactions;
    } catch (error) {
      this.log("error", "Failed to fetch transactions from Square", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to fetch transactions");
    }
  }

  /**
   * Fetch orders from Square
   */
  private async fetchOrders(
    config: POSConnectionConfig,
    locationId: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 1000,
    completedOnly: boolean = true,
  ): Promise<SquareOrder[]> {
    const allOrders: SquareOrder[] = [];
    let cursor: string | undefined;

    // Build date filter
    const dateTimeFilter: Record<string, unknown> = {};
    if (startDate) {
      dateTimeFilter.start_at = startDate.toISOString();
    }
    if (endDate) {
      dateTimeFilter.end_at = endDate.toISOString();
    }

    // Build state filter
    const stateFilter = completedOnly ? { states: ["COMPLETED"] } : undefined;

    do {
      const response = await this.post<SquareResponse<SquareOrder[]>>(
        config,
        "/orders/search",
        {
          location_ids: [locationId],
          query: {
            filter: {
              ...(Object.keys(dateTimeFilter).length > 0 && {
                date_time_filter: {
                  closed_at: dateTimeFilter,
                },
              }),
              ...stateFilter,
            },
            sort: {
              sort_field: "CLOSED_AT",
              sort_order: "DESC",
            },
          },
          limit: Math.min(this.defaultPageSize, limit - allOrders.length),
          cursor,
        },
      );

      // Check for errors
      if (response.data.errors && response.data.errors.length > 0) {
        throw new RestApiError(
          response.data.errors[0].detail || response.data.errors[0].code,
          400,
          response.data.errors[0].code,
          undefined,
          false,
        );
      }

      const orders = (response.data.orders as SquareOrder[]) || [];
      allOrders.push(...orders);

      cursor = response.data.cursor;

      if (allOrders.length >= limit) {
        break;
      }
    } while (cursor);

    return allOrders.slice(0, limit);
  }

  /**
   * Map Square order to standardized transaction
   */
  private mapOrderToTransaction(order: SquareOrder): POSTransaction {
    const lineItems: POSTransactionLineItem[] = (order.line_items || []).map(
      (item) => this.mapLineItem(item),
    );

    const payments: POSTransactionPayment[] = (order.tenders || []).map(
      (tender) => this.mapTender(tender),
    );

    // Calculate totals from Square money objects
    const total = this.moneyToNumber(order.total_money);
    const tax = this.moneyToNumber(order.total_tax_money);
    const subtotal = total - tax;

    // Get cashier from first tender
    const cashierCode = order.tenders?.[0]?.id || "UNKNOWN";

    return {
      posTransactionId: order.id,
      timestamp: new Date(order.closed_at || order.created_at || Date.now()),
      cashierCode: cashierCode,
      terminalId: order.source?.name,
      subtotal,
      tax,
      total,
      lineItems,
      payments,
    };
  }

  /**
   * Map Square line item
   */
  private mapLineItem(item: SquareOrderLineItem): POSTransactionLineItem {
    const quantity = parseFloat(item.quantity) || 1;
    const unitPrice = this.moneyToNumber(item.base_price_money);
    const taxAmount = this.moneyToNumber(item.total_tax_money);
    const lineTotal = this.moneyToNumber(item.total_money);

    return {
      departmentCode: item.catalog_object_id || "UNCATEGORIZED",
      sku: item.catalog_object_id,
      description: item.name || "Unknown Item",
      quantity,
      unitPrice,
      taxAmount,
      lineTotal,
    };
  }

  /**
   * Map Square tender to payment
   */
  private mapTender(tender: SquareOrderTender): POSTransactionPayment {
    const amount =
      this.moneyToNumber(tender.amount_money) +
      this.moneyToNumber(tender.tip_money);

    // Build reference from card details if available
    let reference: string | undefined;
    if (tender.card_details?.card) {
      reference = `${tender.card_details.card.card_brand || "CARD"} ****${tender.card_details.card.last_4 || "0000"}`;
    } else if (tender.payment_id) {
      reference = tender.payment_id;
    }

    return {
      tenderCode: tender.type || "OTHER",
      amount,
      reference,
    };
  }

  /**
   * Convert Square Money object to number
   */
  private moneyToNumber(money?: SquareMoney): number {
    if (!money || money.amount === undefined) {
      return 0;
    }
    // Square stores amounts in cents
    return money.amount / 100;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Validate and cast config to Square-specific config
   */
  private validateSquareConfig(
    config: POSConnectionConfig,
  ): SquareConnectionConfig {
    const squareConfig = config as SquareConnectionConfig;

    if (!squareConfig.locationId) {
      throw new RestApiError(
        "Square locationId is required",
        400,
        "MISSING_LOCATION_ID",
        undefined,
        false,
      );
    }

    return squareConfig;
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
