/**
 * NAXML Validator Service
 *
 * Validates NAXML documents against business rules and schema requirements.
 * Provides comprehensive validation with detailed error reporting.
 *
 * @module services/naxml/naxml.validator
 */

import type {
  NAXMLDocument,
  NAXMLValidationResult,
  NAXMLValidationError,
  NAXMLValidationWarning,
  NAXMLTransactionDocument,
  NAXMLDepartmentDocument,
  NAXMLTenderDocument,
  NAXMLTaxRateDocument,
  NAXMLPriceBookDocument,
  NAXMLEmployeeDocument,
} from "../../types/naxml.types";

// ============================================================================
// Validation Error Codes
// ============================================================================

export const VALIDATION_ERROR_CODES = {
  // Structure errors
  MISSING_REQUIRED_FIELD: "NAXML_MISSING_REQUIRED_FIELD",
  INVALID_FIELD_TYPE: "NAXML_INVALID_FIELD_TYPE",
  INVALID_FIELD_VALUE: "NAXML_INVALID_FIELD_VALUE",
  INVALID_FIELD_LENGTH: "NAXML_INVALID_FIELD_LENGTH",
  INVALID_FIELD_FORMAT: "NAXML_INVALID_FIELD_FORMAT",

  // Business rule errors
  INVALID_DEPARTMENT_CODE: "NAXML_INVALID_DEPARTMENT_CODE",
  INVALID_TENDER_CODE: "NAXML_INVALID_TENDER_CODE",
  INVALID_TAX_RATE: "NAXML_INVALID_TAX_RATE",
  INVALID_QUANTITY: "NAXML_INVALID_QUANTITY",
  INVALID_PRICE: "NAXML_INVALID_PRICE",
  INVALID_AMOUNT: "NAXML_INVALID_AMOUNT",
  INVALID_DATE: "NAXML_INVALID_DATE",
  INVALID_DATE_RANGE: "NAXML_INVALID_DATE_RANGE",

  // Reference errors
  UNKNOWN_DEPARTMENT: "NAXML_UNKNOWN_DEPARTMENT",
  UNKNOWN_TENDER: "NAXML_UNKNOWN_TENDER",
  UNKNOWN_TAX_CODE: "NAXML_UNKNOWN_TAX_CODE",
  UNKNOWN_EMPLOYEE: "NAXML_UNKNOWN_EMPLOYEE",

  // Integrity errors
  DUPLICATE_CODE: "NAXML_DUPLICATE_CODE",
  TOTALS_MISMATCH: "NAXML_TOTALS_MISMATCH",
  LINE_TOTAL_MISMATCH: "NAXML_LINE_TOTAL_MISMATCH",
  TAX_CALCULATION_ERROR: "NAXML_TAX_CALCULATION_ERROR",
} as const;

export type ValidationErrorCode =
  (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES];

// ============================================================================
// Validation Options
// ============================================================================

export interface NAXMLValidationOptions {
  /** Validate totals and calculations */
  validateTotals: boolean;
  /** Validate references exist (e.g., department codes) */
  validateReferences: boolean;
  /** Check for duplicate codes */
  checkDuplicates: boolean;
  /** Validate date formats */
  validateDates: boolean;
  /** Maximum allowed variance for calculations (default: 0.01) */
  calculationTolerance: number;
  /** Known department codes for reference validation */
  knownDepartmentCodes?: string[];
  /** Known tender codes for reference validation */
  knownTenderCodes?: string[];
  /** Known tax codes for reference validation */
  knownTaxCodes?: string[];
  /** Strict mode - treat warnings as errors */
  strictMode: boolean;
}

const DEFAULT_VALIDATION_OPTIONS: NAXMLValidationOptions = {
  validateTotals: true,
  validateReferences: false,
  checkDuplicates: true,
  validateDates: true,
  calculationTolerance: 0.01,
  strictMode: false,
};

// ============================================================================
// Validator Class
// ============================================================================

/**
 * NAXML Validator
 *
 * Validates NAXML documents for structural correctness and business rules.
 */
export class NAXMLValidator {
  private readonly options: NAXMLValidationOptions;

  constructor(options: Partial<NAXMLValidationOptions> = {}) {
    this.options = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
  }

