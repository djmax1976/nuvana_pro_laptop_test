/**
 * Generic REST Adapter
 *
 * Configurable adapter for POS systems using custom REST/JSON APIs.
 * Uses JSONPath expressions for flexible field mapping, allowing integration
 * with any JSON-based POS API without custom adapter development.
 *
 * @module services/pos/adapters/generic-rest.adapter
 * @security All credentials are handled securely; tokens are never logged
 * @see coding-rules: API-001 (Validation), API-002 (Rate Limiting), API-003 (Error Handling), API-004 (Authentication)
 */

import type { POSSystemType } from "@prisma/client";
import {
  BaseRESTAdapter,
  RestApiError,
  type RateLimitConfig,
  type RestResponse,
} from "./base-rest.adapter";
import type {
  POSConnectionConfig,
  POSConnectionTestResult,
  POSDepartment,
  POSTenderType,
  POSCashier,
  POSTaxRate,
  POSAdapterCapabilities,
} from "../../../types/pos-integration.types";

// ============================================================================
// JSONPath Mapping Types
// ============================================================================

/**
 * JSONPath field mapping for extracting a single value from JSON
 */
export interface JSONPathFieldMapping {
  /** JSONPath expression to locate the value (e.g., "$.name", "$.data[0].id") */
  path: string;
  /** Default value if path returns no result */
  defaultValue?: string | number | boolean;
  /** Transform function name to apply after extraction */
  transform?: JSONPathTransformType;
  /** Whether this field is required */
  required?: boolean;
}

/**
 * Supported transform types for JSONPath field values
 */
export type JSONPathTransformType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "uppercase"
  | "lowercase"
  | "trim"
  | "percentage_to_decimal"
  | "cents_to_dollars";

/**
 * JSONPath mapping for an entity type (departments, tenders, etc.)
 */
export interface JSONPathEntityMapping {
  /** API endpoint path to fetch entities */
  endpoint: string;
  /** HTTP method to use (default: GET) */
  method?: "GET" | "POST";
  /** Request body for POST requests */
  requestBody?: Record<string, unknown>;
  /** JSONPath to the array of entities in the response */
  arrayPath: string;
  /** Field mappings for each entity in the array */
  fields: Record<string, JSONPathFieldMapping>;
  /** Pagination configuration */
  pagination?: PaginationConfig;
}

/**
 * Pagination configuration for API endpoints
 */
export interface PaginationConfig {
  /** Type of pagination */
  type: "offset" | "cursor" | "page";
  /** Query parameter name for offset/page/cursor */
  paramName: string;
  /** Query parameter name for limit/page size */
  limitParam?: string;
  /** Items per page (default: 100) */
  pageSize?: number;
  /** Maximum items to fetch (default: 10000) */
  maxItems?: number;
  /** JSONPath to the next cursor value (for cursor pagination) */
  nextCursorPath?: string;
  /** JSONPath to total count (optional, for offset pagination) */
  totalCountPath?: string;
  /** JSONPath to hasMore indicator (optional) */
  hasMorePath?: string;
}

/**
 * Complete JSONPath mapping configuration for all entity types
 */
export interface GenericRESTMappings {
  /** Base URL for the API (can override config.host) */
  baseUrl?: string;
  /** Mapping for departments */
  departments?: JSONPathEntityMapping;
  /** Mapping for tender types */
  tenderTypes?: JSONPathEntityMapping;
  /** Mapping for cashiers */
  cashiers?: JSONPathEntityMapping;
  /** Mapping for tax rates */
  taxRates?: JSONPathEntityMapping;
  /** Connection test endpoint configuration */
  connectionTest?: {
    /** API endpoint to test connection */
    endpoint: string;
    /** HTTP method (default: GET) */
    method?: "GET" | "POST";
    /** Expected status code (default: 200) */
    expectedStatus?: number;
    /** JSONPath to a field that should exist in success response */
    successPath?: string;
    /** Expected value at successPath (optional) */
    expectedValue?: string;
  };
}

// ============================================================================
// Generic REST Connection Configuration
// ============================================================================

/**
 * Extended configuration for Generic REST connections
 */
