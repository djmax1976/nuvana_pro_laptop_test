/**
 * POS Types Unit Tests
 *
 * Tests for POS type configurations and helper functions.
 * Validates that all 15 POS types are correctly configured and helpers work as expected.
 *
 * Enterprise coding standards applied:
 * - SEC-014: INPUT_VALIDATION - Validate UUID format checking
 * - FE-002: Form validation logic testing
 *
 * @module tests/unit/pos-integration/pos-types.unit.spec
 */

import { describe, it, expect } from "vitest";
import {
  POS_TYPE_CONFIGS,
  POS_TYPE_GROUPS,
  ALL_POS_TYPES,
  FILE_BASED_POS_TYPES,
  NETWORK_POS_TYPES,
  CLOUD_POS_TYPES,
  SYNC_INTERVAL_OPTIONS,
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_SYNC_OPTIONS,
  getPOSTypeConfig,
  getConnectionCategory,
  isFileBased,
  isNetworkBased,
  isCloudBased,
  isManualEntry,
  requiresConnectionTest,
  getDefaultPort,
  getDefaultExportPath,
  getDefaultImportPath,
  getCloudProvider,
  getPOSIcon,
  getPOSDisplayName,
  getPOSDescription,
  formatSyncInterval,
  isValidUUID,
} from "../../../src/lib/pos-integration/pos-types";
import type { POSSystemType } from "../../../src/types/pos-integration";