  /**
   * Validate an NAXML document
   */
  validate<T>(document: NAXMLDocument<T>): NAXMLValidationResult {
    const errors: NAXMLValidationError[] = [];
    const warnings: NAXMLValidationWarning[] = [];

    // Basic document validation
    this.validateDocumentStructure(document, errors);

    // Type-specific validation
    switch (document.documentType) {
      case "TransactionDocument":
        this.validateTransaction(
          document.data as unknown as NAXMLTransactionDocument,
          errors,
          warnings,
        );
        break;
      case "DepartmentMaintenance":
        this.validateDepartments(
          document.data as unknown as NAXMLDepartmentDocument,
          errors,
          warnings,
        );
        break;
      case "TenderMaintenance":
        this.validateTenders(
          document.data as unknown as NAXMLTenderDocument,
          errors,
          warnings,
        );
        break;
      case "TaxRateMaintenance":
        this.validateTaxRates(
          document.data as unknown as NAXMLTaxRateDocument,
          errors,
          warnings,
        );
        break;
      case "PriceBookMaintenance":
        this.validatePriceBook(
          document.data as unknown as NAXMLPriceBookDocument,
          errors,
          warnings,
        );
        break;
      case "EmployeeMaintenance":
        this.validateEmployees(
          document.data as unknown as NAXMLEmployeeDocument,
          errors,
          warnings,
        );
        break;
    }

    return {
      isValid: errors.length === 0,
      documentType: document.documentType,
      version: document.version,
      errors,
      warnings,
    };
  }

  /**
   * Quick validation - checks only structure without business rules
   */
  quickValidate<T>(document: NAXMLDocument<T>): boolean {
    const errors: NAXMLValidationError[] = [];
    this.validateDocumentStructure(document, errors);
    return errors.length === 0;
  }

  // ============================================================================
  // Private Validation Methods
  // ============================================================================

  /**
   * Validate basic document structure
   */
  private validateDocumentStructure<T>(
    document: NAXMLDocument<T>,
    errors: NAXMLValidationError[],
  ): void {
    if (!document.documentType) {
      errors.push({
        code: VALIDATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: "Document type is required",
        severity: "critical",
        path: "documentType",
      });
    }

    if (!document.version) {
      errors.push({
        code: VALIDATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: "Document version is required",
        severity: "critical",
        path: "version",
      });
    }

    if (!document.data) {
      errors.push({
        code: VALIDATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: "Document data is required",
        severity: "critical",
        path: "data",
      });
    }

    // Version validation
    if (
      document.version &&
      !["3.2", "3.4", "4.0"].includes(document.version as string)
    ) {
      errors.push({
        code: VALIDATION_ERROR_CODES.INVALID_FIELD_VALUE,
        message: `Unsupported NAXML version: ${document.version}`,
        severity: "error",
        path: "version",
      });
    }
  }