export interface GenericRESTConnectionConfig extends POSConnectionConfig {
  /** JSONPath mappings for entity extraction */
  mappings: GenericRESTMappings;
  /** Additional headers to send with every request */
  defaultHeaders?: Record<string, string>;
  /** Rate limit configuration override */
  rateLimit?: Partial<RateLimitConfig>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Generic REST adapter error with structured information
 */
export class GenericRESTAdapterError extends Error {
  constructor(
    message: string,
    public readonly errorCode: string,
    public readonly details?: Record<string, unknown>,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "GenericRESTAdapterError";
  }
}

// ============================================================================
// Generic REST Adapter Implementation
// ============================================================================

/**
 * Generic REST Adapter
 *
 * Implements configurable JSON REST API parsing for any POS system.
 * Configuration is done through JSONPath mappings that define how to
 * extract entity data from API responses.
 *
 * Features:
 * - Configurable JSONPath mappings for each entity type
 * - Multiple pagination strategies (offset, cursor, page)
 * - OAuth 2.0 and API key authentication (inherited from BaseRESTAdapter)
 * - Rate limiting with configurable limits
 * - Value transformations (type conversion, formatting)
 * - Detailed error reporting
 *
 * @example
 * ```typescript
 * const config: GenericRESTConnectionConfig = {
 *   host: 'api.example.com',
 *   port: 443,
 *   useSsl: true,
 *   timeoutMs: 30000,
 *   authType: 'API_KEY',
 *   credentials: { type: 'API_KEY', apiKey: 'xxx', headerName: 'X-API-Key' },
 *   mappings: {
 *     baseUrl: 'https://api.example.com/v1',
 *     departments: {
 *       endpoint: '/categories',
 *       arrayPath: '$.data',
 *       fields: {
 *         posCode: { path: '$.id', required: true },
 *         displayName: { path: '$.name', required: true },
 *         isTaxable: { path: '$.taxable', transform: 'boolean', defaultValue: true },
 *       },
 *       pagination: {
 *         type: 'offset',
 *         paramName: 'offset',
 *         limitParam: 'limit',
 *         pageSize: 100,
 *       }
 *     }
 *   }
 * };
 *
 * const adapter = new GenericRESTAdapter();
 * const departments = await adapter.syncDepartments(config);
 * ```
 */
export class GenericRESTAdapter extends BaseRESTAdapter {
  readonly posType: POSSystemType = "GENERIC_REST";
  readonly displayName = "Generic REST API";

  /**
   * Base URL - will be set dynamically from config
   */
  protected readonly baseUrl: string = "";

  /**
   * Current config's base URL (set during request processing)
   */
  private currentBaseUrl: string = "";