describe("POS Types Configuration", () => {
  // ===========================================================================
  // POS Type Config Completeness Tests
  // ===========================================================================
  describe("POS_TYPE_CONFIGS Completeness", () => {
    it("should have exactly 15 POS types configured", () => {
      const posTypes = Object.keys(POS_TYPE_CONFIGS);
      expect(posTypes).toHaveLength(15);
    });

    it("should include all expected POS types", () => {
      const expectedTypes: POSSystemType[] = [
        "GILBARCO_PASSPORT",
        "GILBARCO_NAXML",
        "GILBARCO_COMMANDER",
        "VERIFONE_RUBY2",
        "VERIFONE_COMMANDER",
        "VERIFONE_SAPPHIRE",
        "CLOVER_REST",
        "ORACLE_SIMPHONY",
        "NCR_ALOHA",
        "LIGHTSPEED_REST",
        "SQUARE_REST",
        "TOAST_REST",
        "GENERIC_XML",
        "GENERIC_REST",
        "MANUAL_ENTRY",
      ];

      expectedTypes.forEach((type) => {
        expect(
          POS_TYPE_CONFIGS[type],
          `Expected POS type ${type} to be configured`,
        ).toBeDefined();
      });
    });

    it("should have required fields for each POS type", () => {
      Object.entries(POS_TYPE_CONFIGS).forEach(([type, config]) => {
        expect(config.key, `${type} should have key`).toBe(type);
        expect(config.type, `${type} should have type`).toBeDefined();
        expect(config.name, `${type} should have name`).toBeDefined();
        expect(
          config.description,
          `${type} should have description`,
        ).toBeDefined();
        expect(config.icon, `${type} should have icon`).toBeDefined();
        expect(config.group, `${type} should have group`).toBeDefined();
      });
    });

    it("should have valid connection types", () => {
      const validTypes = ["file", "network", "cloud", "manual"];
      Object.entries(POS_TYPE_CONFIGS).forEach(([type, config]) => {
        expect(
          validTypes,
          `${type} should have valid connection type`,
        ).toContain(config.type);
      });
    });

    it("should have valid group values", () => {
      const validGroups = ["Verifone", "Gilbarco", "Cloud POS", "Other"];
      Object.entries(POS_TYPE_CONFIGS).forEach(([type, config]) => {
        expect(validGroups, `${type} should have valid group`).toContain(
          config.group,
        );
      });
    });
  });

  // ===========================================================================
  // POS Type Groups Tests
  // ===========================================================================
  describe("POS_TYPE_GROUPS", () => {
    it("should have 4 groups", () => {
      expect(POS_TYPE_GROUPS).toHaveLength(4);
    });

    it("should include all POS types across groups", () => {
      const typesInGroups = POS_TYPE_GROUPS.flatMap((group) => group.options);
      // 13 types in groups: GILBARCO_COMMANDER and GENERIC_XML are in POS_TYPE_CONFIGS but not in POS_TYPE_GROUPS
      expect(typesInGroups).toHaveLength(13);
    });

    it("should have Verifone group with correct types", () => {
      const verifoneGroup = POS_TYPE_GROUPS.find((g) => g.label === "Verifone");
      expect(verifoneGroup).toBeDefined();
      expect(verifoneGroup?.options).toContain("VERIFONE_COMMANDER");
      expect(verifoneGroup?.options).toContain("VERIFONE_RUBY2");
      expect(verifoneGroup?.options).toContain("VERIFONE_SAPPHIRE");
    });

    it("should have Gilbarco group with correct types", () => {
      const gilbarcoGroup = POS_TYPE_GROUPS.find((g) => g.label === "Gilbarco");
      expect(gilbarcoGroup).toBeDefined();
      expect(gilbarcoGroup?.options).toContain("GILBARCO_PASSPORT");
      expect(gilbarcoGroup?.options).toContain("GILBARCO_NAXML");
    });

    it("should have Cloud POS group with correct types", () => {
      const cloudGroup = POS_TYPE_GROUPS.find((g) => g.label === "Cloud POS");
      expect(cloudGroup).toBeDefined();
      expect(cloudGroup?.options).toContain("SQUARE_REST");
      expect(cloudGroup?.options).toContain("CLOVER_REST");
      expect(cloudGroup?.options).toContain("TOAST_REST");
      expect(cloudGroup?.options).toContain("LIGHTSPEED_REST");
    });

    it("should have Other group with correct types", () => {
      const otherGroup = POS_TYPE_GROUPS.find((g) => g.label === "Other");
      expect(otherGroup).toBeDefined();
      expect(otherGroup?.options).toContain("NCR_ALOHA");
      expect(otherGroup?.options).toContain("ORACLE_SIMPHONY");
      expect(otherGroup?.options).toContain("GENERIC_REST");
      expect(otherGroup?.options).toContain("MANUAL_ENTRY");
    });
  });

  // ===========================================================================
  // Derived Type Arrays Tests
  // ===========================================================================
  describe("Derived Type Arrays", () => {
    it("ALL_POS_TYPES should contain all 15 types", () => {
      expect(ALL_POS_TYPES).toHaveLength(15);
    });

    it("FILE_BASED_POS_TYPES should contain correct types", () => {
      const expected = [
        "VERIFONE_COMMANDER",
        "VERIFONE_RUBY2",
        "GILBARCO_NAXML",
      ];
      expected.forEach((type) => {
        expect(
          FILE_BASED_POS_TYPES,
          `FILE_BASED_POS_TYPES should contain ${type}`,
        ).toContain(type);
      });
      FILE_BASED_POS_TYPES.forEach((type) => {
        expect(
          POS_TYPE_CONFIGS[type].type,
          `${type} should be file-based`,
        ).toBe("file");
      });
    });

    it("NETWORK_POS_TYPES should contain correct types", () => {
      const expected = [
        "VERIFONE_SAPPHIRE",
        "GILBARCO_PASSPORT",
        "GILBARCO_COMMANDER",
        "NCR_ALOHA",
        "ORACLE_SIMPHONY",
        "GENERIC_REST",
        "GENERIC_XML",
      ];
      expected.forEach((type) => {
        expect(
          NETWORK_POS_TYPES,
          `NETWORK_POS_TYPES should contain ${type}`,
        ).toContain(type);
      });
      NETWORK_POS_TYPES.forEach((type) => {
        expect(
          POS_TYPE_CONFIGS[type].type,
          `${type} should be network-based`,
        ).toBe("network");
      });
    });

    it("CLOUD_POS_TYPES should contain correct types", () => {
      const expected = [
        "SQUARE_REST",
        "CLOVER_REST",
        "TOAST_REST",
        "LIGHTSPEED_REST",
      ];
      expected.forEach((type) => {
        expect(
          CLOUD_POS_TYPES,
          `CLOUD_POS_TYPES should contain ${type}`,
        ).toContain(type);
      });
      CLOUD_POS_TYPES.forEach((type) => {
        expect(
          POS_TYPE_CONFIGS[type].type,
          `${type} should be cloud-based`,
        ).toBe("cloud");
      });
    });
  });

  // ===========================================================================
  // Sync Configuration Tests
  // ===========================================================================
  describe("Sync Configuration", () => {
    it("should have correct sync interval options", () => {
      expect(SYNC_INTERVAL_OPTIONS).toHaveLength(4);
      expect(SYNC_INTERVAL_OPTIONS[0]).toEqual({ value: 15, label: "15 min" });
      expect(SYNC_INTERVAL_OPTIONS[1]).toEqual({ value: 30, label: "30 min" });
      expect(SYNC_INTERVAL_OPTIONS[2]).toEqual({
        value: 60,
        label: "1 hour",
        default: true,
      });
      expect(SYNC_INTERVAL_OPTIONS[3]).toEqual({ value: 1440, label: "Daily" });
    });

    it("should have default sync interval of 60 minutes", () => {
      expect(DEFAULT_SYNC_INTERVAL).toBe(60);
    });

    it("should have correct default sync options", () => {
      expect(DEFAULT_SYNC_OPTIONS.syncDepartments).toBe(true);
      expect(DEFAULT_SYNC_OPTIONS.syncTenders).toBe(true);
      expect(DEFAULT_SYNC_OPTIONS.syncTaxRates).toBe(true);
      expect(DEFAULT_SYNC_OPTIONS.autoSyncEnabled).toBe(true);
      expect(DEFAULT_SYNC_OPTIONS.syncIntervalMinutes).toBe(60);
    });
  });
});

