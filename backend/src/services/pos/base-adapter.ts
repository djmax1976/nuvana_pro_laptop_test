/**
 * Base POS Adapter
 *
 * Abstract base class providing common functionality for POS adapters.
 * All POS-specific adapters should extend this class.
 *
 * @module services/pos/base-adapter
 * @security All outbound connections use TLS by default
 */

import https from "https";
import http from "http";
import type {
  POSAdapter,
  POSConnectionConfig,
  POSConnectionTestResult,
  POSSyncResult,
  POSDepartment,
  POSTenderType,
  POSCashier,
  POSTaxRate,
  POSAdapterCapabilities,
  POSSyncError,
} from "../../types/pos-integration.types";
import type { POSSystemType, POSSyncStatus } from "@prisma/client";

/**
 * HTTP/HTTPS request options
 */
interface HttpRequestOptions {
  hostname: string;
  port: number;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Abstract base class for POS adapters
 *
 * Provides common HTTP/HTTPS request handling, error handling,
 * and logging functionality.
 */
export abstract class BasePOSAdapter implements POSAdapter {
  abstract readonly posType: POSSystemType;
  abstract readonly displayName: string;

  /**
   * Default timeout in milliseconds
   */
  protected readonly defaultTimeoutMs = 30000;

  /**
   * Maximum retry attempts
   */
  protected readonly maxRetries = 3;

  /**
   * Retry delay in milliseconds
   */
  protected readonly retryDelayMs = 1000;

  /**
   * Test connection to POS system
   * Must be implemented by each adapter
   */
  abstract testConnection(
    config: POSConnectionConfig,
  ): Promise<POSConnectionTestResult>;

  /**
   * Sync departments from POS
   * Must be implemented by each adapter
   */
  abstract syncDepartments(
    config: POSConnectionConfig,
  ): Promise<POSDepartment[]>;

  /**
   * Sync tender types from POS
   * Must be implemented by each adapter
   */
  abstract syncTenderTypes(
    config: POSConnectionConfig,
  ): Promise<POSTenderType[]>;

  /**
   * Sync cashiers from POS
   * Must be implemented by each adapter
   */
  abstract syncCashiers(config: POSConnectionConfig): Promise<POSCashier[]>;

  /**
   * Sync tax rates from POS
   * Must be implemented by each adapter
   */
  abstract syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]>;