  /**
   * Validate transaction document
   */
  private validateTransaction(
    data: NAXMLTransactionDocument,
    errors: NAXMLValidationError[],
    warnings: NAXMLValidationWarning[],
  ): void {
    // Header validation
    const header = data.transactionHeader;
    if (!header) {
      errors.push({
        code: VALIDATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: "Transaction header is required",
        severity: "critical",
        path: "transactionHeader",
      });
      return;
    }

    this.validateRequiredField(
      header.transactionId,
      "transactionId",
      "TransactionHeader",
      errors,
    );
    this.validateRequiredField(
      header.storeLocationId,
      "storeLocationId",
      "TransactionHeader",
      errors,
    );
    this.validateRequiredField(
      header.terminalId,
      "terminalId",
      "TransactionHeader",
      errors,
    );

    // Validate dates
    if (this.options.validateDates) {
      this.validateDateString(
        header.businessDate,
        "businessDate",
        "TransactionHeader",
        errors,
      );
      this.validateDateString(
        header.transactionDate,
        "transactionDate",
        "TransactionHeader",
        errors,
      );
    }

    // Validate line items
    if (data.transactionDetail && data.transactionDetail.length > 0) {
      let calculatedSubtotal = 0;
      let calculatedTax = 0;

      for (let i = 0; i < data.transactionDetail.length; i++) {
        const line = data.transactionDetail[i];
        const linePath = `transactionDetail[${i}]`;

        // Required fields
        this.validateRequiredField(line.itemCode, "itemCode", linePath, errors);
        this.validateRequiredField(
          line.departmentCode,
          "departmentCode",
          linePath,
          errors,
        );

        // Numeric validation
        if (line.quantity <= 0 && !line.isVoid && !line.isRefund) {
          warnings.push({
            code: VALIDATION_ERROR_CODES.INVALID_QUANTITY,
            message: `Line ${i + 1}: Quantity should be greater than 0`,
            path: `${linePath}.quantity`,
          });
        }

        if (line.unitPrice < 0) {
          errors.push({
            code: VALIDATION_ERROR_CODES.INVALID_PRICE,
            message: `Line ${i + 1}: Unit price cannot be negative`,
            severity: "error",
            path: `${linePath}.unitPrice`,
          });
        }

        // Extended price calculation
        if (this.options.validateTotals) {
          const expectedExtended = this.round(line.quantity * line.unitPrice);
          if (
            Math.abs(line.extendedPrice - expectedExtended) >
            this.options.calculationTolerance
          ) {
            warnings.push({
              code: VALIDATION_ERROR_CODES.LINE_TOTAL_MISMATCH,
              message: `Line ${i + 1}: Extended price (${line.extendedPrice}) doesn't match calculated (${expectedExtended})`,
              path: `${linePath}.extendedPrice`,
            });
          }
        }

        calculatedSubtotal += line.extendedPrice;
        calculatedTax += line.taxAmount;

        // Reference validation
        if (this.options.validateReferences) {
          if (
            this.options.knownDepartmentCodes &&
            !this.options.knownDepartmentCodes.includes(line.departmentCode)
          ) {
            warnings.push({
              code: VALIDATION_ERROR_CODES.UNKNOWN_DEPARTMENT,
              message: `Line ${i + 1}: Unknown department code: ${line.departmentCode}`,
              path: `${linePath}.departmentCode`,
            });
          }
        }
      }

      // Total validation
      if (this.options.validateTotals && data.transactionTotal) {
        const total = data.transactionTotal;

        if (
          Math.abs(total.subtotal - calculatedSubtotal) >
          this.options.calculationTolerance
        ) {
          warnings.push({
            code: VALIDATION_ERROR_CODES.TOTALS_MISMATCH,
            message: `Subtotal (${total.subtotal}) doesn't match line items total (${calculatedSubtotal})`,
            path: "transactionTotal.subtotal",
          });
        }

        if (
          Math.abs(total.taxTotal - calculatedTax) >
          this.options.calculationTolerance
        ) {
          warnings.push({
            code: VALIDATION_ERROR_CODES.TAX_CALCULATION_ERROR,
            message: `Tax total (${total.taxTotal}) doesn't match line items tax (${calculatedTax})`,
            path: "transactionTotal.taxTotal",
          });
        }

        const expectedGrandTotal = total.subtotal + total.taxTotal;
        if (
          Math.abs(total.grandTotal - expectedGrandTotal) >
          this.options.calculationTolerance
        ) {
          warnings.push({
            code: VALIDATION_ERROR_CODES.TOTALS_MISMATCH,
            message: `Grand total (${total.grandTotal}) doesn't match subtotal + tax (${expectedGrandTotal})`,
            path: "transactionTotal.grandTotal",
          });
        }
      }
    }

    // Validate tenders
    if (data.transactionTender) {
      let totalTendered = 0;

      for (let i = 0; i < data.transactionTender.length; i++) {
        const tender = data.transactionTender[i];
        const tenderPath = `transactionTender[${i}]`;

        this.validateRequiredField(
          tender.tenderCode,
          "tenderCode",
          tenderPath,
          errors,
        );

        if (tender.amount < 0) {
          warnings.push({
            code: VALIDATION_ERROR_CODES.INVALID_AMOUNT,
            message: `Tender ${i + 1}: Amount should not be negative`,
            path: `${tenderPath}.amount`,
          });
        }

        totalTendered += tender.amount;

        if (this.options.validateReferences) {
          if (
            this.options.knownTenderCodes &&
            !this.options.knownTenderCodes.includes(tender.tenderCode)
          ) {
            warnings.push({
              code: VALIDATION_ERROR_CODES.UNKNOWN_TENDER,
              message: `Tender ${i + 1}: Unknown tender code: ${tender.tenderCode}`,
              path: `${tenderPath}.tenderCode`,
            });
          }
        }
      }

      // Verify tender total matches grand total
      if (
        this.options.validateTotals &&
        data.transactionTotal &&
        data.transactionTender.length > 0
      ) {
        const grandTotal = data.transactionTotal.grandTotal;
        if (
          Math.abs(totalTendered - grandTotal) >
          this.options.calculationTolerance
        ) {
          const changeDue = data.transactionTotal.changeDue || 0;
          const adjustedTotal = totalTendered - changeDue;
          if (
            Math.abs(adjustedTotal - grandTotal) >
            this.options.calculationTolerance
          ) {
            warnings.push({
              code: VALIDATION_ERROR_CODES.TOTALS_MISMATCH,
              message: `Total tendered (${totalTendered}) doesn't match transaction total (${grandTotal})`,
              path: "transactionTender",
            });
          }
        }
      }
    }
  }

