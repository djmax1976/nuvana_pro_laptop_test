/**
 * POS Setup Wizard State Management Unit Tests
 *
 * Tests for the usePOSSetupWizard hook state management logic.
 * Validates state transitions, validation rules, and request building.
 *
 * Enterprise coding standards applied:
 * - FE-002: Form validation logic testing
 * - SEC-014: Input validation enforcement
 *
 * @module tests/unit/pos-integration/wizard-state.unit.spec
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePOSSetupWizard } from "../../../src/components/pos-integration/hooks/usePOSSetupWizard";
import type { POSSystemType } from "../../../src/types/pos-integration";

describe("usePOSSetupWizard Hook", () => {
  // ===========================================================================
  // Initial State Tests
  // ===========================================================================
  describe("Initial State", () => {
    it("should initialize with step 1", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.state.currentStep).toBe(1);
    });

    it("should initialize with no POS selected", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.state.selectedPOS).toBeNull();
    });

    it("should initialize with empty file config", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.state.fileConfig.exportPath).toBe("");
      expect(result.current.state.fileConfig.importPath).toBe("");
      expect(result.current.state.fileConfig.naxmlVersion).toBe("3.4");
      expect(result.current.state.fileConfig.generateAcknowledgments).toBe(
        true,
      );
    });

    it("should initialize with default network config", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.state.networkConfig.host).toBe("");
      expect(result.current.state.networkConfig.port).toBe(8080);
      expect(result.current.state.networkConfig.useSsl).toBe(true);
    });

    it("should initialize with empty cloud config", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.state.cloudConfig.apiKey).toBe("");
      expect(result.current.state.cloudConfig.locationId).toBe("");
    });

    it("should initialize with default sync options", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.state.syncOptions.syncDepartments).toBe(true);
      expect(result.current.state.syncOptions.syncTenders).toBe(true);
      expect(result.current.state.syncOptions.syncTaxRates).toBe(true);
      expect(result.current.state.syncOptions.autoSyncEnabled).toBe(true);
      expect(result.current.state.syncOptions.syncIntervalMinutes).toBe(60);
    });

    it("should initialize with connectionTested as false", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.state.connectionTested).toBe(false);
    });

    it("should initialize with null connectionTestResult", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.state.connectionTestResult).toBeNull();
    });

    it("should initialize with isSubmitting as false", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.state.isSubmitting).toBe(false);
    });

    it("should initialize with null error", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.state.error).toBeNull();
    });

    it("should initialize with canGoNext as false (no POS selected)", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.canGoNext).toBe(false);
    });

    it("should initialize with null connectionCategory", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.connectionCategory).toBeNull();
    });
  });

  // ===========================================================================
  // POS Selection Tests
  // ===========================================================================
  describe("POS Selection", () => {
    it("should update selectedPOS when selectPOS is called", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("VERIFONE_COMMANDER");
      });

      expect(result.current.state.selectedPOS).toBe("VERIFONE_COMMANDER");
    });

    it("should set connectionCategory for file-based POS", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("VERIFONE_COMMANDER");
      });

      expect(result.current.connectionCategory).toBe("file");
    });

    it("should set connectionCategory for network-based POS", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("GILBARCO_PASSPORT");
      });

      expect(result.current.connectionCategory).toBe("network");
    });

    it("should set connectionCategory for cloud-based POS", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("SQUARE_REST");
      });

      expect(result.current.connectionCategory).toBe("cloud");
    });

    it("should set connectionCategory for manual entry", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("MANUAL_ENTRY");
      });

      expect(result.current.connectionCategory).toBe("manual");
    });

    it("should pre-populate file config with defaults for file-based POS", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("VERIFONE_COMMANDER");
      });

      expect(result.current.state.fileConfig.exportPath).toBe(
        "C:\\Commander\\Export",
      );
      expect(result.current.state.fileConfig.importPath).toBe(
        "C:\\Commander\\Import",
      );
    });

    it("should pre-populate network config with default port for network-based POS", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("GILBARCO_PASSPORT");
      });

      expect(result.current.state.networkConfig.port).toBe(5015);
    });

    it("should reset connection test result when POS changes", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      // First, set a connection test result
      act(() => {
        result.current.selectPOS("GILBARCO_PASSPORT");
        result.current.setConnectionTestResult({
          success: true,
          data: { connected: true, message: "Connected" },
        });
      });

      expect(result.current.state.connectionTested).toBe(true);

      // Now change POS, should reset
      act(() => {
        result.current.selectPOS("SQUARE_REST");
      });

      expect(result.current.state.connectionTested).toBe(false);
      expect(result.current.state.connectionTestResult).toBeNull();
    });

    it("should enable canGoNext after selecting POS in step 1", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      expect(result.current.canGoNext).toBe(false);

      act(() => {
        result.current.selectPOS("VERIFONE_COMMANDER");
      });

      expect(result.current.canGoNext).toBe(true);
    });
  });

  // ===========================================================================
  // Navigation Tests
  // ===========================================================================
  describe("Navigation", () => {
    it("should advance to next step with goNext", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("VERIFONE_COMMANDER");
        result.current.goNext();
      });

      expect(result.current.state.currentStep).toBe(2);
    });

    it("should go back to previous step with goBack", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("VERIFONE_COMMANDER");
        result.current.goNext();
      });

      expect(result.current.state.currentStep).toBe(2);

      act(() => {
        result.current.goBack();
      });

      expect(result.current.state.currentStep).toBe(1);
    });

    it("should not go back below step 1", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.goBack();
      });

      expect(result.current.state.currentStep).toBe(1);
    });

    it("should not advance beyond step 4", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.goToStep(4);
      });

      act(() => {
        result.current.goNext();
      });

      expect(result.current.state.currentStep).toBe(4);
    });

    it("should jump to specific step with goToStep", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.goToStep(3);
      });

      expect(result.current.state.currentStep).toBe(3);
    });

    it("should clear error when changing step", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.setError("Test error");
      });

      expect(result.current.state.error).toBe("Test error");

      act(() => {
        result.current.goToStep(2);
      });

      expect(result.current.state.error).toBeNull();
    });
  });

  // ===========================================================================
  // Config Update Tests
  // ===========================================================================
  describe("Config Updates", () => {
    it("should update file config", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("VERIFONE_COMMANDER");
        result.current.updateFileConfig({ exportPath: "D:\\Custom\\Export" });
      });

      expect(result.current.state.fileConfig.exportPath).toBe(
        "D:\\Custom\\Export",
      );
      // Other fields should remain unchanged
      expect(result.current.state.fileConfig.importPath).toBe(
        "C:\\Commander\\Import",
      );
    });

    it("should update network config", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("GILBARCO_PASSPORT");
        result.current.updateNetworkConfig({
          host: "192.168.1.100",
          port: 9000,
        });
      });

      expect(result.current.state.networkConfig.host).toBe("192.168.1.100");
      expect(result.current.state.networkConfig.port).toBe(9000);
      // SSL should remain true
      expect(result.current.state.networkConfig.useSsl).toBe(true);
    });

    it("should update cloud config", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("SQUARE_REST");
        result.current.updateCloudConfig({ apiKey: "sk_test_12345" });
      });

      expect(result.current.state.cloudConfig.apiKey).toBe("sk_test_12345");
    });

    it("should update sync options", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.updateSyncOptions({
          syncDepartments: false,
          syncIntervalMinutes: 30,
        });
      });

      expect(result.current.state.syncOptions.syncDepartments).toBe(false);
      expect(result.current.state.syncOptions.syncIntervalMinutes).toBe(30);
      // Other options should remain unchanged
      expect(result.current.state.syncOptions.syncTenders).toBe(true);
    });

    it("should reset connection test when file config changes", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("VERIFONE_COMMANDER");
        result.current.setConnectionTestResult({
          success: true,
          data: { connected: true, message: "OK" },
        });
      });

      expect(result.current.state.connectionTested).toBe(true);

      act(() => {
        result.current.updateFileConfig({ exportPath: "D:\\NewPath" });
      });

      expect(result.current.state.connectionTested).toBe(false);
    });

    it("should reset connection test when network config changes", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("GILBARCO_PASSPORT");
        result.current.setConnectionTestResult({
          success: true,
          data: { connected: true, message: "OK" },
        });
      });

      expect(result.current.state.connectionTested).toBe(true);

      act(() => {
        result.current.updateNetworkConfig({ host: "192.168.1.100" });
      });

      expect(result.current.state.connectionTested).toBe(false);
    });

    it("should reset connection test when cloud config changes", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("SQUARE_REST");
        result.current.setConnectionTestResult({
          success: true,
          data: { connected: true, message: "OK" },
        });
      });

      expect(result.current.state.connectionTested).toBe(true);

      act(() => {
        result.current.updateCloudConfig({ apiKey: "new_key" });
      });

      expect(result.current.state.connectionTested).toBe(false);
    });
  });

  // ===========================================================================
  // Connection Test Result Tests
  // ===========================================================================
  describe("Connection Test Results", () => {
    it("should set connectionTested to true on successful test", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("GILBARCO_PASSPORT");
        result.current.setConnectionTestResult({
          success: true,
          data: { connected: true, message: "Connection successful" },
        });
      });

      expect(result.current.state.connectionTested).toBe(true);
      expect(result.current.state.connectionTestResult?.success).toBe(true);
    });

    it("should set connectionTested to false on failed test", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("GILBARCO_PASSPORT");
        result.current.setConnectionTestResult({
          success: false,
          data: { connected: false, message: "Connection failed" },
        });
      });

      expect(result.current.state.connectionTested).toBe(false);
      expect(result.current.state.connectionTestResult?.success).toBe(false);
    });

    it("should set connectionTested to false when success but not connected", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("GILBARCO_PASSPORT");
        result.current.setConnectionTestResult({
          success: true,
          data: { connected: false, message: "Could not reach host" },
        });
      });

      expect(result.current.state.connectionTested).toBe(false);
    });

    it("should reset connection test with resetConnectionTest", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("GILBARCO_PASSPORT");
        result.current.setConnectionTestResult({
          success: true,
          data: { connected: true, message: "OK" },
        });
      });

      expect(result.current.state.connectionTested).toBe(true);

      act(() => {
        result.current.resetConnectionTest();
      });

      expect(result.current.state.connectionTested).toBe(false);
      expect(result.current.state.connectionTestResult).toBeNull();
    });
  });

  // ===========================================================================
  // Submission State Tests
  // ===========================================================================
  describe("Submission State", () => {
    it("should set isSubmitting state", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.setSubmitting(true);
      });

      expect(result.current.state.isSubmitting).toBe(true);

      act(() => {
        result.current.setSubmitting(false);
      });

      expect(result.current.state.isSubmitting).toBe(false);
    });

    it("should set error state", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.setError("Something went wrong");
      });

      expect(result.current.state.error).toBe("Something went wrong");
    });

    it("should clear error state", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.setError("Error");
      });

      expect(result.current.state.error).toBe("Error");

      act(() => {
        result.current.setError(null);
      });

      expect(result.current.state.error).toBeNull();
    });

    it("should reset isSubmitting when setting error", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.setSubmitting(true);
      });

      expect(result.current.state.isSubmitting).toBe(true);

      act(() => {
        result.current.setError("Failed");
      });

      expect(result.current.state.isSubmitting).toBe(false);
    });
  });

  // ===========================================================================
  // Reset Tests
  // ===========================================================================
  describe("Reset", () => {
    it("should reset all state to initial values", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      // Make various changes
      act(() => {
        result.current.selectPOS("VERIFONE_COMMANDER");
        result.current.goToStep(3);
        result.current.updateSyncOptions({ syncDepartments: false });
        result.current.setError("Some error");
      });

      // Verify state changed
      expect(result.current.state.selectedPOS).toBe("VERIFONE_COMMANDER");
      expect(result.current.state.currentStep).toBe(3);
      expect(result.current.state.syncOptions.syncDepartments).toBe(false);
      expect(result.current.state.error).toBe("Some error");

      // Reset
      act(() => {
        result.current.reset();
      });

      // Verify reset to initial state
      expect(result.current.state.selectedPOS).toBeNull();
      expect(result.current.state.currentStep).toBe(1);
      expect(result.current.state.syncOptions.syncDepartments).toBe(true);
      expect(result.current.state.error).toBeNull();
    });
  });

  // ===========================================================================
  // canGoNext Validation Tests
  // ===========================================================================
  describe("canGoNext Validation", () => {
    describe("Step 1 (POS Selection)", () => {
      it("should be false when no POS selected", () => {
        const { result } = renderHook(() => usePOSSetupWizard());
        expect(result.current.canGoNext).toBe(false);
      });

      it("should be true when POS is selected", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.selectPOS("VERIFONE_COMMANDER");
        });

        expect(result.current.canGoNext).toBe(true);
      });
    });

    describe("Step 2 (Connection Details)", () => {
      it("should require connection test for file-based POS", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.selectPOS("VERIFONE_COMMANDER");
          result.current.goNext(); // Go to step 2
        });

        expect(result.current.state.currentStep).toBe(2);
        expect(result.current.canGoNext).toBe(false); // Not tested yet

        act(() => {
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        expect(result.current.canGoNext).toBe(true);
      });

      it("should require connection test for network-based POS", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.selectPOS("GILBARCO_PASSPORT");
          result.current.goNext();
          result.current.updateNetworkConfig({ host: "192.168.1.100" });
        });

        expect(result.current.canGoNext).toBe(false); // Not tested

        act(() => {
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        expect(result.current.canGoNext).toBe(true);
      });

      it("should require connection test for cloud-based POS", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.selectPOS("SQUARE_REST");
          result.current.goNext();
          result.current.updateCloudConfig({ apiKey: "sk_test_12345" });
        });

        expect(result.current.canGoNext).toBe(false); // Not tested

        act(() => {
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        expect(result.current.canGoNext).toBe(true);
      });

      it("should NOT require connection test for manual entry", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.selectPOS("MANUAL_ENTRY");
          result.current.goNext();
        });

        expect(result.current.canGoNext).toBe(true); // No test needed
      });

      it("should validate file config has paths", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.selectPOS("VERIFONE_COMMANDER");
          result.current.goNext();
          result.current.updateFileConfig({ exportPath: "", importPath: "" });
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        // Should be false because paths are empty
        expect(result.current.canGoNext).toBe(false);

        act(() => {
          result.current.updateFileConfig({
            exportPath: "C:\\Export",
            importPath: "C:\\Import",
          });
          // Re-set connection test since config changed
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        expect(result.current.canGoNext).toBe(true);
      });

      it("should validate network config has host", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.selectPOS("GILBARCO_PASSPORT");
          result.current.goNext();
          result.current.updateNetworkConfig({ host: "" });
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        expect(result.current.canGoNext).toBe(false);

        act(() => {
          result.current.updateNetworkConfig({ host: "192.168.1.100" });
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        expect(result.current.canGoNext).toBe(true);
      });

      it("should validate network port is valid", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.selectPOS("GILBARCO_PASSPORT");
          result.current.goNext();
          result.current.updateNetworkConfig({
            host: "192.168.1.100",
            port: 0,
          });
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        expect(result.current.canGoNext).toBe(false);

        act(() => {
          result.current.updateNetworkConfig({ port: 70000 }); // Over max
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        expect(result.current.canGoNext).toBe(false);

        act(() => {
          result.current.updateNetworkConfig({ port: 8080 });
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        expect(result.current.canGoNext).toBe(true);
      });

      it("should validate cloud config has API key", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.selectPOS("SQUARE_REST");
          result.current.goNext();
          result.current.updateCloudConfig({ apiKey: "" });
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        expect(result.current.canGoNext).toBe(false);

        act(() => {
          result.current.updateCloudConfig({ apiKey: "sk_test_12345" });
          result.current.setConnectionTestResult({
            success: true,
            data: { connected: true, message: "OK" },
          });
        });

        expect(result.current.canGoNext).toBe(true);
      });
    });

    describe("Step 3 (Sync Options)", () => {
      it("should require at least one sync option enabled", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.selectPOS("GILBARCO_PASSPORT");
          result.current.goToStep(3);
          result.current.updateSyncOptions({
            syncDepartments: false,
            syncTenders: false,
            syncTaxRates: false,
          });
        });

        expect(result.current.canGoNext).toBe(false);

        act(() => {
          result.current.updateSyncOptions({ syncDepartments: true });
        });

        expect(result.current.canGoNext).toBe(true);
      });

      it("should not require sync options for manual entry", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.selectPOS("MANUAL_ENTRY");
          result.current.goToStep(3);
          result.current.updateSyncOptions({
            syncDepartments: false,
            syncTenders: false,
            syncTaxRates: false,
          });
        });

        expect(result.current.canGoNext).toBe(true);
      });
    });

    describe("Step 4 (Review & Confirm)", () => {
      it("should be true when not submitting", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.goToStep(4);
        });

        expect(result.current.canGoNext).toBe(true);
      });

      it("should be false when submitting", () => {
        const { result } = renderHook(() => usePOSSetupWizard());

        act(() => {
          result.current.goToStep(4);
          result.current.setSubmitting(true);
        });

        expect(result.current.canGoNext).toBe(false);
      });
    });
  });

  // ===========================================================================
  // needsConnectionTest Tests
  // ===========================================================================
  describe("needsConnectionTest", () => {
    it("should be false when no POS selected", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.needsConnectionTest).toBe(false);
    });

    it("should be true for file-based POS", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("VERIFONE_COMMANDER");
      });

      expect(result.current.needsConnectionTest).toBe(true);
    });

    it("should be true for network-based POS", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("GILBARCO_PASSPORT");
      });

      expect(result.current.needsConnectionTest).toBe(true);
    });

    it("should be true for cloud-based POS", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("SQUARE_REST");
      });

      expect(result.current.needsConnectionTest).toBe(true);
    });

    it("should be false for manual entry", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("MANUAL_ENTRY");
      });

      expect(result.current.needsConnectionTest).toBe(false);
    });
  });

  // ===========================================================================
  // buildCreateRequest Tests
  // ===========================================================================
  describe("buildCreateRequest", () => {
    it("should return null when no POS selected", () => {
      const { result } = renderHook(() => usePOSSetupWizard());
      expect(result.current.buildCreateRequest()).toBeNull();
    });

    it("should build correct request for file-based POS", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("VERIFONE_COMMANDER");
        result.current.updateFileConfig({
          exportPath: "C:\\Export",
          importPath: "C:\\Import",
          naxmlVersion: "3.5",
          generateAcknowledgments: false,
        });
        result.current.updateSyncOptions({
          syncDepartments: true,
          syncTenders: false,
          syncTaxRates: true,
          autoSyncEnabled: true,
          syncIntervalMinutes: 30,
        });
      });

      const request = result.current.buildCreateRequest();

      expect(request).not.toBeNull();
      expect(request?.pos_type).toBe("VERIFONE_COMMANDER");
      expect(request?.host).toBe("localhost");
      expect(request?.export_path).toBe("C:\\Export");
      expect(request?.import_path).toBe("C:\\Import");
      expect(request?.naxml_version).toBe("3.5");
      expect(request?.generate_acknowledgments).toBe(false);
      expect(request?.sync_departments).toBe(true);
      expect(request?.sync_tender_types).toBe(false);
      expect(request?.sync_tax_rates).toBe(true);
      expect(request?.sync_enabled).toBe(true);
      expect(request?.sync_interval_minutes).toBe(30);
    });

    it("should build correct request for network-based POS", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("GILBARCO_PASSPORT");
        result.current.updateNetworkConfig({
          host: "192.168.1.100",
          port: 5015,
          useSsl: true,
        });
      });

      const request = result.current.buildCreateRequest();

      expect(request).not.toBeNull();
      expect(request?.pos_type).toBe("GILBARCO_PASSPORT");
      expect(request?.host).toBe("192.168.1.100");
      expect(request?.port).toBe(5015);
      expect(request?.use_ssl).toBe(true);
    });

    it("should build correct request for cloud-based POS", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("SQUARE_REST");
        result.current.updateCloudConfig({
          apiKey: "sk_test_12345",
        });
      });

      const request = result.current.buildCreateRequest();

      expect(request).not.toBeNull();
      expect(request?.pos_type).toBe("SQUARE_REST");
      expect(request?.auth_type).toBe("API_KEY");
      expect(request?.credentials).toEqual({
        type: "API_KEY",
        api_key: "sk_test_12345",
      });
      // Host should be derived from POS type
      expect(request?.host).toContain("square");
    });

    it("should build correct request for manual entry", () => {
      const { result } = renderHook(() => usePOSSetupWizard());

      act(() => {
        result.current.selectPOS("MANUAL_ENTRY");
      });

      const request = result.current.buildCreateRequest();

      expect(request).not.toBeNull();
      expect(request?.pos_type).toBe("MANUAL_ENTRY");
      expect(request?.host).toBe("localhost");
      expect(request?.sync_enabled).toBe(false);
    });
  });
});
