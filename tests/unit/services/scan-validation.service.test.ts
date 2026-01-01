/**
 * @test-level UNIT
 * @test-type Service Tests
 * @story Scan-Only Pack Reception Security
 *
 * Scan Validation Service Unit Tests
 *
 * Traceability Matrix:
 * | Test ID | Requirement | Description |
 * |---------|-------------|-------------|
 * | SVS-001 | SEC-014 | Valid scan metrics accepted |
 * | SVS-002 | SEC-014 | Tampered metrics detected |
 * | SVS-003 | SEC-014 | Future timestamps rejected |
 * | SVS-004 | SEC-014 | Staleness check REMOVED (database validates) |
 * | SVS-005 | SEC-014 | Batch validation - all valid |
 * | SVS-006 | SEC-014 | Batch validation - some invalid |
 * | SVS-007 | SEC-014 | Batch validation - enforcement disabled |
 * | SVS-008 | SEC-014 | Missing timestamps rejected |
 * | SVS-009 | SEC-014 | Timestamp count mismatch rejected |
 * | SVS-010 | SEC-014 | Manual entry detected and rejected |
 *
 * Enterprise Testing Standards:
 * - Tests isolated from external dependencies
 * - Each test covers single behavior
 * - Clear failure messages
 *
 * MCP Guidance Applied:
 * - SEC-014: INPUT_VALIDATION - Database-level validation as authoritative layer
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateScanMetrics,
  validateBatchScanMetrics,
  DEFAULT_SCAN_DETECTION_CONFIG,
  type ScanMetrics,
} from "../../../backend/src/services/lottery/scan-validation.service";

describe("Scan Validation Service", () => {
  /**
   * Helper: Create valid scanner metrics
   * Simulates barcode scanner timing (~10ms between keystrokes)
   */
  function createValidScannerMetrics(baseTime?: number): ScanMetrics {
    const base = baseTime ?? Date.now() - 1000; // 1 second ago
    const timestamps = Array.from({ length: 24 }, (_, i) => base + i * 10);

    return {
      totalInputTimeMs: 230,
      avgInterKeyDelayMs: 10,
      maxInterKeyDelayMs: 12,
      minInterKeyDelayMs: 9,
      interKeyStdDevMs: 2,
      charCount: 24,
      keystrokeTimestamps: timestamps,
      inputMethod: "SCANNED",
      confidence: 0.95,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Helper: Create manual typing metrics
   * Simulates human keyboard entry (~250ms between keystrokes)
   */
  function createManualTypingMetrics(): ScanMetrics {
    const baseTime = Date.now() - 6000; // 6 seconds ago
    const timestamps = Array.from({ length: 24 }, (_, i) => baseTime + i * 250);

    return {
      totalInputTimeMs: 5750,
      avgInterKeyDelayMs: 250,
      maxInterKeyDelayMs: 300,
      minInterKeyDelayMs: 200,
      interKeyStdDevMs: 40,
      charCount: 24,
      keystrokeTimestamps: timestamps,
      inputMethod: "MANUAL",
      confidence: 0.15,
      rejectionReason: "Average delay too high",
      analyzedAt: new Date().toISOString(),
    };
  }

  describe("validateScanMetrics - Single Validation", () => {
    /**
     * SVS-001: Valid scan metrics accepted
     */
    it("SVS-001: should accept valid scanner metrics", () => {
      const metrics = createValidScannerMetrics();
      const result = validateScanMetrics(metrics, "TEST-SERIAL-001");

      expect(result.valid).toBe(true);
      expect(result.inputMethod).toBe("SCANNED");
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.tamperedDetected).toBe(false);
    });

    /**
     * SVS-002: Tampered metrics detected
     * Client claims scanner speed but timestamps show slow typing
     */
    it("SVS-002: should detect tampered metrics (client lies about timing)", () => {
      const baseTime = Date.now() - 6000;
      // Timestamps show slow typing (250ms intervals)
      const timestamps = Array.from(
        { length: 24 },
        (_, i) => baseTime + i * 250,
      );

      // Client falsely claims scanner-speed metrics
      const tamperedMetrics: ScanMetrics = {
        totalInputTimeMs: 230, // Lie: claiming fast
        avgInterKeyDelayMs: 10, // Lie: claiming scanner speed
        maxInterKeyDelayMs: 12,
        minInterKeyDelayMs: 9,
        interKeyStdDevMs: 2,
        charCount: 24,
        keystrokeTimestamps: timestamps, // Truth: slow timing
        inputMethod: "SCANNED",
        confidence: 0.95,
        analyzedAt: new Date().toISOString(),
      };

      const result = validateScanMetrics(tamperedMetrics, "TAMPERED-001");

      expect(result.tamperedDetected).toBe(true);
      expect(result.valid).toBe(false);
      expect(result.tamperReason).toContain("do not match");
    });

    /**
     * SVS-003: Future timestamps rejected
     * Prevents clock manipulation attacks
     */
    it("SVS-003: should reject future timestamps", () => {
      const futureTime = Date.now() + 60000; // 1 minute in future
      const timestamps = Array.from(
        { length: 24 },
        (_, i) => futureTime + i * 10,
      );

      const metrics: ScanMetrics = {
        totalInputTimeMs: 230,
        avgInterKeyDelayMs: 10,
        maxInterKeyDelayMs: 12,
        minInterKeyDelayMs: 9,
        interKeyStdDevMs: 2,
        charCount: 24,
        keystrokeTimestamps: timestamps,
        inputMethod: "SCANNED",
        confidence: 0.95,
        analyzedAt: new Date().toISOString(),
      };

      const result = validateScanMetrics(metrics, "FUTURE-001");

      expect(result.valid).toBe(false);
      expect(result.tamperedDetected).toBe(true);
      expect(result.tamperReason).toContain("future");
    });

    /**
     * SVS-004: Staleness check REMOVED
     * Old timestamps should now be accepted (database provides security)
     *
     * MCP SEC-014: Database-level validation is the authoritative security layer
     *
     * Business rationale:
     * - Users may scan 28+ packs over 30+ minutes
     * - Staleness check was causing false positives
     * - Database validates: unique pack number, pack existence, status
     */
    it("SVS-004: should ACCEPT old timestamps (staleness check removed)", () => {
      const oldTime = Date.now() - 3600000; // 1 hour ago
      const timestamps = Array.from({ length: 24 }, (_, i) => oldTime + i * 10);

      const metrics: ScanMetrics = {
        totalInputTimeMs: 230,
        avgInterKeyDelayMs: 10,
        maxInterKeyDelayMs: 12,
        minInterKeyDelayMs: 9,
        interKeyStdDevMs: 2,
        charCount: 24,
        keystrokeTimestamps: timestamps,
        inputMethod: "SCANNED",
        confidence: 0.95,
        analyzedAt: new Date().toISOString(),
      };

      const result = validateScanMetrics(metrics, "OLD-BUT-VALID-001");

      // Should now pass - staleness validation removed
      expect(result.valid).toBe(true);
      expect(result.tamperedDetected).toBe(false);
      expect(result.inputMethod).toBe("SCANNED");
    });

    /**
     * SVS-008: Missing timestamps rejected
     */
    it("SVS-008: should reject metrics with no timestamps", () => {
      const metrics: ScanMetrics = {
        totalInputTimeMs: 230,
        avgInterKeyDelayMs: 10,
        maxInterKeyDelayMs: 12,
        minInterKeyDelayMs: 9,
        interKeyStdDevMs: 2,
        charCount: 24,
        keystrokeTimestamps: [], // Empty!
        inputMethod: "SCANNED",
        confidence: 0.95,
        analyzedAt: new Date().toISOString(),
      };

      const result = validateScanMetrics(metrics, "NO-TIMESTAMPS-001");

      expect(result.valid).toBe(false);
      expect(result.tamperedDetected).toBe(true);
      expect(result.rejectionReason).toContain("timestamps");
    });

    /**
     * SVS-009: Timestamp count mismatch rejected
     */
    it("SVS-009: should reject metrics with wrong timestamp count", () => {
      const baseTime = Date.now() - 1000;
      // Only 10 timestamps instead of expected 24
      const timestamps = Array.from(
        { length: 10 },
        (_, i) => baseTime + i * 10,
      );

      const metrics: ScanMetrics = {
        totalInputTimeMs: 90,
        avgInterKeyDelayMs: 10,
        maxInterKeyDelayMs: 12,
        minInterKeyDelayMs: 9,
        interKeyStdDevMs: 2,
        charCount: 10, // Matches timestamps but not expected
        keystrokeTimestamps: timestamps,
        inputMethod: "SCANNED",
        confidence: 0.95,
        analyzedAt: new Date().toISOString(),
      };

      const result = validateScanMetrics(metrics, "WRONG-COUNT-001");

      expect(result.valid).toBe(false);
      expect(result.tamperedDetected).toBe(true);
      expect(result.rejectionReason).toContain("Expected");
    });

    /**
     * SVS-010: Manual entry detected and rejected
     */
    it("SVS-010: should reject manual typing (slow keystrokes)", () => {
      const metrics = createManualTypingMetrics();
      const result = validateScanMetrics(metrics, "MANUAL-001");

      expect(result.valid).toBe(false);
      expect(result.inputMethod).toBe("MANUAL");
      expect(result.rejectionReason).toBeDefined();
    });
  });

  describe("validateBatchScanMetrics - Batch Validation", () => {
    /**
     * SVS-005: Batch validation - all valid
     */
    it("SVS-005: should accept batch when all scans are valid", () => {
      const serials = ["SERIAL-001", "SERIAL-002", "SERIAL-003"];
      const metrics = serials.map(() => createValidScannerMetrics());

      const result = validateBatchScanMetrics(serials, metrics, true);

      expect(result.allValid).toBe(true);
      expect(result.rejectedCount).toBe(0);
      expect(result.tamperedCount).toBe(0);
      expect(result.results).toHaveLength(3);
      result.results.forEach((r) => {
        expect(r.valid).toBe(true);
        expect(r.inputMethod).toBe("SCANNED");
      });
    });

    /**
     * SVS-006: Batch validation - some invalid
     */
    it("SVS-006: should reject batch when some scans are invalid", () => {
      const serials = ["VALID-001", "MANUAL-002", "VALID-003"];
      const metrics = [
        createValidScannerMetrics(),
        createManualTypingMetrics(), // This one is manual
        createValidScannerMetrics(),
      ];

      const result = validateBatchScanMetrics(serials, metrics, true);

      expect(result.allValid).toBe(false);
      expect(result.rejectedCount).toBe(1);
      expect(result.results[0].valid).toBe(true);
      expect(result.results[1].valid).toBe(false);
      expect(result.results[1].inputMethod).toBe("MANUAL");
      expect(result.results[2].valid).toBe(true);
    });

    /**
     * SVS-007: Batch validation - enforcement disabled
     */
    it("SVS-007: should accept all when enforcement is disabled", () => {
      const serials = ["SERIAL-001", "SERIAL-002"];
      const metrics = [
        createManualTypingMetrics(),
        createManualTypingMetrics(),
      ];

      // enforceScanOnly = false
      const result = validateBatchScanMetrics(serials, metrics, false);

      expect(result.allValid).toBe(true);
      expect(result.rejectedCount).toBe(0);
      // When disabled, inputMethod should be UNKNOWN (not validated)
      result.results.forEach((r) => {
        expect(r.valid).toBe(true);
        expect(r.inputMethod).toBe("UNKNOWN");
      });
    });

    it("should reject batch when metrics array is empty but enforcement enabled", () => {
      const serials = ["SERIAL-001", "SERIAL-002"];

      const result = validateBatchScanMetrics(serials, [], true);

      expect(result.allValid).toBe(false);
      expect(result.rejectedCount).toBe(2);
      result.results.forEach((r) => {
        expect(r.valid).toBe(false);
        expect(r.tamperedDetected).toBe(true);
      });
    });

    it("should reject batch when metrics count does not match serial count", () => {
      const serials = ["SERIAL-001", "SERIAL-002", "SERIAL-003"];
      const metrics = [createValidScannerMetrics()]; // Only 1 metric for 3 serials

      const result = validateBatchScanMetrics(serials, metrics, true);

      expect(result.allValid).toBe(false);
      expect(result.rejectedCount).toBe(3);
      result.results.forEach((r) => {
        expect(r.valid).toBe(false);
        expect(r.rejectionReason).toContain("count");
      });
    });
  });

  describe("Extended Batch Scanning Scenarios", () => {
    /**
     * Enterprise use case: User scans 28 packs over 30+ minutes
     * First pack scanned at minute 0, last pack at minute 30
     * All should be accepted (staleness removed)
     */
    it("should accept all packs from extended batch session", () => {
      const serials = Array.from({ length: 28 }, (_, i) => `PACK-${i + 1}`);

      // Simulate scans spread over 30 minutes
      const metrics = serials.map((_, index) => {
        // Each pack scanned ~1 minute apart, first pack 30 minutes ago
        const scanTime = Date.now() - (30 - index) * 60000;
        return createValidScannerMetrics(scanTime);
      });

      const result = validateBatchScanMetrics(serials, metrics, true);

      expect(result.allValid).toBe(true);
      expect(result.rejectedCount).toBe(0);
      expect(result.results).toHaveLength(28);
    });

    /**
     * Edge case: Mix of old and recent scans in same batch
     */
    it("should accept mix of old and recent valid scans", () => {
      const serials = ["OLD-PACK", "RECENT-PACK"];
      const metrics = [
        createValidScannerMetrics(Date.now() - 1800000), // 30 minutes ago
        createValidScannerMetrics(Date.now() - 5000), // 5 seconds ago
      ];

      const result = validateBatchScanMetrics(serials, metrics, true);

      expect(result.allValid).toBe(true);
      expect(result.results[0].valid).toBe(true);
      expect(result.results[1].valid).toBe(true);
    });
  });
});