  /**
   * Validate department document
   */
  private validateDepartments(
    data: NAXMLDepartmentDocument,
    errors: NAXMLValidationError[],
    warnings: NAXMLValidationWarning[],
  ): void {
    if (!data.departments || data.departments.length === 0) {
      warnings.push({
        code: VALIDATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: "No departments found in document",
        path: "departments",
      });
      return;
    }

    const seenCodes = new Set<string>();

    for (let i = 0; i < data.departments.length; i++) {
      const dept = data.departments[i];
      const path = `departments[${i}]`;

      // Required fields
      this.validateRequiredField(
        dept.departmentCode,
        "departmentCode",
        path,
        errors,
      );
      this.validateRequiredField(dept.description, "description", path, errors);

      // Code format validation
      if (dept.departmentCode) {
        if (dept.departmentCode.length > 20) {
          errors.push({
            code: VALIDATION_ERROR_CODES.INVALID_FIELD_LENGTH,
            message: `Department ${i + 1}: Code exceeds maximum length of 20 characters`,
            severity: "error",
            path: `${path}.departmentCode`,
          });
        }

        // Duplicate check
        if (this.options.checkDuplicates) {
          if (seenCodes.has(dept.departmentCode)) {
            errors.push({
              code: VALIDATION_ERROR_CODES.DUPLICATE_CODE,
              message: `Duplicate department code: ${dept.departmentCode}`,
              severity: "error",
              path: `${path}.departmentCode`,
            });
          }
          seenCodes.add(dept.departmentCode);
        }
      }

      // Minimum age validation
      if (dept.minimumAge !== undefined) {
        if (dept.minimumAge < 0 || dept.minimumAge > 99) {
          warnings.push({
            code: VALIDATION_ERROR_CODES.INVALID_FIELD_VALUE,
            message: `Department ${i + 1}: Minimum age should be between 0 and 99`,
            path: `${path}.minimumAge`,
          });
        }
      }

      // Tax rate reference
      if (dept.isTaxable && !dept.taxRateCode) {
        warnings.push({
          code: VALIDATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
          message: `Department ${i + 1}: Taxable department should have a tax rate code`,
          path: `${path}.taxRateCode`,
        });
      }
    }
  }

  /**
   * Validate tender document
   */
  private validateTenders(
    data: NAXMLTenderDocument,
    errors: NAXMLValidationError[],
    warnings: NAXMLValidationWarning[],
  ): void {
    if (!data.tenders || data.tenders.length === 0) {
      warnings.push({
        code: VALIDATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: "No tender types found in document",
        path: "tenders",
      });
      return;
    }

    const seenCodes = new Set<string>();

    for (let i = 0; i < data.tenders.length; i++) {
      const tender = data.tenders[i];
      const path = `tenders[${i}]`;

      // Required fields
      this.validateRequiredField(tender.tenderCode, "tenderCode", path, errors);
      this.validateRequiredField(
        tender.description,
        "description",
        path,
        errors,
      );

      // Code format
      if (tender.tenderCode) {
        if (tender.tenderCode.length > 20) {
          errors.push({
            code: VALIDATION_ERROR_CODES.INVALID_FIELD_LENGTH,
            message: `Tender ${i + 1}: Code exceeds maximum length of 20 characters`,
            severity: "error",
            path: `${path}.tenderCode`,
          });
        }

        // Duplicate check
        if (this.options.checkDuplicates) {
          if (seenCodes.has(tender.tenderCode)) {
            errors.push({
              code: VALIDATION_ERROR_CODES.DUPLICATE_CODE,
              message: `Duplicate tender code: ${tender.tenderCode}`,
              severity: "error",
              path: `${path}.tenderCode`,
            });
          }
          seenCodes.add(tender.tenderCode);
        }
      }

      // Amount range validation
      if (tender.minAmount !== undefined && tender.maxAmount !== undefined) {
        if (tender.minAmount > tender.maxAmount) {
          errors.push({
            code: VALIDATION_ERROR_CODES.INVALID_FIELD_VALUE,
            message: `Tender ${i + 1}: Minimum amount cannot exceed maximum amount`,
            severity: "error",
            path: `${path}.minAmount`,
          });
        }
      }
    }
  }