  /**
   * Get adapter capabilities
   * Override in subclass to customize
   */
  getCapabilities(): POSAdapterCapabilities {
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

  /**
   * Sync all supported entities from POS
   * Calls individual sync methods and aggregates results
   */
  async syncAll(config: POSConnectionConfig): Promise<POSSyncResult> {
    const startTime = Date.now();
    const errors: POSSyncError[] = [];
    let status: POSSyncStatus = "SUCCESS";

    const result: POSSyncResult = {
      success: true,
      status: "SUCCESS",
      durationMs: 0,
      errors: [],
    };

    const capabilities = this.getCapabilities();

    // Sync departments
    if (capabilities.syncDepartments) {
      try {
        const departments = await this.syncDepartments(config);
        result.departments = {
          received: departments.length,
          created: 0, // Will be set by sync service
          updated: 0,
          deactivated: 0,
          errors: [],
        };
      } catch (error) {
        const syncError: POSSyncError = {
          entityType: "department",
          posCode: "*",
          error: error instanceof Error ? error.message : "Unknown error",
          errorCode: "SYNC_FAILED",
        };
        errors.push(syncError);
        status = "PARTIAL_SUCCESS";
      }
    }

    // Sync tender types
    if (capabilities.syncTenderTypes) {
      try {
        const tenderTypes = await this.syncTenderTypes(config);
        result.tenderTypes = {
          received: tenderTypes.length,
          created: 0,
          updated: 0,
          deactivated: 0,
          errors: [],
        };
      } catch (error) {
        const syncError: POSSyncError = {
          entityType: "tender_type",
          posCode: "*",
          error: error instanceof Error ? error.message : "Unknown error",
          errorCode: "SYNC_FAILED",
        };
        errors.push(syncError);
        status = "PARTIAL_SUCCESS";
      }
    }

    // Sync cashiers
    if (capabilities.syncCashiers) {
      try {
        const cashiers = await this.syncCashiers(config);
        result.cashiers = {
          received: cashiers.length,
          created: 0,
          updated: 0,
          deactivated: 0,
          errors: [],
        };
      } catch (error) {
        const syncError: POSSyncError = {
          entityType: "cashier",
          posCode: "*",
          error: error instanceof Error ? error.message : "Unknown error",
          errorCode: "SYNC_FAILED",
        };
        errors.push(syncError);
        status = "PARTIAL_SUCCESS";
      }
    }

    // Sync tax rates
    if (capabilities.syncTaxRates) {
      try {
        const taxRates = await this.syncTaxRates(config);
        result.taxRates = {
          received: taxRates.length,
          created: 0,
          updated: 0,
          deactivated: 0,
          errors: [],
        };
      } catch (error) {
        const syncError: POSSyncError = {
          entityType: "tax_rate",
          posCode: "*",
          error: error instanceof Error ? error.message : "Unknown error",
          errorCode: "SYNC_FAILED",
        };
        errors.push(syncError);
        status = "PARTIAL_SUCCESS";
      }
    }

    // Check if all syncs failed
    if (
      errors.length > 0 &&
      !result.departments &&
      !result.tenderTypes &&
      !result.cashiers &&
      !result.taxRates
    ) {
      status = "FAILED";
      result.success = false;
    }

    result.status = status;
    result.durationMs = Date.now() - startTime;
    result.errors = errors;

    return result;
  }

  /**
   * Make HTTP/HTTPS request to POS system
   * Handles retries, timeouts, and error responses
   *
   * @param config Connection configuration
   * @param options HTTP request options
   * @param body Request body (for POST/PUT)
   * @returns Response body as string
   */
  protected async httpRequest(
    config: POSConnectionConfig,
    options: Omit<HttpRequestOptions, "hostname" | "port" | "timeout">,
    body?: string,
  ): Promise<string> {
    const requestOptions: HttpRequestOptions = {
      ...options,
      hostname: config.host,
      port: config.port,
      timeout: config.timeoutMs || this.defaultTimeoutMs,
    };

    // Add authentication headers
    const headers = await this.buildAuthHeaders(config);
    requestOptions.headers = { ...requestOptions.headers, ...headers };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.executeRequest(config.useSsl, requestOptions, body);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw lastError;
        }

        // Log retry attempt
        console.warn(
          `[${this.posType}] Request failed (attempt ${attempt}/${this.maxRetries}):`,
          lastError.message,
        );

        // Wait before retry (with exponential backoff)
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelayMs * Math.pow(2, attempt - 1));
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  /**
   * Execute a single HTTP/HTTPS request
   */
  private executeRequest(
    useSsl: boolean,
    options: HttpRequestOptions,
    body?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = useSsl ? https : http;

      const req = protocol.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          // Check for HTTP errors
          if (res.statusCode && res.statusCode >= 400) {
            const error = new Error(
              `HTTP ${res.statusCode}: ${res.statusMessage || "Unknown error"}`,
            );
            (error as any).statusCode = res.statusCode;
            (error as any).response = data;
            reject(error);
            return;
          }

          resolve(data);
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Request timeout after ${options.timeout}ms`));
      });

      // Send body if present
      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  /**
   * Build authentication headers based on auth type
   */
  protected async buildAuthHeaders(
    config: POSConnectionConfig,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    switch (config.credentials.type) {
      case "API_KEY": {
        const headerName = config.credentials.headerName || "X-API-Key";
        headers[headerName] = config.credentials.apiKey;
        break;
      }

      case "BASIC_AUTH": {
        const auth = Buffer.from(
          `${config.credentials.username}:${config.credentials.password}`,
        ).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
        break;
      }

      case "OAUTH2": {
        // If we have a valid cached token, use it
        if (
          config.credentials.accessToken &&
          config.credentials.tokenExpiresAt &&
          config.credentials.tokenExpiresAt > new Date()
        ) {
          headers["Authorization"] = `Bearer ${config.credentials.accessToken}`;
        } else {
          // Token refresh should be handled by the sync service
          throw new Error("OAuth2 token expired or not available");
        }
        break;
      }

      case "CERTIFICATE":
        // Certificate auth is handled at the TLS layer
        break;

      case "NONE":
        // No authentication headers needed
        break;
    }

    return headers;
  }

  /**
   * Check if an error is non-retryable
   */
  private isNonRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Don't retry authentication errors
      if (
        message.includes("401") ||
        message.includes("403") ||
        message.includes("unauthorized")
      ) {
        return true;
      }

      // Don't retry client errors (4xx except 408, 429)
      if ("statusCode" in error) {
        const statusCode = (error as any).statusCode;
        if (
          statusCode >= 400 &&
          statusCode < 500 &&
          statusCode !== 408 &&
          statusCode !== 429
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Delay execution
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Log adapter activity
   */
  protected log(
    level: "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const prefix = `[POS:${this.posType}]`;
    const logData = data ? JSON.stringify(data) : "";

    switch (level) {
      case "info":
        console.log(`${prefix} ${message}`, logData);
        break;
      case "warn":
        console.warn(`${prefix} ${message}`, logData);
        break;
      case "error":
        console.error(`${prefix} ${message}`, logData);
        break;
    }
  }

  /**
   * Sanitize credentials for logging
   * Removes sensitive information from credentials object
   */
  protected sanitizeCredentials(
    credentials: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(credentials)) {
      if (
        key.toLowerCase().includes("password") ||
        key.toLowerCase().includes("secret") ||
        key.toLowerCase().includes("key") ||
        key.toLowerCase().includes("token")
      ) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
