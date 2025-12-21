/**
 * Generic XML Adapter
 *
 * Configurable adapter for POS systems using custom XML formats.
 * Uses simple path expressions for flexible field mapping, allowing integration
 * with any XML-based POS system without custom adapter development.
 *
 * This adapter uses a simple XML parser approach without external dependencies,
 * converting XML to JSON-like objects for easier traversal.
 *
 * @module services/pos/adapters/generic-xml.adapter
 * @security All credentials are handled securely; XML content is sanitized
 * @see coding-rules: API-001 (Validation), API-003 (Error Handling), LM-001 (Logging)
 */

import type { POSSystemType } from "@prisma/client";
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

// ============================================================================
// XML Path Mapping Types
// ============================================================================

/**
 * Field mapping for extracting a single value from XML
 */
export interface XMLFieldMapping {
  /** Path expression to locate the value (e.g., "Name", "@Code", "Details/Description") */
  path: string;
  /** Default value if path returns no result */
  defaultValue?: string | number | boolean;
  /** Transform function name to apply after extraction */
  transform?: XMLTransformType;
  /** Whether this field is required */
  required?: boolean;
}

/**
 * Supported transform types for field values
 */
export type XMLTransformType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "uppercase"
  | "lowercase"
  | "trim"
  | "percentage_to_decimal";

/**
 * Mapping for an entity type (departments, tenders, etc.)
 */
export interface XMLEntityMapping {
  /** Tag name to select all entity nodes (e.g., "Department", "Item") */
  elementName: string;
  /** Field mappings for each entity */
  fields: Record<string, XMLFieldMapping>;
}

/**
 * Complete mapping configuration for all entity types
 */
export interface GenericXMLMappings {
  /** Mapping for departments */
  departments?: XMLEntityMapping;
  /** Mapping for tender types */
  tenderTypes?: XMLEntityMapping;
  /** Mapping for cashiers */
  cashiers?: XMLEntityMapping;
  /** Mapping for tax rates */
  taxRates?: XMLEntityMapping;
  /** Connection test configuration */
  connectionTest?: {
    /** Element name to look for as success indicator */
    successElement: string;
    /** Expected value (optional) */
    expectedValue?: string;
  };
}

// ============================================================================
// Generic XML Connection Configuration
// ============================================================================

/**
 * Extended configuration for Generic XML connections
 */
export interface GenericXMLConnectionConfig extends POSConnectionConfig {
  /** Field mappings for entity extraction */
  mappings: GenericXMLMappings;
  /** XML encoding (default: UTF-8) */
  encoding?: string;
  /** API endpoint path for XML exchange */
  xmlEndpoint?: string;
  /** Request content type */
  contentType?: string;
}

// ============================================================================
// Parsed XML Types
// ============================================================================

/**
 * Represents a parsed XML element
 */
interface ParsedXMLElement {
  /** Tag name */
  tagName: string;
  /** Attributes */
  attributes: Record<string, string>;
  /** Text content */
  textContent: string;
  /** Child elements */
  children: ParsedXMLElement[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Generic XML adapter error with structured information
 */
export class GenericXMLAdapterError extends Error {
  constructor(
    message: string,
    public readonly errorCode: string,
    public readonly details?: Record<string, unknown>,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "GenericXMLAdapterError";
  }
}

// ============================================================================
// Generic XML Adapter Implementation
// ============================================================================

/**
 * Generic XML Adapter
 *
 * Implements configurable XML parsing for any POS system that uses
 * XML-based data exchange. Configuration is done through element and
 * path mappings that define how to extract entity data from XML documents.
 *
 * Features:
 * - Configurable field mappings for each entity type
 * - Value transformations (type conversion, formatting)
 * - Validation of extracted data
 * - Detailed error reporting
 * - No external dependencies (uses simple XML parsing)
 *
 * @example
 * ```typescript
 * const config: GenericXMLConnectionConfig = {
 *   host: 'pos-server',
 *   port: 443,
 *   useSsl: true,
 *   timeoutMs: 30000,
 *   authType: 'API_KEY',
 *   credentials: { type: 'API_KEY', apiKey: 'xxx' },
 *   xmlEndpoint: '/api/departments',
 *   mappings: {
 *     departments: {
 *       elementName: 'Department',
 *       fields: {
 *         posCode: { path: '@Code', required: true },
 *         displayName: { path: 'Name', required: true },
 *         isTaxable: { path: 'Taxable', transform: 'boolean', defaultValue: true },
 *       }
 *     }
 *   }
 * };
 *
 * const adapter = new GenericXMLAdapter();
 * const departments = await adapter.syncDepartments(config);
 * ```
 */
export class GenericXMLAdapter extends BasePOSAdapter {
  readonly posType: POSSystemType = "GENERIC_XML";
  readonly displayName = "Generic XML";

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
      syncProducts: false,
      realTimeTransactions: false,
      webhookSupport: false,
    };
  }