  /**
   * Validate tax rate document
   */
  private validateTaxRates(
    data: NAXMLTaxRateDocument,
    errors: NAXMLValidationError[],
    warnings: NAXMLValidationWarning[],
  ): void {
    if (!data.taxRates || data.taxRates.length === 0) {
      warnings.push({
        code: VALIDATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: "No tax rates found in document",
        path: "taxRates",
      });
      return;
    }

    const seenCodes = new Set<string>();

    for (let i = 0; i < data.taxRates.length; i++) {
      const rate = data.taxRates[i];
      const path = `taxRates[${i}]`;

      // Required fields
      this.validateRequiredField(rate.taxRateCode, "taxRateCode", path, errors);
      this.validateRequiredField(rate.description, "description", path, errors);

      // Rate validation
      if (rate.rate < 0) {
        errors.push({
          code: VALIDATION_ERROR_CODES.INVALID_TAX_RATE,
          message: `Tax rate ${i + 1}: Rate cannot be negative`,
          severity: "error",
          path: `${path}.rate`,
        });
      }

      if (rate.rate > 1) {
        warnings.push({
          code: VALIDATION_ERROR_CODES.INVALID_TAX_RATE,
          message: `Tax rate ${i + 1}: Rate ${rate.rate} appears to be a percentage (should be decimal, e.g., 0.0825 for 8.25%)`,
          path: `${path}.rate`,
        });
      }

      // Duplicate check
      if (this.options.checkDuplicates && rate.taxRateCode) {
        if (seenCodes.has(rate.taxRateCode)) {
          errors.push({
            code: VALIDATION_ERROR_CODES.DUPLICATE_CODE,
            message: `Duplicate tax rate code: ${rate.taxRateCode}`,
            severity: "error",
            path: `${path}.taxRateCode`,
          });
        }
        seenCodes.add(rate.taxRateCode);
      }

      // Date range validation
      if (
        this.options.validateDates &&
        rate.effectiveDate &&
        rate.expirationDate
      ) {
        const effective = new Date(rate.effectiveDate);
        const expiration = new Date(rate.expirationDate);
        if (expiration <= effective) {
          errors.push({
            code: VALIDATION_ERROR_CODES.INVALID_DATE_RANGE,
            message: `Tax rate ${i + 1}: Expiration date must be after effective date`,
            severity: "error",
            path: `${path}.expirationDate`,
          });
        }
      }
    }
  }

