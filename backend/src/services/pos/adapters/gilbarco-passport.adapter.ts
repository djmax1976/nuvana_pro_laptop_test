/**
 * Gilbarco Passport POS Adapter
 *
 * Implements the XML-based Gilbarco Passport protocol for:
 * - Syncing departments (PLU groups)
 * - Syncing tender types (MOP codes)
 * - Syncing cashiers
 * - Syncing tax rates
 *
 * @module services/pos/adapters/gilbarco-passport.adapter
 * @see https://www.gilbarco.com/us/products/point-of-sale/passport
 */

import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { BasePOSAdapter } from "../base-adapter";
import type {
  POSConnectionConfig,
  POSConnectionTestResult,
  POSDepartment,
  POSTenderType,
  POSCashier,
  POSTaxRate,
  POSAdapterCapabilities,
} from "../../../types/pos-integration.types";
import type { POSSystemType } from "@prisma/client";

/**
 * Gilbarco Passport XML response types
 */
interface PassportSystemInfo {
  Version?: string;
  SerialNumber?: string;
  StoreNumber?: string;
  SiteName?: string;
}

interface PassportPLUGroup {
  "@_Code": string;
  Description: string;
  Taxable?: string;
  AgeVerification?: string;
  Active?: string;
  SortOrder?: string;
}

interface PassportMOP {
  "@_Code": string;
  Description: string;
  CashEquivalent?: string;
  Electronic?: string;
  AffectsDrawer?: string;
  RequiresRef?: string;
  Active?: string;
  SortOrder?: string;
}

interface PassportCashier {
  "@_ID": string;
  FirstName: string;
  LastName: string;
  Active?: string;
  EmployeeID?: string;
}

interface PassportTaxRate {
  "@_Code": string;
  Description: string;
  Rate: string;
  Active?: string;
}

interface PassportResponse {
  PassportResponse?: {
    Status?: {
      Code?: string;
      Message?: string;
    };
    SystemInfo?: PassportSystemInfo;
    PLUGroups?: {
      PLUGroup?: PassportPLUGroup | PassportPLUGroup[];
    };
    MOPCodes?: {
      MOP?: PassportMOP | PassportMOP[];
    };
    Cashiers?: {
      Cashier?: PassportCashier | PassportCashier[];
    };
    TaxRates?: {
      Tax?: PassportTaxRate | PassportTaxRate[];
    };
    latencyMs?: number;
  };
}

/**
 * Gilbarco Passport POS Adapter
 *
 * Communicates with Gilbarco Passport POS systems using their
 * proprietary XML-based protocol.
 */
export class GilbarcoPassportAdapter extends BasePOSAdapter {
  readonly posType: POSSystemType = "GILBARCO_PASSPORT";
  readonly displayName = "Gilbarco Passport";

  /**
   * Default API path for Passport
   */
  private readonly apiPath = "/passport/api";

