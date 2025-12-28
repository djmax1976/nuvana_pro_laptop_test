/**
 * Scan Detector Unit Tests
 *
 * Tests for the barcode scan detection algorithm and utilities.
 * Verifies correct classification of scanner vs manual keyboard input.
 *
 * Story: Scan-Only Pack Reception Security
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateStdDev,
  calculateIntervals,
  analyzeScanMetrics,
  createDetectionResult,
  validateScanMetricsServerSide,
  quickScanCheck,
  formatMetricsForDisplay,
} from "@/lib/utils/scan-detector";
import type {
  KeystrokeEvent,
  ScanDetectionConfig,
} from "@/types/scan-detection";
import { DEFAULT_SCAN_DETECTION_CONFIG } from "@/types/scan-detection";

describe("Scan Detector Utility", () => {
  describe("calculateStdDev", () => {
    it("should return 0 for empty array", () => {
      expect(calculateStdDev([])).toBe(0);
    });

    it("should return 0 for single value", () => {
      expect(calculateStdDev([10])).toBe(0);
    });

    it("should calculate correct std dev for uniform values", () => {
      // All same values = 0 std dev
      expect(calculateStdDev([10, 10, 10, 10])).toBe(0);
    });

    it("should calculate correct std dev for varied values", () => {
      // Known std dev calculation
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const stdDev = calculateStdDev(values);
      // Sample std dev ≈ 2.138
      expect(stdDev).toBeCloseTo(2.138, 2);
    });

    it("should return higher std dev for more varied data", () => {
      const uniform = calculateStdDev([100, 100, 100, 100]);
      const varied = calculateStdDev([50, 100, 150, 200]);
      expect(varied).toBeGreaterThan(uniform);
    });
  });

  describe("calculateIntervals", () => {
    it("should return empty array for empty input", () => {
      expect(calculateIntervals([])).toEqual([]);
    });

    it("should return empty array for single keystroke", () => {
      const keystrokes: KeystrokeEvent[] = [
        { char: "1", timestamp: 1000, intervalMs: null },
      ];
      expect(calculateIntervals(keystrokes)).toEqual([]);
    });

    it("should calculate correct intervals", () => {
      const keystrokes: KeystrokeEvent[] = [
        { char: "1", timestamp: 1000, intervalMs: null },
        { char: "2", timestamp: 1010, intervalMs: 10 },
        { char: "3", timestamp: 1025, intervalMs: 15 },
        { char: "4", timestamp: 1040, intervalMs: 15 },
      ];
      const intervals = calculateIntervals(keystrokes);
      expect(intervals).toEqual([10, 15, 15]);
    });
  });

  describe("analyzeScanMetrics", () => {
    const config = DEFAULT_SCAN_DETECTION_CONFIG;

    /**
     * Helper to create scanner-like keystroke events
     * Simulates barcode scanner with ~10ms between characters
     */
    function createScannerKeystrokes(length: number = 24): KeystrokeEvent[] {
      const baseTime = Date.now();
      const keystrokes: KeystrokeEvent[] = [];

      for (let i = 0; i < length; i++) {
        const timestamp = baseTime + i * 10; // 10ms between chars
        keystrokes.push({
          char: String(i % 10),
          timestamp,
          intervalMs: i > 0 ? 10 : null,
        });
      }

      return keystrokes;
    }

    /**
     * Helper to create manual typing keystroke events
     * Simulates human typing with ~250ms between characters with variance
     */
    function createManualKeystrokes(length: number = 24): KeystrokeEvent[] {
      const baseTime = Date.now();
      const keystrokes: KeystrokeEvent[] = [];
      let currentTime = baseTime;

      for (let i = 0; i < length; i++) {
        keystrokes.push({
          char: String(i % 10),
          timestamp: currentTime,
          intervalMs: i > 0 ? currentTime - keystrokes[i - 1].timestamp : null,
        });
        // 200-400ms with variance (human-like)
        currentTime += 200 + Math.random() * 200;
      }

      return keystrokes;
    }

    it("should return UNKNOWN for insufficient data", () => {
      const keystrokes = createScannerKeystrokes(3);
      const metrics = analyzeScanMetrics(keystrokes, config);

      expect(metrics.inputMethod).toBe("UNKNOWN");
      expect(metrics.confidence).toBe(0);
      expect(metrics.rejectionReason).toContain("Insufficient data");
    });

    it("should classify scanner input as SCANNED", () => {
      const keystrokes = createScannerKeystrokes(24);
      const metrics = analyzeScanMetrics(keystrokes, config);

      expect(metrics.inputMethod).toBe("SCANNED");
      expect(metrics.confidence).toBeGreaterThanOrEqual(config.minConfidence);
      expect(metrics.avgInterKeyDelayMs).toBeLessThanOrEqual(
        config.maxAvgInterKeyDelay,
      );
      expect(metrics.totalInputTimeMs).toBeLessThanOrEqual(
        config.maxTotalInputTime,
      );
    });

    it("should classify manual typing as MANUAL", () => {
      const keystrokes = createManualKeystrokes(24);
      const metrics = analyzeScanMetrics(keystrokes, config);

      expect(metrics.inputMethod).toBe("MANUAL");
      expect(metrics.rejectionReason).toBeDefined();
      expect(metrics.avgInterKeyDelayMs).toBeGreaterThan(
        config.maxAvgInterKeyDelay,
      );
    });

    it("should calculate correct total input time", () => {
      const keystrokes = createScannerKeystrokes(24);
      const metrics = analyzeScanMetrics(keystrokes, config);

      // 24 chars at 10ms each = ~230ms total (first to last)
      expect(metrics.totalInputTimeMs).toBeLessThan(300);
      expect(metrics.charCount).toBe(24);
    });

    it("should apply first character grace period", () => {
      const baseTime = Date.now();
      const keystrokes: KeystrokeEvent[] = [
        // First char with long delay (scanner focus acquisition)
        { char: "1", timestamp: baseTime, intervalMs: null },
        // Second char after 600ms (beyond grace period)
        { char: "2", timestamp: baseTime + 600, intervalMs: 600 },
        // Remaining chars at scanner speed
        ...Array.from({ length: 22 }, (_, i) => ({
          char: String((i + 2) % 10),
          timestamp: baseTime + 600 + (i + 1) * 10,
          intervalMs: 10,
        })),
      ];

      const metrics = analyzeScanMetrics(keystrokes, config);

      // Should still classify as SCANNED because first interval is grace period
      expect(metrics.inputMethod).toBe("SCANNED");
    });

    it("should detect inconsistent timing as MANUAL", () => {
      const baseTime = Date.now();
      const keystrokes: KeystrokeEvent[] = [];

      // Mix of fast and slow keystrokes (inconsistent)
      for (let i = 0; i < 24; i++) {
        const interval = i % 2 === 0 ? 10 : 300; // Alternating fast/slow
        keystrokes.push({
          char: String(i % 10),
          timestamp: baseTime + i * 155, // Average 155ms
          intervalMs: i > 0 ? interval : null,
        });
      }

      const metrics = analyzeScanMetrics(keystrokes, config);

      // High variance should result in MANUAL classification
      expect(metrics.interKeyStdDevMs).toBeGreaterThan(
        config.maxInterKeyStdDev,
      );
    });

    it("should include all required fields in metrics", () => {
      const keystrokes = createScannerKeystrokes(24);
      const metrics = analyzeScanMetrics(keystrokes, config);

      expect(metrics).toHaveProperty("totalInputTimeMs");
      expect(metrics).toHaveProperty("avgInterKeyDelayMs");
      expect(metrics).toHaveProperty("maxInterKeyDelayMs");
      expect(metrics).toHaveProperty("minInterKeyDelayMs");
      expect(metrics).toHaveProperty("interKeyStdDevMs");
      expect(metrics).toHaveProperty("charCount");
      expect(metrics).toHaveProperty("keystrokeTimestamps");
      expect(metrics).toHaveProperty("inputMethod");
      expect(metrics).toHaveProperty("confidence");
      expect(metrics).toHaveProperty("analyzedAt");
      expect(metrics.keystrokeTimestamps).toHaveLength(24);
    });
  });

  describe("createDetectionResult", () => {
    it("should return pending state for null metrics", () => {
      const result = createDetectionResult(null);

      expect(result.isPending).toBe(true);
      expect(result.isScanned).toBe(false);
      expect(result.isManual).toBe(false);
      expect(result.metrics).toBeNull();
    });

    it("should correctly map SCANNED metrics to result", () => {
      const metrics = {
        totalInputTimeMs: 200,
        avgInterKeyDelayMs: 10,
        maxInterKeyDelayMs: 15,
        minInterKeyDelayMs: 8,
        interKeyStdDevMs: 3,
        charCount: 24,
        keystrokeTimestamps: Array.from({ length: 24 }, (_, i) => i * 10),
        inputMethod: "SCANNED" as const,
        confidence: 0.95,
        analyzedAt: new Date().toISOString(),
      };

      const result = createDetectionResult(metrics);

      expect(result.isScanned).toBe(true);
      expect(result.isManual).toBe(false);
      expect(result.isPending).toBe(false);
      expect(result.confidence).toBe(0.95);
      expect(result.metrics).toBe(metrics);
    });

    it("should correctly map MANUAL metrics to result", () => {
      const metrics = {
        totalInputTimeMs: 5000,
        avgInterKeyDelayMs: 250,
        maxInterKeyDelayMs: 400,
        minInterKeyDelayMs: 150,
        interKeyStdDevMs: 80,
        charCount: 24,
        keystrokeTimestamps: Array.from({ length: 24 }, (_, i) => i * 250),
        inputMethod: "MANUAL" as const,
        confidence: 0.85,
        rejectionReason: "Average delay too high",
        analyzedAt: new Date().toISOString(),
      };

      const result = createDetectionResult(metrics);

      expect(result.isScanned).toBe(false);
      expect(result.isManual).toBe(true);
      expect(result.rejectionReason).toBe("Average delay too high");
    });
  });

  describe("validateScanMetricsServerSide", () => {
    it("should validate authentic scanner metrics", () => {
      const baseTime = Date.now() - 1000; // 1 second ago
      const timestamps = Array.from(
        { length: 24 },
        (_, i) => baseTime + i * 10,
      );

      const metrics = {
        totalInputTimeMs: 230,
        avgInterKeyDelayMs: 10,
        maxInterKeyDelayMs: 12,
        minInterKeyDelayMs: 9,
        interKeyStdDevMs: 2,
        charCount: 24,
        keystrokeTimestamps: timestamps,
        inputMethod: "SCANNED" as const,
        confidence: 0.95,
        analyzedAt: new Date().toISOString(),
      };

      const result = validateScanMetricsServerSide(metrics);

      expect(result.valid).toBe(true);
      expect(result.tamperedDetected).toBe(false);
      expect(result.reanalyzedMetrics?.inputMethod).toBe("SCANNED");
    });

    it("should detect tampered metrics", () => {
      const baseTime = Date.now() - 1000;
      // Timestamps indicate slow typing but client claims fast
      const timestamps = Array.from(
        { length: 24 },
        (_, i) => baseTime + i * 250,
      );

      const metrics = {
        totalInputTimeMs: 200, // Lie: claiming fast
        avgInterKeyDelayMs: 10, // Lie: claiming scanner speed
        maxInterKeyDelayMs: 12,
        minInterKeyDelayMs: 9,
        interKeyStdDevMs: 2,
        charCount: 24,
        keystrokeTimestamps: timestamps, // Truth: slow timing
        inputMethod: "SCANNED" as const,
        confidence: 0.95,
        analyzedAt: new Date().toISOString(),
      };

      const result = validateScanMetricsServerSide(metrics);

      expect(result.tamperedDetected).toBe(true);
      expect(result.valid).toBe(false);
      expect(result.tamperReason).toContain("do not match");
    });

    it("should reject future timestamps", () => {
      const futureTime = Date.now() + 60000; // 1 minute in future
      const timestamps = Array.from(
        { length: 24 },
        (_, i) => futureTime + i * 10,
      );

      const metrics = {
        totalInputTimeMs: 230,
        avgInterKeyDelayMs: 10,
        maxInterKeyDelayMs: 12,
        minInterKeyDelayMs: 9,
        interKeyStdDevMs: 2,
        charCount: 24,
        keystrokeTimestamps: timestamps,
        inputMethod: "SCANNED" as const,
        confidence: 0.95,
        analyzedAt: new Date().toISOString(),
      };

      const result = validateScanMetricsServerSide(metrics);

      expect(result.valid).toBe(false);
      expect(result.tamperedDetected).toBe(true);
      expect(result.tamperReason).toContain("future");
    });

    it("should reject stale timestamps", () => {
      const oldTime = Date.now() - 180000; // 3 minutes ago
      const timestamps = Array.from({ length: 24 }, (_, i) => oldTime + i * 10);

      const metrics = {
        totalInputTimeMs: 230,
        avgInterKeyDelayMs: 10,
        maxInterKeyDelayMs: 12,
        minInterKeyDelayMs: 9,
        interKeyStdDevMs: 2,
        charCount: 24,
        keystrokeTimestamps: timestamps,
        inputMethod: "SCANNED" as const,
        confidence: 0.95,
        analyzedAt: new Date().toISOString(),
      };

      const result = validateScanMetricsServerSide(metrics);

      expect(result.valid).toBe(false);
      expect(result.tamperedDetected).toBe(true);
      expect(result.tamperReason).toContain("old");
    });
  });

  describe("quickScanCheck", () => {
    it("should return likely scan for fast input", () => {
      const baseTime = Date.now();
      const keystrokes: KeystrokeEvent[] = [
        { char: "1", timestamp: baseTime, intervalMs: null },
        { char: "2", timestamp: baseTime + 10, intervalMs: 10 },
        { char: "3", timestamp: baseTime + 20, intervalMs: 10 },
        { char: "4", timestamp: baseTime + 30, intervalMs: 10 },
      ];

      const result = quickScanCheck(keystrokes);

      expect(result.likelyScan).toBe(true);
    });

    it("should return not likely scan for slow input", () => {
      const baseTime = Date.now();
      const keystrokes: KeystrokeEvent[] = [
        { char: "1", timestamp: baseTime, intervalMs: null },
        { char: "2", timestamp: baseTime + 300, intervalMs: 300 },
        { char: "3", timestamp: baseTime + 600, intervalMs: 300 },
        { char: "4", timestamp: baseTime + 900, intervalMs: 300 },
      ];

      const result = quickScanCheck(keystrokes);

      expect(result.likelyScan).toBe(false);
    });

    it("should handle insufficient data gracefully", () => {
      const keystrokes: KeystrokeEvent[] = [
        { char: "1", timestamp: Date.now(), intervalMs: null },
      ];

      const result = quickScanCheck(keystrokes);

      expect(result.likelyScan).toBe(true); // Default to true when unknown
      expect(result.confidence).toBe(0);
    });
  });

  describe("formatMetricsForDisplay", () => {
    it("should format SCANNED metrics correctly", () => {
      const metrics = {
        totalInputTimeMs: 230,
        avgInterKeyDelayMs: 10,
        maxInterKeyDelayMs: 12,
        minInterKeyDelayMs: 9,
        interKeyStdDevMs: 2,
        charCount: 24,
        keystrokeTimestamps: [],
        inputMethod: "SCANNED" as const,
        confidence: 0.95,
        analyzedAt: new Date().toISOString(),
      };

      const display = formatMetricsForDisplay(metrics);

      expect(display).toContain("Scanner");
      expect(display).toContain("95%");
      expect(display).toContain("10.0ms");
    });

    it("should format MANUAL metrics correctly", () => {
      const metrics = {
        totalInputTimeMs: 5000,
        avgInterKeyDelayMs: 250,
        maxInterKeyDelayMs: 400,
        minInterKeyDelayMs: 150,
        interKeyStdDevMs: 80,
        charCount: 24,
        keystrokeTimestamps: [],
        inputMethod: "MANUAL" as const,
        confidence: 0.85,
        analyzedAt: new Date().toISOString(),
      };

      const display = formatMetricsForDisplay(metrics);

      expect(display).toContain("Manual");
      expect(display).toContain("85%");
    });

    it("should format UNKNOWN metrics correctly", () => {
      const metrics = {
        totalInputTimeMs: 0,
        avgInterKeyDelayMs: 0,
        maxInterKeyDelayMs: 0,
        minInterKeyDelayMs: 0,
        interKeyStdDevMs: 0,
        charCount: 5,
        keystrokeTimestamps: [],
        inputMethod: "UNKNOWN" as const,
        confidence: 0,
        analyzedAt: new Date().toISOString(),
      };

      const display = formatMetricsForDisplay(metrics);

      expect(display).toContain("Analyzing");
      expect(display).toContain("5 characters");
    });
  });

  describe("Edge Cases", () => {
    it("should handle exactly threshold values", () => {
      const config = DEFAULT_SCAN_DETECTION_CONFIG;
      const baseTime = Date.now() - 1000;

      // Create keystrokes exactly at threshold values
      const timestamps = Array.from(
        { length: 24 },
        (_, i) => baseTime + i * config.maxAvgInterKeyDelay,
      );

      const keystrokes: KeystrokeEvent[] = timestamps.map((ts, i) => ({
        char: String(i % 10),
        timestamp: ts,
        intervalMs: i > 0 ? config.maxAvgInterKeyDelay : null,
      }));

      const metrics = analyzeScanMetrics(keystrokes, config);

      // At threshold should still be classified as SCANNED
      expect(metrics.inputMethod).toBe("SCANNED");
    });

    it("should handle mixed fast/slow patterns", () => {
      const baseTime = Date.now() - 1000;
      const keystrokes: KeystrokeEvent[] = [];

      // First 12 chars fast, then 12 chars slow
      for (let i = 0; i < 24; i++) {
        const interval = i < 12 ? 10 : 300;
        keystrokes.push({
          char: String(i % 10),
          timestamp: baseTime + i * (i < 12 ? 10 : 300),
          intervalMs: i > 0 ? interval : null,
        });
      }

      const metrics = analyzeScanMetrics(keystrokes);

      // Should be classified as MANUAL due to slow second half
      expect(metrics.inputMethod).toBe("MANUAL");
    });

    it("should handle very long pauses in otherwise fast input", () => {
      const baseTime = Date.now() - 1000;
      const keystrokes: KeystrokeEvent[] = [];

      // Fast input with one long pause in the middle
      for (let i = 0; i < 24; i++) {
        const interval = i === 12 ? 1000 : 10; // 1 second pause in middle
        const prevTime = i > 0 ? keystrokes[i - 1].timestamp : baseTime;
        keystrokes.push({
          char: String(i % 10),
          timestamp: prevTime + (i > 0 ? interval : 0),
          intervalMs: i > 0 ? interval : null,
        });
      }

      const metrics = analyzeScanMetrics(keystrokes);

      // Long pause should trigger MANUAL classification
      expect(metrics.inputMethod).toBe("MANUAL");
      expect(metrics.maxInterKeyDelayMs).toBeGreaterThan(500);
    });
  });
});