  // ============================================================================
  // Connection Test
  // ============================================================================

  /**
   * Test connection to the XML-based POS system
   *
   * @param config - Generic XML connection configuration
   * @returns Connection test result
   */
  async testConnection(
    config: POSConnectionConfig,
  ): Promise<POSConnectionTestResult> {
    const startTime = Date.now();
    const xmlConfig = this.validateConfig(config);

    try {
      this.log("info", "Testing Generic XML connection", {
        host: config.host,
        hasMapping: !!xmlConfig.mappings,
      });

      // Validate that at least one mapping is configured
      if (!this.hasAnyMapping(xmlConfig.mappings)) {
        return {
          success: false,
          message: "No XML mappings configured",
          latencyMs: Date.now() - startTime,
          errorCode: "NO_MAPPINGS",
        };
      }

      // Try to fetch data from the endpoint
      const xmlContent = await this.fetchXmlContent(xmlConfig);

      // Parse XML
      const elements = this.parseXml(xmlContent);

      // Run connection test if configured
      if (xmlConfig.mappings.connectionTest) {
        const testElement = this.findElementByName(
          elements,
          xmlConfig.mappings.connectionTest.successElement,
        );

        if (!testElement) {
          return {
            success: false,
            message: `Connection test element "${xmlConfig.mappings.connectionTest.successElement}" not found`,
            latencyMs: Date.now() - startTime,
            errorCode: "CONNECTION_TEST_FAILED",
          };
        }

        // Check expected value if configured
        if (xmlConfig.mappings.connectionTest.expectedValue) {
          const actualValue = testElement.textContent;
          if (actualValue !== xmlConfig.mappings.connectionTest.expectedValue) {
            return {
              success: false,
              message: `Connection test expected "${xmlConfig.mappings.connectionTest.expectedValue}" but got "${actualValue}"`,
              latencyMs: Date.now() - startTime,
              errorCode: "CONNECTION_TEST_VALUE_MISMATCH",
            };
          }
        }
      }

      return {
        success: true,
        message: "Successfully connected to Generic XML source",
        posVersion: "Generic XML Adapter v1",
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      this.log("error", "Generic XML connection test failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        message: this.getErrorMessage(error),
        latencyMs: Date.now() - startTime,
        errorCode: this.getErrorCode(error),
        errorDetails:
          error instanceof GenericXMLAdapterError ? error.details : undefined,
      };
    }
  }

  // ============================================================================
  // Department Sync
  // ============================================================================

  /**
   * Sync departments from XML source
   *
   * @param config - Generic XML connection configuration
   * @returns Array of standardized departments
   */
  async syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]> {
    const xmlConfig = this.validateConfig(config);

    if (!xmlConfig.mappings.departments) {
      this.log("warn", "No department mapping configured");
      return [];
    }

    this.log("info", "Syncing departments from Generic XML");

    try {
      const xmlContent = await this.fetchXmlContent(xmlConfig);
      const elements = this.parseXml(xmlContent);

      const departments = this.extractEntities<POSDepartment>(
        elements,
        xmlConfig.mappings.departments,
        this.mapToDepartment.bind(this),
      );

      this.log(
        "info",
        `Synced ${departments.length} departments from Generic XML`,
      );
      return departments;
    } catch (error) {
      this.log("error", "Failed to sync departments from Generic XML", {
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
      posCode: String(fields.posCode || fields.code || `DEPT_${index}`),
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
   * Sync tender types from XML source
   *
   * @param config - Generic XML connection configuration
   * @returns Array of standardized tender types
   */
  async syncTenderTypes(config: POSConnectionConfig): Promise<POSTenderType[]> {
    const xmlConfig = this.validateConfig(config);

    if (!xmlConfig.mappings.tenderTypes) {
      this.log("warn", "No tender type mapping configured");
      return [];
    }

    this.log("info", "Syncing tender types from Generic XML");

    try {
      const xmlContent = await this.fetchXmlContent(xmlConfig);
      const elements = this.parseXml(xmlContent);

      const tenderTypes = this.extractEntities<POSTenderType>(
        elements,
        xmlConfig.mappings.tenderTypes,
        this.mapToTenderType.bind(this),
      );

      this.log(
        "info",
        `Synced ${tenderTypes.length} tender types from Generic XML`,
      );
      return tenderTypes;
    } catch (error) {
      this.log("error", "Failed to sync tender types from Generic XML", {
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
      posCode: String(fields.posCode || fields.code || `TENDER_${index}`),
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
   * Sync cashiers from XML source
   *
   * @param config - Generic XML connection configuration
   * @returns Array of standardized cashiers
   */
  async syncCashiers(config: POSConnectionConfig): Promise<POSCashier[]> {
    const xmlConfig = this.validateConfig(config);

    if (!xmlConfig.mappings.cashiers) {
      this.log("warn", "No cashier mapping configured");
      return [];
    }

    this.log("info", "Syncing cashiers from Generic XML");

    try {
      const xmlContent = await this.fetchXmlContent(xmlConfig);
      const elements = this.parseXml(xmlContent);

      const cashiers = this.extractEntities<POSCashier>(
        elements,
        xmlConfig.mappings.cashiers,
        this.mapToCashier.bind(this),
      );

      this.log("info", `Synced ${cashiers.length} cashiers from Generic XML`);
      return cashiers;
    } catch (error) {
      this.log("error", "Failed to sync cashiers from Generic XML", {
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
          fields.employeeId ||
          `CASHIER_${index}`,
      ),
      firstName: firstName || "Unknown",
      lastName: lastName,
      isActive: this.toBoolean(fields.isActive, true),
      employeeId: fields.employeeId ? String(fields.employeeId) : undefined,
    };
  }

  // ============================================================================
  // Tax Rate Sync
  // ============================================================================

  /**
   * Sync tax rates from XML source
   *
   * @param config - Generic XML connection configuration
   * @returns Array of standardized tax rates
   */
  async syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]> {
    const xmlConfig = this.validateConfig(config);

    if (!xmlConfig.mappings.taxRates) {
      this.log("warn", "No tax rate mapping configured");
      return [];
    }

    this.log("info", "Syncing tax rates from Generic XML");

    try {
      const xmlContent = await this.fetchXmlContent(xmlConfig);
      const elements = this.parseXml(xmlContent);

      const taxRates = this.extractEntities<POSTaxRate>(
        elements,
        xmlConfig.mappings.taxRates,
        this.mapToTaxRate.bind(this),
      );

      this.log("info", `Synced ${taxRates.length} tax rates from Generic XML`);
      return taxRates;
    } catch (error) {
      this.log("error", "Failed to sync tax rates from Generic XML", {
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
      posCode: String(fields.posCode || fields.code || `TAX_${index}`),
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
  // XML Processing Methods
  // ============================================================================

  /**
   * Fetch XML content from the configured source
   */
  private async fetchXmlContent(
    config: GenericXMLConnectionConfig,
  ): Promise<string> {
    if (!config.xmlEndpoint) {
      throw new GenericXMLAdapterError(
        "No XML endpoint configured",
        "NO_XML_ENDPOINT",
        undefined,
        false,
      );
    }

    const response = await this.httpRequest(config, {
      path: config.xmlEndpoint,
      method: "GET",
      headers: {
        Accept: config.contentType || "application/xml",
      },
    });

    return response;
  }

  /**
   * Parse XML string into a list of elements
   * Uses a simple regex-based parser for basic XML structures
   */
  private parseXml(xmlContent: string): ParsedXMLElement[] {
    const elements: ParsedXMLElement[] = [];

    try {
      // Remove XML declaration and comments
      const cleanedXml = xmlContent
        .replace(/<\?xml[^?]*\?>/g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();

      // Parse top-level and nested elements
      this.parseElements(cleanedXml, elements);

      return elements;
    } catch (error) {
      throw new GenericXMLAdapterError(
        `XML parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "XML_PARSE_ERROR",
        undefined,
        false,
      );
    }
  }

  /**
   * Recursively parse XML elements
   */
  private parseElements(xml: string, results: ParsedXMLElement[]): void {
    // Match opening tags with optional attributes
    const tagPattern = /<([a-zA-Z_][\w.-]*)([^>]*)(?:\/>|>([\s\S]*?)<\/\1>)/g;
    let match: RegExpExecArray | null;

    while ((match = tagPattern.exec(xml)) !== null) {
      const tagName = match[1];
      const attributeString = match[2] || "";
      const innerContent = match[3] || "";

      // Parse attributes
      const attributes: Record<string, string> = {};
      const attrPattern = /([a-zA-Z_][\w.-]*)=["']([^"']*)["']/g;
      let attrMatch: RegExpExecArray | null;

      while ((attrMatch = attrPattern.exec(attributeString)) !== null) {
        attributes[attrMatch[1]] = this.decodeXmlEntities(attrMatch[2]);
      }

      // Parse children
      const children: ParsedXMLElement[] = [];
      if (innerContent && innerContent.includes("<")) {
        this.parseElements(innerContent, children);
      }

      // Get text content (without child elements)
      let textContent = innerContent;
      if (children.length > 0) {
        // Remove child elements to get pure text
        textContent = innerContent
          .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, "")
          .trim();
      }

      results.push({
        tagName,
        attributes,
        textContent: this.decodeXmlEntities(textContent.trim()),
        children,
      });
    }
  }

  /**
   * Decode XML entities
   */
  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  /**
   * Find an element by name (recursive search)
   */
  private findElementByName(
    elements: ParsedXMLElement[],
    name: string,
  ): ParsedXMLElement | undefined {
    for (const element of elements) {
      if (element.tagName === name) {
        return element;
      }
      const found = this.findElementByName(element.children, name);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  /**
   * Find all elements by name (recursive search)
   */
  private findAllElementsByName(
    elements: ParsedXMLElement[],
    name: string,
  ): ParsedXMLElement[] {
    const results: ParsedXMLElement[] = [];

    for (const element of elements) {
      if (element.tagName === name) {
        results.push(element);
      }
      results.push(...this.findAllElementsByName(element.children, name));
    }

    return results;
  }

  /**
   * Extract entities from parsed XML using the provided mapping
   */
  private extractEntities<T>(
    elements: ParsedXMLElement[],
    mapping: XMLEntityMapping,
    mapFunction: (fields: Record<string, unknown>, index: number) => T,
  ): T[] {
    const entities: T[] = [];

    // Find all elements matching the entity element name
    const entityElements = this.findAllElementsByName(
      elements,
      mapping.elementName,
    );

    for (let i = 0; i < entityElements.length; i++) {
      const element = entityElements[i];
      const fields: Record<string, unknown> = {};

      // Extract each field using its path
      for (const [fieldName, fieldMapping] of Object.entries(mapping.fields)) {
        const value = this.extractFieldValue(element, fieldMapping);
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
   * Extract a single field value from an element using the path
   *
   * Path formats:
   * - "ChildElement" - Get text content of child element
   * - "@Attribute" - Get attribute value
   * - "Parent/Child" - Get nested child element text
   * - "@Parent/@Attr" - Get attribute from nested element (simplified)
   */
  private extractFieldValue(
    element: ParsedXMLElement,
    fieldMapping: XMLFieldMapping,
  ): unknown {
    let value: string | undefined;

    const path = fieldMapping.path;

    if (path.startsWith("@")) {
      // Attribute
      const attrName = path.slice(1);
      value = element.attributes[attrName];
    } else if (path.includes("/")) {
      // Nested path
      const parts = path.split("/");
      let current: ParsedXMLElement | undefined = element;

      for (const part of parts) {
        if (!current) break;

        if (part.startsWith("@")) {
          // Attribute of current element
          value = current.attributes[part.slice(1)];
          break;
        } else {
          // Find child element
          current = current.children.find((c) => c.tagName === part);
          if (current) {
            value = current.textContent;
          }
        }
      }
    } else {
      // Simple child element
      const child = element.children.find((c) => c.tagName === path);
      if (child) {
        value = child.textContent;
      } else if (element.tagName === path) {
        value = element.textContent;
      }
    }

    // Apply default if no value
    if (value === undefined || value === null || value === "") {
      return fieldMapping.defaultValue;
    }

    // Apply transform if specified
    if (fieldMapping.transform) {
      return this.applyTransform(value, fieldMapping.transform);
    }

    return value;
  }

  /**
   * Apply a transform to a value
   */
  private applyTransform(value: string, transform: XMLTransformType): unknown {
    switch (transform) {
      case "string":
        return value;

      case "number":
        return parseFloat(value) || 0;

      case "boolean":
        return this.toBoolean(value);

      case "date":
        return new Date(value);

      case "uppercase":
        return value.toUpperCase();

      case "lowercase":
        return value.toLowerCase();

      case "trim":
        return value.trim();

      case "percentage_to_decimal":
        const num = parseFloat(value) || 0;
        return num > 1 ? num / 100 : num;

      default:
        return value;
    }
  }

  /**
   * Validate that all required fields have values
   */
  private validateRequiredFields(
    fields: Record<string, unknown>,
    fieldMappings: Record<string, XMLFieldMapping>,
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
   * Validate and cast config to Generic XML-specific config
   */
  private validateConfig(
    config: POSConnectionConfig,
  ): GenericXMLConnectionConfig {
    const xmlConfig = config as GenericXMLConnectionConfig;

    if (!xmlConfig.mappings) {
      throw new GenericXMLAdapterError(
        "Generic XML mappings are required",
        "MISSING_MAPPINGS",
        undefined,
        false,
      );
    }

    return xmlConfig;
  }

  /**
   * Check if any mapping is configured
   */
  private hasAnyMapping(mappings: GenericXMLMappings): boolean {
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
    if (error instanceof GenericXMLAdapterError) {
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
    if (error instanceof GenericXMLAdapterError) {
      return error.errorCode;
    }
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("timeout")) {
        return "TIMEOUT";
      }
      if (message.includes("parse")) {
        return "PARSE_ERROR";
      }
    }
    return "UNKNOWN_ERROR";
  }

  /**
   * Wrap error with context
   */
  private wrapError(error: unknown, context: string): Error {
    if (error instanceof GenericXMLAdapterError) {
      return new GenericXMLAdapterError(
        `${context}: ${error.message}`,
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