  /**
   * Default rate limit configuration
   * Can be overridden in config.rateLimit
   */
  protected override readonly rateLimitConfig: RateLimitConfig = {
    maxRequests: 60,
    windowMs: 60000, // 1 minute
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
   * Capabilities depend on which mappings are configured
   */
  override getCapabilities(): POSAdapterCapabilities {
    return {
      syncDepartments: true,
      syncTenderTypes: true,
      syncCashiers: true,
      syncTaxRates: true,
      syncProducts: false,
      realTimeTransactions: false,
      webhookSupport: false,
    };
  }

  // ============================================================================
  // Connection Test
  // ============================================================================

  /**
   * Test connection to the REST API POS system
   *
   * @param config - Generic REST connection configuration
   * @returns Connection test result
   */
  async testConnection(
    config: POSConnectionConfig,
  ): Promise<POSConnectionTestResult> {
    const startTime = Date.now();
    const restConfig = this.validateConfig(config);

    try {
      this.log("info", "Testing Generic REST connection", {
        host: config.host,
        hasMapping: !!restConfig.mappings,
      });

      // Validate that at least one mapping is configured
      if (!this.hasAnyMapping(restConfig.mappings)) {
        return {
          success: false,
          message: "No JSONPath mappings configured",
          latencyMs: Date.now() - startTime,
          errorCode: "NO_MAPPINGS",
        };
      }

      // Set base URL for requests
      this.setBaseUrl(restConfig);

      // Run connection test if configured
      if (restConfig.mappings.connectionTest) {
        const testConfig = restConfig.mappings.connectionTest;
        const response = await this.makeRequest(
          restConfig,
          testConfig.endpoint,
          testConfig.method || "GET",
        );

        // Check status code
        const expectedStatus = testConfig.expectedStatus || 200;
        if (response.status !== expectedStatus) {
          return {
            success: false,
            message: `Connection test expected status ${expectedStatus} but got ${response.status}`,
            latencyMs: Date.now() - startTime,
            errorCode: "CONNECTION_TEST_STATUS_MISMATCH",
          };
        }

        // Check success path if configured
        if (testConfig.successPath) {
          const value = this.extractValue(
            response.data,
            testConfig.successPath,
          );
          if (value === undefined || value === null) {
            return {
              success: false,
              message: `Connection test path "${testConfig.successPath}" returned no value`,
              latencyMs: Date.now() - startTime,
              errorCode: "CONNECTION_TEST_PATH_FAILED",
            };
          }

          // Check expected value if configured
          if (testConfig.expectedValue !== undefined) {
            if (String(value) !== testConfig.expectedValue) {
              return {
                success: false,
                message: `Connection test expected "${testConfig.expectedValue}" but got "${value}"`,
                latencyMs: Date.now() - startTime,
                errorCode: "CONNECTION_TEST_VALUE_MISMATCH",
              };
            }
          }
        }
      } else {
        // No connection test configured, try a simple health check
        // by attempting to sync the first configured entity type
        const firstEndpoint =
          restConfig.mappings.departments?.endpoint ||
          restConfig.mappings.tenderTypes?.endpoint ||
          restConfig.mappings.cashiers?.endpoint ||
          restConfig.mappings.taxRates?.endpoint;

        if (firstEndpoint) {
          await this.makeRequest(restConfig, firstEndpoint, "GET");
        }
      }

      return {
        success: true,
        message: "Successfully connected to Generic REST API",
        posVersion: "Generic REST Adapter v1",
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      this.log("error", "Generic REST connection test failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        message: this.getErrorMessage(error),
        latencyMs: Date.now() - startTime,
        errorCode: this.getErrorCode(error),
        errorDetails:
          error instanceof GenericRESTAdapterError ? error.details : undefined,
      };
    }
  }

  // ============================================================================
  // Department Sync
  // ============================================================================

  /**
   * Sync departments from REST API
   *
   * @param config - Generic REST connection configuration
   * @returns Array of standardized departments
   */
  async syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]> {
    const restConfig = this.validateConfig(config);

    if (!restConfig.mappings.departments) {
      this.log("warn", "No department mapping configured");
      return [];
    }

    this.log("info", "Syncing departments from Generic REST API");
    this.setBaseUrl(restConfig);

    try {
      const departments = await this.fetchEntities<POSDepartment>(
        restConfig,
        restConfig.mappings.departments,
        this.mapToDepartment.bind(this),
      );

      this.log(
        "info",
        `Synced ${departments.length} departments from Generic REST API`,
      );
      return departments;
    } catch (error) {
      this.log("error", "Failed to sync departments from Generic REST API", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync departments");
    }
  }

  /**
   * Map extracted fields to a POSDepartment
   */
  private mapToDepartment(
    fields: Record<string, unknown>,
    index: number,
  ): POSDepartment {
    const name = String(fields.displayName || fields.name || "");

    return {
      posCode: String(
        fields.posCode || fields.code || fields.id || `DEPT_${index}`,
      ),
      displayName: name,
      isTaxable: this.toBoolean(fields.isTaxable, true),
      minimumAge: this.detectMinimumAge(name, fields.minimumAge),
      isLottery:
        this.toBoolean(fields.isLottery) || this.isLotteryCategory(name),
      isActive: this.toBoolean(fields.isActive, true),
      sortOrder: this.toNumber(fields.sortOrder, index),
      description: fields.description ? String(fields.description) : undefined,
    };
  }

  // ============================================================================
  // Tender Type Sync
  // ============================================================================

  /**
   * Sync tender types from REST API
   *
   * @param config - Generic REST connection configuration
   * @returns Array of standardized tender types
   */
  async syncTenderTypes(config: POSConnectionConfig): Promise<POSTenderType[]> {
    const restConfig = this.validateConfig(config);

    if (!restConfig.mappings.tenderTypes) {
      this.log("warn", "No tender type mapping configured");
      return [];
    }

    this.log("info", "Syncing tender types from Generic REST API");
    this.setBaseUrl(restConfig);

    try {
      const tenderTypes = await this.fetchEntities<POSTenderType>(
        restConfig,
        restConfig.mappings.tenderTypes,
        this.mapToTenderType.bind(this),
      );

      this.log(
        "info",
        `Synced ${tenderTypes.length} tender types from Generic REST API`,
      );
      return tenderTypes;
    } catch (error) {
      this.log("error", "Failed to sync tender types from Generic REST API", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync tender types");
    }
  }

  /**
   * Map extracted fields to a POSTenderType
   */
  private mapToTenderType(
    fields: Record<string, unknown>,
    index: number,
  ): POSTenderType {
    const name = String(fields.displayName || fields.name || "").toUpperCase();
    const isCash = name.includes("CASH");
    const isCard =
      name.includes("CREDIT") ||
      name.includes("DEBIT") ||
      name.includes("CARD");
    const isCheck = name.includes("CHECK");

    return {
      posCode: String(
        fields.posCode || fields.code || fields.id || `TENDER_${index}`,
      ),
      displayName: String(
        fields.displayName || fields.name || `Tender ${index}`,
      ),
      isCashEquivalent: this.toBoolean(
        fields.isCashEquivalent,
        isCash || isCheck,
      ),
      isElectronic: this.toBoolean(fields.isElectronic, isCard),
      affectsCashDrawer: this.toBoolean(fields.affectsCashDrawer, isCash),
      requiresReference: this.toBoolean(
        fields.requiresReference,
        isCard || isCheck,
      ),
      isActive: this.toBoolean(fields.isActive, true),
      sortOrder: this.toNumber(fields.sortOrder, index),
      description: fields.description ? String(fields.description) : undefined,
    };
  }

  // ============================================================================
  // Cashier Sync
  // ============================================================================

  /**
   * Sync cashiers from REST API
   *
   * @param config - Generic REST connection configuration
   * @returns Array of standardized cashiers
   */
  async syncCashiers(config: POSConnectionConfig): Promise<POSCashier[]> {
    const restConfig = this.validateConfig(config);

    if (!restConfig.mappings.cashiers) {
      this.log("warn", "No cashier mapping configured");
      return [];
    }

    this.log("info", "Syncing cashiers from Generic REST API");
    this.setBaseUrl(restConfig);

    try {
      const cashiers = await this.fetchEntities<POSCashier>(
        restConfig,
        restConfig.mappings.cashiers,
        this.mapToCashier.bind(this),
      );

      this.log(
        "info",
        `Synced ${cashiers.length} cashiers from Generic REST API`,
      );
      return cashiers;
    } catch (error) {
      this.log("error", "Failed to sync cashiers from Generic REST API", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync cashiers");
    }
  }

  /**
   * Map extracted fields to a POSCashier
   */
  private mapToCashier(
    fields: Record<string, unknown>,
    index: number,
  ): POSCashier {
    // Handle name parsing if full name is provided
    let firstName = String(fields.firstName || "");
    let lastName = String(fields.lastName || "");

    if (!firstName && fields.name) {
      const nameParts = String(fields.name).trim().split(/\s+/);
      firstName = nameParts[0] || "Unknown";
      lastName = nameParts.slice(1).join(" ");
    }

    return {
      posCode: String(
        fields.posCode ||
          fields.code ||
          fields.id ||
          fields.employeeId ||
          `CASHIER_${index}`,
      ),
      firstName: firstName || "Unknown",
      lastName: lastName,
      isActive: this.toBoolean(fields.isActive, true),
      employeeId: fields.employeeId ? String(fields.employeeId) : undefined,
      // Note: PIN hashes should not be synced for security reasons
    };
  }

  // ============================================================================
  // Tax Rate Sync
  // ============================================================================

  /**
   * Sync tax rates from REST API
   *
   * @param config - Generic REST connection configuration
   * @returns Array of standardized tax rates
   */
  async syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]> {
    const restConfig = this.validateConfig(config);

    if (!restConfig.mappings.taxRates) {
      this.log("warn", "No tax rate mapping configured");
      return [];
    }

    this.log("info", "Syncing tax rates from Generic REST API");
    this.setBaseUrl(restConfig);

    try {
      const taxRates = await this.fetchEntities<POSTaxRate>(
        restConfig,
        restConfig.mappings.taxRates,
        this.mapToTaxRate.bind(this),
      );

      this.log(
        "info",
        `Synced ${taxRates.length} tax rates from Generic REST API`,
      );
      return taxRates;
    } catch (error) {
      this.log("error", "Failed to sync tax rates from Generic REST API", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw this.wrapError(error, "Failed to sync tax rates");
    }
  }

  /**
   * Map extracted fields to a POSTaxRate
   */
  private mapToTaxRate(
    fields: Record<string, unknown>,
    index: number,
  ): POSTaxRate {
    // Handle rate conversion - could be percentage (8.25) or decimal (0.0825)
    let rate = this.toNumber(fields.rate, 0);
    if (rate > 1) {
      // Assume percentage format, convert to decimal
      rate = rate / 100;
    }

    return {
      posCode: String(
        fields.posCode || fields.code || fields.id || `TAX_${index}`,
      ),
      displayName: String(
        fields.displayName || fields.name || `Tax Rate ${index}`,
      ),
      rate: rate,
      isActive: this.toBoolean(fields.isActive, true),
      jurisdictionCode: fields.jurisdictionCode
        ? String(fields.jurisdictionCode)
        : undefined,
      description: fields.description ? String(fields.description) : undefined,
    };
  }

  // ============================================================================
  // API Request Methods
  // ============================================================================

  /**
   * Make a request to the API
   */
  private async makeRequest(
    config: GenericRESTConnectionConfig,
    endpoint: string,
    method: "GET" | "POST",
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<RestResponse<unknown>> {
    const headers: Record<string, string> = {
      ...(config.defaultHeaders || {}),
    };

    if (method === "GET") {
      return this.get(config, endpoint, { headers, query });
    } else {
      return this.post(config, endpoint, body, { headers, query });
    }
  }

  /**
   * Fetch all entities from an API endpoint with pagination
   */
  private async fetchEntities<T>(
    config: GenericRESTConnectionConfig,
    mapping: JSONPathEntityMapping,
    mapFunction: (fields: Record<string, unknown>, index: number) => T,
  ): Promise<T[]> {
    const maxItems = mapping.pagination?.maxItems || this.maxItemsPerSync;

    // Determine pagination strategy
    if (mapping.pagination) {
      switch (mapping.pagination.type) {
        case "offset":
          return this.fetchWithOffsetPagination(
            config,
            mapping,
            mapFunction,
            maxItems,
          );
        case "cursor":
          return this.fetchWithCursorPagination(
            config,
            mapping,
            mapFunction,
            maxItems,
          );
        case "page":
          return this.fetchWithPagePagination(
            config,
            mapping,
            mapFunction,
            maxItems,
          );
      }
    }

    // No pagination - single request
    const response = await this.makeRequest(
      config,
      mapping.endpoint,
      mapping.method || "GET",
      mapping.requestBody,
    );

    const entities = this.extractAndMapEntities(
      response.data,
      mapping,
      mapFunction,
    );

    return entities.slice(0, maxItems);
  }

  /**
   * Fetch entities with offset-based pagination
   */
  private async fetchWithOffsetPagination<T>(
    config: GenericRESTConnectionConfig,
    mapping: JSONPathEntityMapping,
    mapFunction: (fields: Record<string, unknown>, index: number) => T,
    maxItems: number,
  ): Promise<T[]> {
    const allEntities: T[] = [];
    const pageSize = mapping.pagination?.pageSize || this.defaultPageSize;
    const offsetParam = mapping.pagination?.paramName || "offset";
    const limitParam = mapping.pagination?.limitParam || "limit";
    let offset = 0;

    while (allEntities.length < maxItems) {
      const query: Record<string, number> = {
        [offsetParam]: offset,
        [limitParam]: Math.min(pageSize, maxItems - allEntities.length),
      };

      const response = await this.makeRequest(
        config,
        mapping.endpoint,
        mapping.method || "GET",
        mapping.requestBody,
        query,
      );

      const entities = this.extractAndMapEntities(
        response.data,
        mapping,
        mapFunction,
      );

      if (entities.length === 0) {
        break;
      }

      allEntities.push(...entities);
      offset += entities.length;

      // Check if we have more data
      if (entities.length < pageSize) {
        break;
      }

      // Check hasMore indicator if configured
      if (mapping.pagination?.hasMorePath) {
        const hasMore = this.extractValue(
          response.data,
          mapping.pagination.hasMorePath,
        );
        if (!this.toBoolean(hasMore, true)) {
          break;
        }
      }
    }

    return allEntities.slice(0, maxItems);
  }

  /**
   * Fetch entities with cursor-based pagination
   */
  private async fetchWithCursorPagination<T>(
    config: GenericRESTConnectionConfig,
    mapping: JSONPathEntityMapping,
    mapFunction: (fields: Record<string, unknown>, index: number) => T,
    maxItems: number,
  ): Promise<T[]> {
    const allEntities: T[] = [];
    const pageSize = mapping.pagination?.pageSize || this.defaultPageSize;
    const cursorParam = mapping.pagination?.paramName || "cursor";
    const limitParam = mapping.pagination?.limitParam || "limit";
    let cursor: string | undefined;

    while (allEntities.length < maxItems) {
      const query: Record<string, string | number | undefined> = {
        [limitParam]: Math.min(pageSize, maxItems - allEntities.length),
      };

      if (cursor) {
        query[cursorParam] = cursor;
      }

      const response = await this.makeRequest(
        config,
        mapping.endpoint,
        mapping.method || "GET",
        mapping.requestBody,
        query,
      );

      const entities = this.extractAndMapEntities(
        response.data,
        mapping,
        mapFunction,
      );

      if (entities.length === 0) {
        break;
      }

      allEntities.push(...entities);

      // Get next cursor
      if (mapping.pagination?.nextCursorPath) {
        const nextCursor = this.extractValue(
          response.data,
          mapping.pagination.nextCursorPath,
        );
        if (!nextCursor) {
          break;
        }
        cursor = String(nextCursor);
      } else {
        break;
      }
    }

    return allEntities.slice(0, maxItems);
  }

  /**
   * Fetch entities with page-based pagination
   */
  private async fetchWithPagePagination<T>(
    config: GenericRESTConnectionConfig,
    mapping: JSONPathEntityMapping,
    mapFunction: (fields: Record<string, unknown>, index: number) => T,
    maxItems: number,
  ): Promise<T[]> {
    const allEntities: T[] = [];
    const pageSize = mapping.pagination?.pageSize || this.defaultPageSize;
    const pageParam = mapping.pagination?.paramName || "page";
    const limitParam = mapping.pagination?.limitParam || "per_page";
    let page = 1;

    while (allEntities.length < maxItems) {
      const query: Record<string, number> = {
        [pageParam]: page,
        [limitParam]: Math.min(pageSize, maxItems - allEntities.length),
      };

      const response = await this.makeRequest(
        config,
        mapping.endpoint,
        mapping.method || "GET",
        mapping.requestBody,
        query,
      );

      const entities = this.extractAndMapEntities(
        response.data,
        mapping,
        mapFunction,
      );

      if (entities.length === 0) {
        break;
      }

      allEntities.push(...entities);
      page++;

      // Check if we have more data
      if (entities.length < pageSize) {
        break;
      }

      // Check hasMore indicator if configured
      if (mapping.pagination?.hasMorePath) {
        const hasMore = this.extractValue(
          response.data,
          mapping.pagination.hasMorePath,
        );
        if (!this.toBoolean(hasMore, true)) {
          break;
        }
      }
    }

    return allEntities.slice(0, maxItems);
  }

  // ============================================================================
  // JSONPath Extraction Methods
  // ============================================================================

  /**
   * Extract entities from response and map them to the target type
   */
  private extractAndMapEntities<T>(
    data: unknown,
    mapping: JSONPathEntityMapping,
    mapFunction: (fields: Record<string, unknown>, index: number) => T,
  ): T[] {
    const entities: T[] = [];

    // Extract array of entities using arrayPath
    const array = this.extractValue(data, mapping.arrayPath);
    if (!Array.isArray(array)) {
      this.log(
        "warn",
        `arrayPath "${mapping.arrayPath}" did not return an array`,
      );
      return [];
    }

    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      const fields: Record<string, unknown> = {};

      // Extract each field
      for (const [fieldName, fieldMapping] of Object.entries(mapping.fields)) {
        const value = this.extractFieldValue(item, fieldMapping);
        fields[fieldName] = value;
      }

      // Validate required fields
      const missingRequired = this.validateRequiredFields(
        fields,
        mapping.fields,
      );
      if (missingRequired.length > 0) {
        this.log("warn", `Skipping entity with missing required fields`, {
          index: i,
          missingFields: missingRequired,
        });
        continue;
      }

      // Map to entity type
      try {
        const entity = mapFunction(fields, i);
        entities.push(entity);
      } catch (error) {
        this.log("warn", `Failed to map entity at index ${i}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return entities;
  }

  /**
   * Extract a value from an object using a simple JSONPath expression
   *
   * Supports basic JSONPath expressions:
   * - $.field - root level field
   * - $.nested.field - nested field
   * - $.array[0] - array index
   * - $.array[*].field - all elements of array (returns array)
   */
  private extractValue(data: unknown, path: string): unknown {
    if (!path || typeof data !== "object" || data === null) {
      return undefined;
    }

    // Remove leading $. if present
    const normalizedPath = path.startsWith("$.") ? path.slice(2) : path;
    if (normalizedPath === "" || normalizedPath === "$") {
      return data;
    }

    const parts = this.parseJsonPath(normalizedPath);
    let current: unknown = data;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }

      if (part === "*") {
        // Wildcard - return all elements if array
        if (Array.isArray(current)) {
          return current;
        }
        return undefined;
      }

      if (typeof part === "number") {
        // Array index
        if (Array.isArray(current)) {
          current = current[part];
        } else {
          return undefined;
        }
      } else {
        // Object property
        if (typeof current === "object" && current !== null) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return undefined;
        }
      }
    }

    return current;
  }

  /**
   * Parse a JSONPath expression into parts
   */
  private parseJsonPath(path: string): (string | number)[] {
    const parts: (string | number)[] = [];
    let current = "";
    let inBracket = false;

    for (let i = 0; i < path.length; i++) {
      const char = path[i];

      if (char === "." && !inBracket) {
        if (current) {
          parts.push(current);
          current = "";
        }
      } else if (char === "[") {
        if (current) {
          parts.push(current);
          current = "";
        }
        inBracket = true;
      } else if (char === "]") {
        if (current === "*") {
          parts.push("*");
        } else {
          const index = parseInt(current, 10);
          if (!isNaN(index)) {
            parts.push(index);
          } else {
            // Could be a quoted string like ['field']
            parts.push(current.replace(/['"]/g, ""));
          }
        }
        current = "";
        inBracket = false;
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  /**
   * Extract a single field value using its mapping
   */
  private extractFieldValue(
    item: unknown,
    fieldMapping: JSONPathFieldMapping,
  ): unknown {
    let value = this.extractValue(item, fieldMapping.path);

    // Apply default if no value
    if (value === undefined || value === null || value === "") {
      value = fieldMapping.defaultValue;
    }

    // Apply transform if specified
    if (value !== undefined && fieldMapping.transform) {
      value = this.applyTransform(value, fieldMapping.transform);
    }

    return value;
  }

  /**
   * Apply a transform to a value
   */
  private applyTransform(
    value: unknown,
    transform: JSONPathTransformType,
  ): unknown {
    const stringValue = String(value);

    switch (transform) {
      case "string":
        return stringValue;

      case "number":
        return parseFloat(stringValue) || 0;

      case "boolean":
        return this.toBoolean(value);

      case "date":
        return new Date(stringValue);

      case "uppercase":
        return stringValue.toUpperCase();

      case "lowercase":
        return stringValue.toLowerCase();

      case "trim":
        return stringValue.trim();

      case "percentage_to_decimal":
        const pct = parseFloat(stringValue) || 0;
        return pct > 1 ? pct / 100 : pct;

      case "cents_to_dollars":
        const cents = parseFloat(stringValue) || 0;
        return cents / 100;

      default:
        return value;
    }
  }

  /**
   * Validate that all required fields have values
   */
  private validateRequiredFields(
    fields: Record<string, unknown>,
    fieldMappings: Record<string, JSONPathFieldMapping>,
  ): string[] {
    const missing: string[] = [];

    for (const [fieldName, mapping] of Object.entries(fieldMappings)) {
      if (mapping.required) {
        const value = fields[fieldName];
        if (value === undefined || value === null || value === "") {
          missing.push(fieldName);
        }
      }
    }

    return missing;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Override buildUrl to use dynamic base URL
   */
  protected override buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    // Use currentBaseUrl instead of static baseUrl
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    let url = `${this.currentBaseUrl}${normalizedPath}`;

    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  /**
   * Set the base URL from config
   */
  private setBaseUrl(config: GenericRESTConnectionConfig): void {
    if (config.mappings.baseUrl) {
      this.currentBaseUrl = config.mappings.baseUrl;
    } else {
      const protocol = config.useSsl ? "https" : "http";
      const port =
        config.port === 443 || config.port === 80 ? "" : `:${config.port}`;
      this.currentBaseUrl = `${protocol}://${config.host}${port}`;
    }
  }

  /**
   * Validate and cast config to Generic REST-specific config
   */
  private validateConfig(
    config: POSConnectionConfig,
  ): GenericRESTConnectionConfig {
    const restConfig = config as GenericRESTConnectionConfig;

    if (!restConfig.mappings) {
      throw new GenericRESTAdapterError(
        "Generic REST mappings are required",
        "MISSING_MAPPINGS",
        undefined,
        false,
      );
    }

    return restConfig;
  }

  /**
   * Check if any mapping is configured
   */
  private hasAnyMapping(mappings: GenericRESTMappings): boolean {
    return !!(
      mappings.departments ||
      mappings.tenderTypes ||
      mappings.cashiers ||
      mappings.taxRates
    );
  }

  /**
   * Convert value to boolean
   */
  private toBoolean(value: unknown, defaultValue: boolean = false): boolean {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    if (typeof value === "boolean") {
      return value;
    }
    const stringValue = String(value).toLowerCase().trim();
    if (["true", "yes", "1", "y", "on", "active"].includes(stringValue)) {
      return true;
    }
    if (["false", "no", "0", "n", "off", "inactive"].includes(stringValue)) {
      return false;
    }
    return defaultValue;
  }

  /**
   * Convert value to number
   */
  private toNumber(value: unknown, defaultValue: number = 0): number {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    if (typeof value === "number") {
      return isNaN(value) ? defaultValue : value;
    }
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Detect minimum age requirement from name or explicit value
   */
  private detectMinimumAge(
    name: string,
    explicitValue?: unknown,
  ): number | undefined {
    if (explicitValue !== undefined && explicitValue !== null) {
      const age = this.toNumber(explicitValue);
      if (age > 0) {
        return age;
      }
    }

    const upperName = name.toUpperCase();

    // Alcohol-related
    if (
      upperName.includes("ALCOHOL") ||
      upperName.includes("BEER") ||
      upperName.includes("WINE") ||
      upperName.includes("LIQUOR") ||
      upperName.includes("SPIRITS")
    ) {
      return 21;
    }

    // Tobacco-related
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
   * Check if name indicates lottery category
   */
  private isLotteryCategory(name: string): boolean {
    const upperName = name.toUpperCase();
    return (
      upperName.includes("LOTTERY") ||
      upperName.includes("LOTTO") ||
      upperName.includes("SCRATCH")
    );
  }

  /**
   * Get error message from error object
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof GenericRESTAdapterError) {
      return error.message;
    }
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
    if (error instanceof GenericRESTAdapterError) {
      return error.errorCode;
    }
    if (error instanceof RestApiError) {
      return error.errorCode;
    }
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("timeout")) {
        return "TIMEOUT";
      }
      if (message.includes("unauthorized") || message.includes("401")) {
        return "AUTH_ERROR";
      }
    }
    return "UNKNOWN_ERROR";
  }

  /**
   * Wrap error with context
   */
  private wrapError(error: unknown, context: string): Error {
    if (error instanceof GenericRESTAdapterError) {
      return new GenericRESTAdapterError(
        `${context}: ${error.message}`,
        error.errorCode,
        error.details,
        error.retryable,
      );
    }
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