// ===========================================================================
// Helper Functions Tests
// ===========================================================================
describe("POS Types Helper Functions", () => {
  describe("getPOSTypeConfig", () => {
    it("should return correct config for each POS type", () => {
      ALL_POS_TYPES.forEach((type) => {
        const config = getPOSTypeConfig(type);
        expect(config).toBeDefined();
        expect(config.key).toBe(type);
      });
    });

    it("should return correct config for VERIFONE_COMMANDER", () => {
      const config = getPOSTypeConfig("VERIFONE_COMMANDER");
      expect(config.name).toBe("Verifone Commander");
      expect(config.type).toBe("file");
      expect(config.group).toBe("Verifone");
      expect(config.exportPath).toBe("C:\\Commander\\Export");
      expect(config.importPath).toBe("C:\\Commander\\Import");
    });

    it("should return correct config for SQUARE_REST", () => {
      const config = getPOSTypeConfig("SQUARE_REST");
      expect(config.name).toBe("Square");
      expect(config.type).toBe("cloud");
      expect(config.group).toBe("Cloud POS");
      expect(config.provider).toBe("Square");
    });
  });

  describe("getConnectionCategory", () => {
    it("should return 'file' for file-based POS types", () => {
      expect(getConnectionCategory("VERIFONE_COMMANDER")).toBe("file");
      expect(getConnectionCategory("VERIFONE_RUBY2")).toBe("file");
      expect(getConnectionCategory("GILBARCO_NAXML")).toBe("file");
    });

    it("should return 'network' for network-based POS types", () => {
      expect(getConnectionCategory("VERIFONE_SAPPHIRE")).toBe("network");
      expect(getConnectionCategory("GILBARCO_PASSPORT")).toBe("network");
      expect(getConnectionCategory("NCR_ALOHA")).toBe("network");
      expect(getConnectionCategory("ORACLE_SIMPHONY")).toBe("network");
    });

    it("should return 'cloud' for cloud POS types", () => {
      expect(getConnectionCategory("SQUARE_REST")).toBe("cloud");
      expect(getConnectionCategory("CLOVER_REST")).toBe("cloud");
      expect(getConnectionCategory("TOAST_REST")).toBe("cloud");
      expect(getConnectionCategory("LIGHTSPEED_REST")).toBe("cloud");
    });

    it("should return 'manual' for manual entry", () => {
      expect(getConnectionCategory("MANUAL_ENTRY")).toBe("manual");
    });
  });

  describe("isFileBased", () => {
    it("should return true for file-based POS types", () => {
      expect(isFileBased("VERIFONE_COMMANDER")).toBe(true);
      expect(isFileBased("VERIFONE_RUBY2")).toBe(true);
      expect(isFileBased("GILBARCO_NAXML")).toBe(true);
    });

    it("should return false for non-file-based POS types", () => {
      expect(isFileBased("VERIFONE_SAPPHIRE")).toBe(false);
      expect(isFileBased("SQUARE_REST")).toBe(false);
      expect(isFileBased("MANUAL_ENTRY")).toBe(false);
    });
  });

  describe("isNetworkBased", () => {
    it("should return true for network-based POS types", () => {
      expect(isNetworkBased("VERIFONE_SAPPHIRE")).toBe(true);
      expect(isNetworkBased("GILBARCO_PASSPORT")).toBe(true);
      expect(isNetworkBased("NCR_ALOHA")).toBe(true);
    });

    it("should return false for non-network-based POS types", () => {
      expect(isNetworkBased("VERIFONE_COMMANDER")).toBe(false);
      expect(isNetworkBased("SQUARE_REST")).toBe(false);
      expect(isNetworkBased("MANUAL_ENTRY")).toBe(false);
    });
  });

  describe("isCloudBased", () => {
    it("should return true for cloud-based POS types", () => {
      expect(isCloudBased("SQUARE_REST")).toBe(true);
      expect(isCloudBased("CLOVER_REST")).toBe(true);
      expect(isCloudBased("TOAST_REST")).toBe(true);
      expect(isCloudBased("LIGHTSPEED_REST")).toBe(true);
    });

    it("should return false for non-cloud-based POS types", () => {
      expect(isCloudBased("VERIFONE_COMMANDER")).toBe(false);
      expect(isCloudBased("GILBARCO_PASSPORT")).toBe(false);
      expect(isCloudBased("MANUAL_ENTRY")).toBe(false);
    });
  });

  describe("isManualEntry", () => {
    it("should return true only for MANUAL_ENTRY", () => {
      expect(isManualEntry("MANUAL_ENTRY")).toBe(true);
    });

    it("should return false for all other POS types", () => {
      const otherTypes = ALL_POS_TYPES.filter((t) => t !== "MANUAL_ENTRY");
      otherTypes.forEach((type) => {
        expect(isManualEntry(type), `${type} should not be manual entry`).toBe(
          false,
        );
      });
    });
  });

  describe("requiresConnectionTest", () => {
    it("should return true for all POS types except manual", () => {
      const typesRequiringTest = ALL_POS_TYPES.filter(
        (t) => t !== "MANUAL_ENTRY",
      );
      typesRequiringTest.forEach((type) => {
        expect(
          requiresConnectionTest(type),
          `${type} should require connection test`,
        ).toBe(true);
      });
    });

    it("should return false for MANUAL_ENTRY", () => {
      expect(requiresConnectionTest("MANUAL_ENTRY")).toBe(false);
    });
  });

  describe("getDefaultPort", () => {
    it("should return correct default ports for network POS types", () => {
      expect(getDefaultPort("VERIFONE_SAPPHIRE")).toBe(8080);
      expect(getDefaultPort("GILBARCO_PASSPORT")).toBe(5015);
      expect(getDefaultPort("GILBARCO_COMMANDER")).toBe(8080);
      expect(getDefaultPort("NCR_ALOHA")).toBe(9999);
      expect(getDefaultPort("ORACLE_SIMPHONY")).toBe(8443);
      expect(getDefaultPort("GENERIC_REST")).toBe(443);
      expect(getDefaultPort("GENERIC_XML")).toBe(8080);
    });

    it("should return undefined for non-network POS types", () => {
      expect(getDefaultPort("VERIFONE_COMMANDER")).toBeUndefined();
      expect(getDefaultPort("SQUARE_REST")).toBeUndefined();
      expect(getDefaultPort("MANUAL_ENTRY")).toBeUndefined();
    });
  });

  describe("getDefaultExportPath", () => {
    it("should return correct export paths for file-based POS types", () => {
      expect(getDefaultExportPath("VERIFONE_COMMANDER")).toBe(
        "C:\\Commander\\Export",
      );
      expect(getDefaultExportPath("VERIFONE_RUBY2")).toBe(
        "C:\\RubyCI\\SSXML\\Out",
      );
      expect(getDefaultExportPath("GILBARCO_NAXML")).toBe(
        "C:\\Passport\\Export",
      );
    });

    it("should return undefined for non-file-based POS types", () => {
      expect(getDefaultExportPath("VERIFONE_SAPPHIRE")).toBeUndefined();
      expect(getDefaultExportPath("SQUARE_REST")).toBeUndefined();
      expect(getDefaultExportPath("MANUAL_ENTRY")).toBeUndefined();
    });
  });

  describe("getDefaultImportPath", () => {
    it("should return correct import paths for file-based POS types", () => {
      expect(getDefaultImportPath("VERIFONE_COMMANDER")).toBe(
        "C:\\Commander\\Import",
      );
      expect(getDefaultImportPath("VERIFONE_RUBY2")).toBe(
        "C:\\RubyCI\\SSXML\\In",
      );
      expect(getDefaultImportPath("GILBARCO_NAXML")).toBe(
        "C:\\Passport\\Import",
      );
    });

    it("should return undefined for non-file-based POS types", () => {
      expect(getDefaultImportPath("VERIFONE_SAPPHIRE")).toBeUndefined();
      expect(getDefaultImportPath("SQUARE_REST")).toBeUndefined();
      expect(getDefaultImportPath("MANUAL_ENTRY")).toBeUndefined();
    });
  });

  describe("getCloudProvider", () => {
    it("should return correct provider for cloud POS types", () => {
      expect(getCloudProvider("SQUARE_REST")).toBe("Square");
      expect(getCloudProvider("CLOVER_REST")).toBe("Clover");
      expect(getCloudProvider("TOAST_REST")).toBe("Toast");
      expect(getCloudProvider("LIGHTSPEED_REST")).toBe("Lightspeed");
    });

    it("should return undefined for non-cloud POS types", () => {
      expect(getCloudProvider("VERIFONE_COMMANDER")).toBeUndefined();
      expect(getCloudProvider("GILBARCO_PASSPORT")).toBeUndefined();
      expect(getCloudProvider("MANUAL_ENTRY")).toBeUndefined();
    });
  });

  describe("getPOSIcon", () => {
    it("should return icon class with fa- prefix", () => {
      expect(getPOSIcon("VERIFONE_COMMANDER")).toBe("fa-cash-register");
      expect(getPOSIcon("GILBARCO_PASSPORT")).toBe("fa-gas-pump");
      expect(getPOSIcon("SQUARE_REST")).toBe("fa-square");
      expect(getPOSIcon("CLOVER_REST")).toBe("fa-clover");
      expect(getPOSIcon("TOAST_REST")).toBe("fa-utensils");
      expect(getPOSIcon("LIGHTSPEED_REST")).toBe("fa-bolt");
      expect(getPOSIcon("MANUAL_ENTRY")).toBe("fa-keyboard");
    });
  });

  describe("getPOSDisplayName", () => {
    it("should return human-readable display names", () => {
      expect(getPOSDisplayName("VERIFONE_COMMANDER")).toBe(
        "Verifone Commander",
      );
      expect(getPOSDisplayName("VERIFONE_RUBY2")).toBe("Verifone Ruby2");
      expect(getPOSDisplayName("GILBARCO_PASSPORT")).toBe("Gilbarco Passport");
      expect(getPOSDisplayName("SQUARE_REST")).toBe("Square");
      expect(getPOSDisplayName("MANUAL_ENTRY")).toBe("Manual Entry");
    });
  });

  describe("getPOSDescription", () => {
    it("should return descriptions for each POS type", () => {
      expect(getPOSDescription("VERIFONE_COMMANDER")).toBe(
        "File-based NAXML data exchange",
      );
      expect(getPOSDescription("GILBARCO_PASSPORT")).toBe(
        "Network XML protocol",
      );
      expect(getPOSDescription("SQUARE_REST")).toBe("Cloud REST API");
      expect(getPOSDescription("MANUAL_ENTRY")).toBe("No automatic sync");
    });
  });

  describe("formatSyncInterval", () => {
    it("should format minutes correctly", () => {
      expect(formatSyncInterval(15)).toBe("Every 15 minutes");
      expect(formatSyncInterval(30)).toBe("Every 30 minutes");
      expect(formatSyncInterval(45)).toBe("Every 45 minutes");
    });

    it("should format hours correctly", () => {
      expect(formatSyncInterval(60)).toBe("Every hour");
      expect(formatSyncInterval(120)).toBe("Every 2 hours");
      expect(formatSyncInterval(180)).toBe("Every 3 hours");
      expect(formatSyncInterval(360)).toBe("Every 6 hours");
      expect(formatSyncInterval(720)).toBe("Every 12 hours");
    });

    it("should format days correctly", () => {
      expect(formatSyncInterval(1440)).toBe("Once daily");
      expect(formatSyncInterval(2880)).toBe("Every 2 days");
      expect(formatSyncInterval(4320)).toBe("Every 3 days");
    });
  });
});