  /**
   * XML parser configuration
   */
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: true,
    trimValues: true,
  });

  /**
   * XML builder configuration
   */
  private readonly builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
  });

  /**
   * Get adapter capabilities
   */
  getCapabilities(): POSAdapterCapabilities {
    return {
      syncDepartments: true,
      syncTenderTypes: true,
      syncCashiers: true,
      syncTaxRates: true,
      syncProducts: false, // Future enhancement
      realTimeTransactions: false, // Future enhancement
      webhookSupport: false,
    };
  }

  /**
   * Test connection to Gilbarco Passport POS
   */
  async testConnection(
    config: POSConnectionConfig,
  ): Promise<POSConnectionTestResult> {
    const startTime = Date.now();

    try {
      const response = await this.sendCommand(config, "GetSystemInfo");

      if (!response.PassportResponse) {
        return {
          success: false,
          message: "Invalid response from POS",
          errorCode: "INVALID_RESPONSE",
        };
      }

      // Check for error status
      if (
        response.PassportResponse.Status?.Code !== "0" &&
        response.PassportResponse.Status?.Code !== "OK"
      ) {
        return {
          success: false,
          message:
            response.PassportResponse.Status?.Message || "Unknown POS error",
          errorCode: response.PassportResponse.Status?.Code,
        };
      }

      const systemInfo = response.PassportResponse.SystemInfo;

      return {
        success: true,
        message: `Connected to ${systemInfo?.SiteName || "Gilbarco Passport"}`,
        posVersion: systemInfo?.Version,
        posSerial: systemInfo?.SerialNumber,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      this.log("error", "Connection test failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection failed",
        latencyMs: Date.now() - startTime,
        errorCode: this.getErrorCode(error),
      };
    }
  }

  /**
   * Sync departments (PLU Groups) from Gilbarco Passport
   */
  async syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]> {
    this.log("info", "Syncing departments from Passport");

    const response = await this.sendCommand(config, "GetPLUGroups");

    if (!response.PassportResponse?.PLUGroups) {
      this.log("warn", "No PLU groups found in response");
      return [];
    }

    const pluGroups = this.ensureArray(
      response.PassportResponse.PLUGroups.PLUGroup,
    );

    const departments: POSDepartment[] = pluGroups.map((group) => ({
      posCode: group["@_Code"],
      displayName: group.Description || `Department ${group["@_Code"]}`,
      isTaxable: group.Taxable === "Y" || group.Taxable === "1",
      minimumAge: group.AgeVerification
        ? parseInt(group.AgeVerification, 10)
        : undefined,
      isLottery: this.isLotteryDepartment(group),
      isActive: group.Active !== "N" && group.Active !== "0",
      sortOrder: group.SortOrder ? parseInt(group.SortOrder, 10) : undefined,
    }));

    this.log("info", `Synced ${departments.length} departments`);
    return departments;
  }

  /**
   * Sync tender types (MOP codes) from Gilbarco Passport
   */
  async syncTenderTypes(config: POSConnectionConfig): Promise<POSTenderType[]> {
    this.log("info", "Syncing tender types from Passport");

    const response = await this.sendCommand(config, "GetMOPCodes");

    if (!response.PassportResponse?.MOPCodes) {
      this.log("warn", "No MOP codes found in response");
      return [];
    }

    const mopCodes = this.ensureArray(response.PassportResponse.MOPCodes.MOP);

    const tenderTypes: POSTenderType[] = mopCodes.map((mop) => ({
      posCode: mop["@_Code"],
      displayName: mop.Description || `Tender ${mop["@_Code"]}`,
      isCashEquivalent:
        mop.CashEquivalent === "Y" || mop.CashEquivalent === "1",
      isElectronic: mop.Electronic === "Y" || mop.Electronic === "1",
      affectsCashDrawer: mop.AffectsDrawer !== "N" && mop.AffectsDrawer !== "0",
      requiresReference: mop.RequiresRef === "Y" || mop.RequiresRef === "1",
      isActive: mop.Active !== "N" && mop.Active !== "0",
      sortOrder: mop.SortOrder ? parseInt(mop.SortOrder, 10) : undefined,
    }));

    this.log("info", `Synced ${tenderTypes.length} tender types`);
    return tenderTypes;
  }

  /**
   * Sync cashiers from Gilbarco Passport
   */
  async syncCashiers(config: POSConnectionConfig): Promise<POSCashier[]> {
    this.log("info", "Syncing cashiers from Passport");

    const response = await this.sendCommand(config, "GetCashiers");

    if (!response.PassportResponse?.Cashiers) {
      this.log("warn", "No cashiers found in response");
      return [];
    }

    const cashierList = this.ensureArray(
      response.PassportResponse.Cashiers.Cashier,
    );

    const cashiers: POSCashier[] = cashierList.map((cashier) => ({
      posCode: cashier["@_ID"],
      firstName: cashier.FirstName || "",
      lastName: cashier.LastName || "",
      isActive: cashier.Active !== "N" && cashier.Active !== "0",
      employeeId: cashier.EmployeeID,
    }));

    this.log("info", `Synced ${cashiers.length} cashiers`);
    return cashiers;
  }

  /**
   * Sync tax rates from Gilbarco Passport
   */
  async syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]> {
    this.log("info", "Syncing tax rates from Passport");

    const response = await this.sendCommand(config, "GetTaxRates");

    if (!response.PassportResponse?.TaxRates) {
      this.log("warn", "No tax rates found in response");
      return [];
    }

    const taxList = this.ensureArray(response.PassportResponse.TaxRates.Tax);

    const taxRates: POSTaxRate[] = taxList.map((tax) => ({
      posCode: tax["@_Code"],
      displayName: tax.Description || `Tax ${tax["@_Code"]}`,
      // Passport returns rate as percentage (e.g., 8.25), convert to decimal (0.0825)
      rate: parseFloat(tax.Rate) / 100,
      isActive: tax.Active !== "N" && tax.Active !== "0",
    }));

    this.log("info", `Synced ${taxRates.length} tax rates`);
    return taxRates;
  }

  /**
   * Send a command to the Gilbarco Passport POS
   */
  private async sendCommand(
    config: POSConnectionConfig,
    command: string,
    params?: Record<string, unknown>,
  ): Promise<PassportResponse> {
    const xmlRequest = this.buildXmlRequest(config, command, params);

    const responseXml = await this.httpRequest(
      config,
      {
        path: this.apiPath,
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
          Accept: "application/xml",
        },
      },
      xmlRequest,
    );

    const parsed = this.parser.parse(responseXml) as PassportResponse;

    // Validate response structure
    if (!parsed.PassportResponse) {
      throw new Error(
        "Invalid Passport response: missing PassportResponse element",
      );
    }

    // Check for error status
    const status = parsed.PassportResponse.Status;
    if (
      status &&
      status.Code !== "0" &&
      status.Code !== "OK" &&
      status.Code !== undefined
    ) {
      throw new Error(
        `Passport error ${status.Code}: ${status.Message || "Unknown error"}`,
      );
    }

    return parsed;
  }

  /**
   * Build XML request for Passport API
   */
  private buildXmlRequest(
    config: POSConnectionConfig,
    command: string,
    params?: Record<string, unknown>,
  ): string {
    // Build authentication section based on credentials type
    const auth = this.buildAuthSection(config);

    const request: Record<string, unknown> = {
      PassportRequest: {
        "@_Version": "1.0",
        Authentication: auth,
        Command: command,
      },
    };

    // Add command parameters if provided
    if (params) {
      (request.PassportRequest as Record<string, unknown>).Parameters = params;
    }

    return this.builder.build(request);
  }

  /**
   * Build authentication section for XML request
   */
  private buildAuthSection(
    config: POSConnectionConfig,
  ): Record<string, unknown> {
    switch (config.credentials.type) {
      case "API_KEY":
        return { APIKey: config.credentials.apiKey };

      case "BASIC_AUTH":
        return {
          Username: config.credentials.username,
          Password: config.credentials.password,
        };

      case "NONE":
        return {};

      default:
        throw new Error(
          `Unsupported authentication type for Passport: ${config.credentials.type}`,
        );
    }
  }

  /**
   * Ensure value is an array (handles single-item XML responses)
   */
  private ensureArray<T>(value: T | T[] | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Check if a PLU group is a lottery department
   */
  private isLotteryDepartment(group: PassportPLUGroup): boolean {
    const code = group["@_Code"].toUpperCase();
    const description = (group.Description || "").toUpperCase();

    return (
      code === "LOTTERY" ||
      code === "LOT" ||
      code === "LOTTO" ||
      description.includes("LOTTERY") ||
      description.includes("LOTTO")
    );
  }

  /**
   * Get error code from exception
   */
  private getErrorCode(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes("timeout")) return "TIMEOUT";
      if (message.includes("econnrefused")) return "CONNECTION_REFUSED";
      if (message.includes("enotfound")) return "HOST_NOT_FOUND";
      if (message.includes("unauthorized") || message.includes("401"))
        return "AUTH_ERROR";
      if (message.includes("403")) return "FORBIDDEN";
    }

    return "UNKNOWN_ERROR";
  }
}