  /**
   * Validate price book document
   */
  private validatePriceBook(
    data: NAXMLPriceBookDocument,
    errors: NAXMLValidationError[],
    warnings: NAXMLValidationWarning[],
  ): void {
    if (!data.items || data.items.length === 0) {
      warnings.push({
        code: VALIDATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: "No items found in price book",
        path: "items",
      });
      return;
    }

    const seenCodes = new Set<string>();

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const path = `items[${i}]`;

      // Required fields
      this.validateRequiredField(item.itemCode, "itemCode", path, errors);
      this.validateRequiredField(item.description, "description", path, errors);
      this.validateRequiredField(
        item.departmentCode,
        "departmentCode",
        path,
        errors,
      );
      this.validateRequiredField(item.taxRateCode, "taxRateCode", path, errors);

      // Price validation
      if (item.unitPrice < 0) {
        errors.push({
          code: VALIDATION_ERROR_CODES.INVALID_PRICE,
          message: `Item ${i + 1}: Unit price cannot be negative`,
          severity: "error",
          path: `${path}.unitPrice`,
        });
      }

      // Cost validation
      if (item.costPrice !== undefined && item.costPrice < 0) {
        errors.push({
          code: VALIDATION_ERROR_CODES.INVALID_PRICE,
          message: `Item ${i + 1}: Cost price cannot be negative`,
          severity: "error",
          path: `${path}.costPrice`,
        });
      }

      // Duplicate check
      if (this.options.checkDuplicates && item.itemCode) {
        if (seenCodes.has(item.itemCode)) {
          errors.push({
            code: VALIDATION_ERROR_CODES.DUPLICATE_CODE,
            message: `Duplicate item code: ${item.itemCode}`,
            severity: "error",
            path: `${path}.itemCode`,
          });
        }
        seenCodes.add(item.itemCode);
      }

      // Reference validation
      if (this.options.validateReferences) {
        if (
          this.options.knownDepartmentCodes &&
          !this.options.knownDepartmentCodes.includes(item.departmentCode)
        ) {
          warnings.push({
            code: VALIDATION_ERROR_CODES.UNKNOWN_DEPARTMENT,
            message: `Item ${i + 1}: Unknown department code: ${item.departmentCode}`,
            path: `${path}.departmentCode`,
          });
        }

        if (
          this.options.knownTaxCodes &&
          !this.options.knownTaxCodes.includes(item.taxRateCode)
        ) {
          warnings.push({
            code: VALIDATION_ERROR_CODES.UNKNOWN_TAX_CODE,
            message: `Item ${i + 1}: Unknown tax code: ${item.taxRateCode}`,
            path: `${path}.taxRateCode`,
          });
        }
      }
    }
  }

  /**
   * Validate employee document
   */
  private validateEmployees(
    data: NAXMLEmployeeDocument,
    errors: NAXMLValidationError[],
    warnings: NAXMLValidationWarning[],
  ): void {
    if (!data.employees || data.employees.length === 0) {
      warnings.push({
        code: VALIDATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: "No employees found in document",
        path: "employees",
      });
      return;
    }

    const seenIds = new Set<string>();

    for (let i = 0; i < data.employees.length; i++) {
      const emp = data.employees[i];
      const path = `employees[${i}]`;

      // Required fields
      this.validateRequiredField(emp.employeeId, "employeeId", path, errors);
      this.validateRequiredField(emp.firstName, "firstName", path, errors);
      this.validateRequiredField(emp.lastName, "lastName", path, errors);

      // Duplicate check
      if (this.options.checkDuplicates && emp.employeeId) {
        if (seenIds.has(emp.employeeId)) {
          errors.push({
            code: VALIDATION_ERROR_CODES.DUPLICATE_CODE,
            message: `Duplicate employee ID: ${emp.employeeId}`,
            severity: "error",
            path: `${path}.employeeId`,
          });
        }
        seenIds.add(emp.employeeId);
      }

      // Date validation
      if (this.options.validateDates) {
        if (emp.hireDate) {
          this.validateDateString(emp.hireDate, "hireDate", path, errors);
        }
        if (emp.terminationDate) {
          this.validateDateString(
            emp.terminationDate,
            "terminationDate",
            path,
            errors,
          );

          // Termination must be after hire
          if (emp.hireDate) {
            const hire = new Date(emp.hireDate);
            const termination = new Date(emp.terminationDate);
            if (termination < hire) {
              errors.push({
                code: VALIDATION_ERROR_CODES.INVALID_DATE_RANGE,
                message: `Employee ${i + 1}: Termination date cannot be before hire date`,
                severity: "error",
                path: `${path}.terminationDate`,
              });
            }
          }
        }
      }
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Validate a required field
   */
  private validateRequiredField(
    value: unknown,
    fieldName: string,
    parentPath: string,
    errors: NAXMLValidationError[],
  ): void {
    if (value === undefined || value === null || value === "") {
      errors.push({
        code: VALIDATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: `Missing required field: ${fieldName}`,
        severity: "error",
        path: `${parentPath}.${fieldName}`,
      });
    }
  }

  /**
   * Validate a date string format
   */
  private validateDateString(
    value: string | undefined,
    fieldName: string,
    parentPath: string,
    errors: NAXMLValidationError[],
  ): void {
    if (!value) return;

    // Try to parse as ISO date
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      errors.push({
        code: VALIDATION_ERROR_CODES.INVALID_DATE,
        message: `Invalid date format for ${fieldName}: ${value}`,
        severity: "error",
        path: `${parentPath}.${fieldName}`,
      });
    }
  }

  /**
   * Round a number to 2 decimal places
   */
  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Create a new NAXML validator instance
 */
export function createNAXMLValidator(
  options?: Partial<NAXMLValidationOptions>,
): NAXMLValidator {
  return new NAXMLValidator(options);
}

/**
 * Validate an NAXML document (convenience function)
 */
export function validateNAXMLDocument<T>(
  document: NAXMLDocument<T>,
  options?: Partial<NAXMLValidationOptions>,
): NAXMLValidationResult {
  const validator = createNAXMLValidator(options);
  return validator.validate(document);
}

/**
 * Quick validate an NAXML document (convenience function)
 */
export function quickValidateNAXML<T>(
  document: NAXMLDocument<T>,
  options?: Partial<NAXMLValidationOptions>,
): boolean {
  const validator = createNAXMLValidator(options);
  return validator.quickValidate(document);
}