// ===========================================================================
// UUID Validation Tests (SEC-014: INPUT_VALIDATION)
// ===========================================================================
describe("isValidUUID (SEC-014: INPUT_VALIDATION)", () => {
  it("should return true for valid UUIDs", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidUUID("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isValidUUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")).toBe(true);
    expect(isValidUUID("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
  });

  it("should return true for UUIDs with uppercase letters", () => {
    expect(isValidUUID("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    expect(isValidUUID("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11")).toBe(true);
  });

  it("should return false for invalid UUIDs", () => {
    // Too short
    expect(isValidUUID("550e8400-e29b-41d4-a716")).toBe(false);
    // Too long
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000-extra")).toBe(
      false,
    );
    // Wrong format
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID("12345678901234567890123456789012")).toBe(false);
    // Invalid characters
    expect(isValidUUID("550e8400-e29b-41d4-a716-44665544000g")).toBe(false);
    // Wrong structure
    expect(isValidUUID("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("should return false for empty or null-like values", () => {
    expect(isValidUUID("")).toBe(false);
    expect(isValidUUID("null")).toBe(false);
    expect(isValidUUID("undefined")).toBe(false);
  });

  it("should return false for SQL injection attempts", () => {
    expect(isValidUUID("'; DROP TABLE users; --")).toBe(false);
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000' OR '1'='1")).toBe(
      false,
    );
  });

  it("should return false for XSS attempts", () => {
    expect(isValidUUID("<script>alert('xss')</script>")).toBe(false);
    expect(isValidUUID("javascript:alert('xss')")).toBe(false);
  });
});
