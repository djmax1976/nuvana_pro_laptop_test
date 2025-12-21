/**
 * NAXML Builder Service
 *
 * Builds NAXML 3.x XML documents from typed TypeScript objects.
 * Generates standards-compliant XML for POS system consumption.
 *
 * @module services/naxml/naxml.builder
 */

import { XMLBuilder } from "fast-xml-parser";
import {
  DEFAULT_NAXML_BUILDER_OPTIONS,
  type NAXMLDocument,
  type NAXMLDocumentType,
  type NAXMLBuilderOptions,
  type NAXMLVersion,
  type NAXMLDepartmentDocument,
  type NAXMLDepartment,
  type NAXMLTenderDocument,
  type NAXMLTenderType,
  type NAXMLTaxRateDocument,
  type NAXMLTaxRate,
  type NAXMLPriceBookDocument,
  type NAXMLPriceBookItem,
  type NAXMLEmployeeDocument,
  type NAXMLEmployee,
  type NAXMLMaintenanceHeader,
  type NAXMLAcknowledgment,
} from "../../types/naxml.types";

// ============================================================================
// Constants
// ============================================================================

/**
 * NAXML XML namespace URIs by version
 */
const NAXML_NAMESPACES: Record<NAXMLVersion, string> = {
  "3.2": "http://www.naxml.org/POSBO/Vocabulary/2003-10-16",
  "3.4": "http://www.naxml.org/POSBO/Vocabulary/2003-10-16",
  "4.0": "http://www.naxml.org/POSBO/Vocabulary/2020-01-01",
};

/**
 * XML declaration string
 */
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

// ============================================================================
// Error Codes
// ============================================================================

export const NAXML_BUILDER_ERROR_CODES = {
  INVALID_DOCUMENT_TYPE: "NAXML_INVALID_DOCUMENT_TYPE",
  MISSING_REQUIRED_DATA: "NAXML_MISSING_REQUIRED_DATA",
  BUILD_ERROR: "NAXML_BUILD_ERROR",
} as const;

export type NAXMLBuilderErrorCode =
  (typeof NAXML_BUILDER_ERROR_CODES)[keyof typeof NAXML_BUILDER_ERROR_CODES];

/**
 * Custom error class for NAXML builder errors
 */
export class NAXMLBuilderError extends Error {
  readonly code: NAXMLBuilderErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: NAXMLBuilderErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "NAXMLBuilderError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, NAXMLBuilderError.prototype);
  }
}

// ============================================================================
// Builder Class
// ============================================================================

/**
 * NAXML Builder
 *
 * Builds NAXML XML documents from typed TypeScript objects.
 * Supports department, tender, tax rate, price book, and employee documents.
 */
export class NAXMLBuilder {
  private readonly options: NAXMLBuilderOptions;
  private readonly builder: XMLBuilder;

  constructor(options: Partial<NAXMLBuilderOptions> = {}) {
    this.options = { ...DEFAULT_NAXML_BUILDER_OPTIONS, ...options };
    this.builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      format: this.options.prettyPrint,
      indentBy: this.options.indent || "  ",
      suppressEmptyNode: true,
      suppressBooleanAttributes: false,
    });
  }

  /**
   * Build an NAXML document from typed data
   *
   * @param document - The document to build
   * @returns XML string
   */
  build<T>(document: NAXMLDocument<T>): string {
    const xmlObj = this.buildDocumentObject(document);
    let xml = this.builder.build(xmlObj);

    if (this.options.includeDeclaration) {
      xml = XML_DECLARATION + (this.options.prettyPrint ? "\n" : "") + xml;
    }

    return xml;
  }

  /**
   * Build a department maintenance document
   */
  buildDepartmentDocument(
    storeLocationId: string,
    departments: NAXMLDepartment[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): string {
    const document: NAXMLDocument<NAXMLDepartmentDocument> = {
      documentType: "DepartmentMaintenance",
      version: this.options.version,
      timestamp: new Date(),
      storeLocationId,
      data: {
        maintenanceHeader: this.createMaintenanceHeader(
          storeLocationId,
          maintenanceType,
        ),
        departments,
      },
    };

    return this.build(document);
  }

  /**
   * Build a tender maintenance document
   */
  buildTenderDocument(
    storeLocationId: string,
    tenders: NAXMLTenderType[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): string {
    const document: NAXMLDocument<NAXMLTenderDocument> = {
      documentType: "TenderMaintenance",
      version: this.options.version,
      timestamp: new Date(),
      storeLocationId,
      data: {
        maintenanceHeader: this.createMaintenanceHeader(
          storeLocationId,
          maintenanceType,
        ),
        tenders,
      },
    };

    return this.build(document);
  }

  /**
   * Build a tax rate maintenance document
   */
  buildTaxRateDocument(
    storeLocationId: string,
    taxRates: NAXMLTaxRate[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): string {
    const document: NAXMLDocument<NAXMLTaxRateDocument> = {
      documentType: "TaxRateMaintenance",
      version: this.options.version,
      timestamp: new Date(),
      storeLocationId,
      data: {
        maintenanceHeader: this.createMaintenanceHeader(
          storeLocationId,
          maintenanceType,
        ),
        taxRates,
      },
    };

    return this.build(document);
  }

  /**
   * Build a price book maintenance document
   */
  buildPriceBookDocument(
    storeLocationId: string,
    items: NAXMLPriceBookItem[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): string {
    const document: NAXMLDocument<NAXMLPriceBookDocument> = {
      documentType: "PriceBookMaintenance",
      version: this.options.version,
      timestamp: new Date(),
      storeLocationId,
      data: {
        maintenanceHeader: this.createMaintenanceHeader(
          storeLocationId,
          maintenanceType,
        ),
        items,
      },
    };

    return this.build(document);
  }

  /**
   * Build an employee maintenance document
   */
  buildEmployeeDocument(
    storeLocationId: string,
    employees: NAXMLEmployee[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): string {
    const document: NAXMLDocument<NAXMLEmployeeDocument> = {
      documentType: "EmployeeMaintenance",
      version: this.options.version,
      timestamp: new Date(),
      storeLocationId,
      data: {
        maintenanceHeader: this.createMaintenanceHeader(
          storeLocationId,
          maintenanceType,
        ),
        employees,
      },
    };

    return this.build(document);
  }

  /**
   * Build an acknowledgment document
   */
  buildAcknowledgment(acknowledgment: NAXMLAcknowledgment): string {
    const document: NAXMLDocument<NAXMLAcknowledgment> = {
      documentType: "Acknowledgment",
      version: this.options.version,
      timestamp: new Date(),
      storeLocationId: "",
      data: acknowledgment,
    };

    return this.build(document);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Create a maintenance header
   */
  private createMaintenanceHeader(
    storeLocationId: string,
    maintenanceType: "Full" | "Incremental",
  ): NAXMLMaintenanceHeader {
    return {
      storeLocationId,
      maintenanceDate: new Date().toISOString(),
      maintenanceType,
    };
  }

  /**
   * Build the XML object structure for a document
   */
  private buildDocumentObject<T>(
    document: NAXMLDocument<T>,
  ): Record<string, unknown> {
    const rootElementName = this.getRootElementName(document.documentType);
    const namespace = NAXML_NAMESPACES[document.version];

    const rootAttributes: Record<string, unknown> = {
      "@_version": document.version,
    };

    if (this.options.includeNamespace) {
      rootAttributes["@_xmlns"] = namespace;
    }

    const content = this.buildDocumentContent(document);

    return {
      [rootElementName]: {
        ...rootAttributes,
        ...content,
      },
    };
  }

  /**
   * Get the root element name for a document type
   */
  private getRootElementName(documentType: NAXMLDocumentType): string {
    const prefix = "NAXML";
    return `${prefix}${documentType}`;
  }

  /**
   * Build document content based on type
   */
  private buildDocumentContent<T>(
    document: NAXMLDocument<T>,
  ): Record<string, unknown> {
    switch (document.documentType) {
      case "DepartmentMaintenance":
        return this.buildDepartmentContent(
          document.data as unknown as NAXMLDepartmentDocument,
        );
      case "TenderMaintenance":
        return this.buildTenderContent(
          document.data as unknown as NAXMLTenderDocument,
        );
      case "TaxRateMaintenance":
        return this.buildTaxRateContent(
          document.data as unknown as NAXMLTaxRateDocument,
        );
      case "PriceBookMaintenance":
        return this.buildPriceBookContent(
          document.data as unknown as NAXMLPriceBookDocument,
        );
      case "EmployeeMaintenance":
        return this.buildEmployeeContent(
          document.data as unknown as NAXMLEmployeeDocument,
        );
      case "Acknowledgment":
        return this.buildAcknowledgmentContent(
          document.data as unknown as NAXMLAcknowledgment,
        );
      default:
        throw new NAXMLBuilderError(
          NAXML_BUILDER_ERROR_CODES.INVALID_DOCUMENT_TYPE,
          `Unsupported document type: ${document.documentType}`,
        );
    }
  }

  /**
   * Build department document content
   */
  private buildDepartmentContent(
    data: NAXMLDepartmentDocument,
  ): Record<string, unknown> {
    return {
      MaintenanceHeader: this.buildMaintenanceHeader(data.maintenanceHeader),
      Departments: {
        Department: data.departments.map((dept) => this.buildDepartment(dept)),
      },
    };
  }

  /**
   * Build tender document content
   */
  private buildTenderContent(
    data: NAXMLTenderDocument,
  ): Record<string, unknown> {
    return {
      MaintenanceHeader: this.buildMaintenanceHeader(data.maintenanceHeader),
      Tenders: {
        Tender: data.tenders.map((tender) => this.buildTender(tender)),
      },
    };
  }

  /**
   * Build tax rate document content
   */
  private buildTaxRateContent(
    data: NAXMLTaxRateDocument,
  ): Record<string, unknown> {
    return {
      MaintenanceHeader: this.buildMaintenanceHeader(data.maintenanceHeader),
      TaxRates: {
        TaxRate: data.taxRates.map((rate) => this.buildTaxRate(rate)),
      },
    };
  }

  /**
   * Build price book document content
   */
  private buildPriceBookContent(
    data: NAXMLPriceBookDocument,
  ): Record<string, unknown> {
    return {
      MaintenanceHeader: this.buildMaintenanceHeader(data.maintenanceHeader),
      Items: {
        Item: data.items.map((item) => this.buildPriceBookItem(item)),
      },
    };
  }

  /**
   * Build employee document content
   */
  private buildEmployeeContent(
    data: NAXMLEmployeeDocument,
  ): Record<string, unknown> {
    return {
      MaintenanceHeader: this.buildMaintenanceHeader(data.maintenanceHeader),
      Employees: {
        Employee: data.employees.map((emp) => this.buildEmployee(emp)),
      },
    };
  }

  /**
   * Build acknowledgment content
   */
  private buildAcknowledgmentContent(
    data: NAXMLAcknowledgment,
  ): Record<string, unknown> {
    const content: Record<string, unknown> = {
      OriginalDocumentID: data.originalDocumentId,
      OriginalDocumentType: data.originalDocumentType,
      Status: data.status,
      Timestamp: data.timestamp,
    };

    if (data.recordsProcessed !== undefined) {
      content.RecordsProcessed = data.recordsProcessed;
    }

    if (data.recordsFailed !== undefined) {
      content.RecordsFailed = data.recordsFailed;
    }

    if (data.errors && data.errors.length > 0) {
      content.Errors = {
        Error: data.errors.map((err) => ({
          ErrorCode: err.errorCode,
          ErrorMessage: err.errorMessage,
          ...(err.lineNumber !== undefined && { LineNumber: err.lineNumber }),
          ...(err.fieldName && { FieldName: err.fieldName }),
          ...(err.rejectedValue && { RejectedValue: err.rejectedValue }),
        })),
      };
    }

    return content;
  }

  /**
   * Build maintenance header
   */
  private buildMaintenanceHeader(
    header: NAXMLMaintenanceHeader,
  ): Record<string, unknown> {
    const content: Record<string, unknown> = {
      StoreLocationID: header.storeLocationId,
      MaintenanceDate: header.maintenanceDate,
      MaintenanceType: header.maintenanceType,
    };

    if (header.effectiveDate) {
      content.EffectiveDate = header.effectiveDate;
    }

    if (header.sequenceNumber !== undefined) {
      content.SequenceNumber = header.sequenceNumber;
    }

    return content;
  }

  /**
   * Build department element
   */
  private buildDepartment(dept: NAXMLDepartment): Record<string, unknown> {
    const element: Record<string, unknown> = {
      "@_Code": dept.departmentCode,
    };

    if (dept.action) {
      element["@_Action"] = dept.action;
    }

    element.Description = dept.description;
    element.IsTaxable = this.boolToYN(dept.isTaxable);

    if (dept.taxRateCode) {
      element.TaxRateCode = dept.taxRateCode;
    }

    if (dept.minimumAge !== undefined && dept.minimumAge > 0) {
      element.MinimumAge = dept.minimumAge;
    }

    element.IsActive = this.boolToYN(dept.isActive);

    if (dept.sortOrder !== undefined) {
      element.SortOrder = dept.sortOrder;
    }

    return element;
  }

  /**
   * Build tender element
   */
  private buildTender(tender: NAXMLTenderType): Record<string, unknown> {
    const element: Record<string, unknown> = {
      "@_Code": tender.tenderCode,
    };

    if (tender.action) {
      element["@_Action"] = tender.action;
    }

    element.Description = tender.description;
    element.IsCashEquivalent = this.boolToYN(tender.isCashEquivalent);
    element.IsElectronic = this.boolToYN(tender.isElectronic);
    element.AffectsCashDrawer = this.boolToYN(tender.affectsCashDrawer);
    element.RequiresReference = this.boolToYN(tender.requiresReference);
    element.IsActive = this.boolToYN(tender.isActive);

    if (tender.sortOrder !== undefined) {
      element.SortOrder = tender.sortOrder;
    }

    if (tender.maxAmount !== undefined) {
      element.MaxAmount = tender.maxAmount;
    }

    if (tender.minAmount !== undefined) {
      element.MinAmount = tender.minAmount;
    }

    return element;
  }

  /**
   * Build tax rate element
   */
  private buildTaxRate(rate: NAXMLTaxRate): Record<string, unknown> {
    const element: Record<string, unknown> = {
      "@_Code": rate.taxRateCode,
    };

    if (rate.action) {
      element["@_Action"] = rate.action;
    }

    element.Description = rate.description;
    element.Rate = rate.rate;
    element.IsActive = this.boolToYN(rate.isActive);

    if (rate.jurisdictionCode) {
      element.JurisdictionCode = rate.jurisdictionCode;
    }

    if (rate.taxType) {
      element.TaxType = rate.taxType;
    }

    if (rate.effectiveDate) {
      element.EffectiveDate = rate.effectiveDate;
    }

    if (rate.expirationDate) {
      element.ExpirationDate = rate.expirationDate;
    }

    return element;
  }

  /**
   * Build price book item element
   */
  private buildPriceBookItem(
    item: NAXMLPriceBookItem,
  ): Record<string, unknown> {
    const element: Record<string, unknown> = {};

    if (item.action) {
      element["@_Action"] = item.action;
    }

    element.ItemCode = item.itemCode;
    element.Description = item.description;

    if (item.shortDescription) {
      element.ShortDescription = item.shortDescription;
    }

    element.DepartmentCode = item.departmentCode;
    element.UnitPrice = item.unitPrice;
    element.TaxRateCode = item.taxRateCode;
    element.IsActive = this.boolToYN(item.isActive);

    if (item.effectiveDate) {
      element.EffectiveDate = item.effectiveDate;
    }

    if (item.expirationDate) {
      element.ExpirationDate = item.expirationDate;
    }

    if (item.minimumAge !== undefined && item.minimumAge > 0) {
      element.MinimumAge = item.minimumAge;
    }

    if (item.foodStampEligible !== undefined) {
      element.FoodStampEligible = this.boolToYN(item.foodStampEligible);
    }

    return element;
  }

  /**
   * Build employee element
   */
  private buildEmployee(emp: NAXMLEmployee): Record<string, unknown> {
    const element: Record<string, unknown> = {
      "@_ID": emp.employeeId,
    };

    if (emp.action) {
      element["@_Action"] = emp.action;
    }

    element.FirstName = emp.firstName;
    element.LastName = emp.lastName;
    element.IsActive = this.boolToYN(emp.isActive);

    if (emp.jobTitle) {
      element.JobTitle = emp.jobTitle;
    }

    if (emp.hireDate) {
      element.HireDate = emp.hireDate;
    }

    if (emp.terminationDate) {
      element.TerminationDate = emp.terminationDate;
    }

    if (emp.accessLevel !== undefined) {
      element.AccessLevel = emp.accessLevel;
    }

    // Note: PIN hash is never included in exports for security reasons

    return element;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Convert boolean to Y/N string
   */
  private boolToYN(value: boolean): string {
    return value ? "Y" : "N";
  }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Create a new NAXML builder instance
 */
export function createNAXMLBuilder(
  options?: Partial<NAXMLBuilderOptions>,
): NAXMLBuilder {
  return new NAXMLBuilder(options);
}

/**
 * Build NAXML XML string from document (convenience function)
 */
export function buildNAXML<T>(
  document: NAXMLDocument<T>,
  options?: Partial<NAXMLBuilderOptions>,
): string {
  const builder = createNAXMLBuilder(options);
  return builder.build(document);
}

/**
 * Build department document (convenience function)
 */
export function buildDepartmentNAXML(
  storeLocationId: string,
  departments: NAXMLDepartment[],
  options?: Partial<NAXMLBuilderOptions>,
): string {
  const builder = createNAXMLBuilder(options);
  return builder.buildDepartmentDocument(storeLocationId, departments);
}

/**
 * Build tender document (convenience function)
 */
export function buildTenderNAXML(
  storeLocationId: string,
  tenders: NAXMLTenderType[],
  options?: Partial<NAXMLBuilderOptions>,
): string {
  const builder = createNAXMLBuilder(options);
  return builder.buildTenderDocument(storeLocationId, tenders);
}

/**
 * Build price book document (convenience function)
 */
export function buildPriceBookNAXML(
  storeLocationId: string,
  items: NAXMLPriceBookItem[],
  options?: Partial<NAXMLBuilderOptions>,
): string {
  const builder = createNAXMLBuilder(options);
  return builder.buildPriceBookDocument(storeLocationId, items);
}
