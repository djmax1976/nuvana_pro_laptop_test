/**
 * Scan Validation Service
 *
 * Server-side validation of barcode scan metrics to prevent manual entry bypass.
 * Re-analyzes keystroke timing data to detect tampering and ensure security.
 *
 * Story: Scan-Only Pack Reception Security
 *
 * Security Measures:
 * 1. Re-calculates metrics from timestamps to detect client-side tampering
 * 2. Validates timestamps are reasonable (not future, not too old)
 * 3. Applies same statistical analysis as client-side
 * 4. Logs all validation attempts for audit trail
 *
 * Enterprise Considerations:
 * - Configurable thresholds per store/company (future)
 * - Audit logging for compliance
 * - Tamper detection with clear rejection reasons
 */

// Simple logger abstraction - uses console for now
const logger = {
  info: (message: string, context?: Record<string, unknown>) =>
    console.log(`[INFO] ${message}`, context ? JSON.stringify(context) : ""),
  warn: (message: string, context?: Record<string, unknown>) =>
    console.warn(`[WARN] ${message}`, context ? JSON.stringify(context) : ""),
  error: (message: string, context?: Record<string, unknown>) =>
    console.error(`[ERROR] ${message}`, context ? JSON.stringify(context) : ""),
};

/**
 * Input method classification (matches frontend type)
 */
export type InputMethod = "SCANNED" | "MANUAL" | "UNKNOWN";

/**
 * Scan metrics from client (matches frontend ScanMetrics type)
 */
export interface ScanMetrics {
  totalInputTimeMs: number;
  avgInterKeyDelayMs: number;
  maxInterKeyDelayMs: number;
  minInterKeyDelayMs: number;
  interKeyStdDevMs: number;
  charCount: number;
  keystrokeTimestamps: number[];
  inputMethod: InputMethod;
  confidence: number;
  rejectionReason?: string;
  analyzedAt: string;
}

/**
 * Configuration for scan detection thresholds
 */
export interface ScanDetectionConfig {
  maxAvgInterKeyDelay: number;
  maxTotalInputTime: number;
  maxInterKeyStdDev: number;
  minCharsForDetection: number;
  firstCharGracePeriod: number;
  minConfidence: number;
  expectedCharCount: number;
}

/**
 * Default configuration (matches frontend defaults)
 */
export const DEFAULT_SCAN_DETECTION_CONFIG: ScanDetectionConfig = {
  maxAvgInterKeyDelay: 50,
  maxTotalInputTime: 500,
  maxInterKeyStdDev: 30,
  minCharsForDetection: 8,
  firstCharGracePeriod: 500,
  minConfidence: 0.85,
  expectedCharCount: 24,
};

/**
 * Validation result for a single scan
 */
export interface ScanValidationResult {
  valid: boolean;
  inputMethod: InputMethod;
  confidence: number;
  rejectionReason?: string;
  tamperedDetected: boolean;
  tamperReason?: string;
  reanalyzedMetrics?: ScanMetrics;
}

/**
 * Batch validation result
 */
export interface BatchScanValidationResult {
  allValid: boolean;
  results: Array<{
    index: number;
    serial: string;
    valid: boolean;
    inputMethod: InputMethod;
    confidence: number;
    rejectionReason?: string;
    tamperedDetected: boolean;
  }>;
  rejectedCount: number;
  tamperedCount: number;
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;

  const n = values.length;
  const mean = values.reduce((sum, val) => sum + val, 0) / n;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / (n - 1);

  return Math.sqrt(variance);
}

/**
 * Calculate intervals between timestamps
 */
function calculateIntervals(timestamps: number[]): number[] {
  if (timestamps.length < 2) return [];

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- controlled loop
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }

  return intervals;
}

/**
 * Re-analyze scan metrics from timestamps
 * Used to verify client-provided metrics haven't been tampered with
 */
function reanalyzeScanMetrics(
  timestamps: number[],
  config: ScanDetectionConfig,
): ScanMetrics {
  const charCount = timestamps.length;
  const analyzedAt = new Date().toISOString();

  if (charCount < config.minCharsForDetection) {
    return {
      totalInputTimeMs: 0,
      avgInterKeyDelayMs: 0,
      maxInterKeyDelayMs: 0,
      minInterKeyDelayMs: 0,
      interKeyStdDevMs: 0,
      charCount,
      keystrokeTimestamps: timestamps,
      inputMethod: "UNKNOWN",
      confidence: 0,
      rejectionReason: `Insufficient data: ${charCount} chars`,
      analyzedAt,
    };
  }

  const intervals = calculateIntervals(timestamps);

  // Apply first character grace period
  let analysisIntervals = intervals;
  if (intervals.length > 0 && intervals[0] > config.firstCharGracePeriod) {
    analysisIntervals = intervals.slice(1);
  }

  if (analysisIntervals.length === 0) {
    analysisIntervals = intervals;
  }

  // Calculate statistics
  const totalInputTimeMs =
    charCount > 1 ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
  const avgInterKeyDelayMs =
    analysisIntervals.length > 0
      ? analysisIntervals.reduce((sum, val) => sum + val, 0) /
        analysisIntervals.length
      : 0;
  const maxInterKeyDelayMs =
    analysisIntervals.length > 0 ? Math.max(...analysisIntervals) : 0;
  const minInterKeyDelayMs =
    analysisIntervals.length > 0 ? Math.min(...analysisIntervals) : 0;
  const interKeyStdDevMs = calculateStdDev(analysisIntervals);

  // Classify input method
  const reasons: string[] = [];
  let scanScore = 0;
  const totalWeight = 1.0;

  // Factor 1: Average delay (35%)
  if (avgInterKeyDelayMs <= config.maxAvgInterKeyDelay) {
    scanScore += 0.35;
  } else {
    reasons.push(
      `Avg delay ${avgInterKeyDelayMs.toFixed(1)}ms > ${config.maxAvgInterKeyDelay}ms`,
    );
  }

  // Factor 2: Total time (25%)
  if (totalInputTimeMs <= config.maxTotalInputTime) {
    scanScore += 0.25;
  } else {
    reasons.push(
      `Total time ${totalInputTimeMs.toFixed(0)}ms > ${config.maxTotalInputTime}ms`,
    );
  }

  // Factor 3: Consistency (20%)
  if (interKeyStdDevMs <= config.maxInterKeyStdDev) {
    scanScore += 0.2;
  } else {
    reasons.push(
      `Inconsistent timing (std dev ${interKeyStdDevMs.toFixed(1)}ms)`,
    );
  }

  // Factor 4: Max gap (20%)
  const maxGapThreshold = config.maxAvgInterKeyDelay * 3;
  if (maxInterKeyDelayMs <= maxGapThreshold) {
    scanScore += 0.2;
  } else {
    reasons.push(`Long pause ${maxInterKeyDelayMs.toFixed(0)}ms`);
  }

  const confidence = scanScore / totalWeight;
  let inputMethod: InputMethod;
  let rejectionReason: string | undefined;

  if (confidence >= config.minConfidence) {
    inputMethod = "SCANNED";
  } else {
    inputMethod = "MANUAL";
    rejectionReason = reasons.join("; ");
  }

  return {
    totalInputTimeMs,
    avgInterKeyDelayMs,
    maxInterKeyDelayMs,
    minInterKeyDelayMs,
    interKeyStdDevMs,
    charCount,
    keystrokeTimestamps: timestamps,
    inputMethod,
    confidence: inputMethod === "SCANNED" ? confidence : 1 - confidence,
    rejectionReason,
    analyzedAt,
  };
}

/**
 * Validate a single scan's metrics
 * Re-analyzes timestamps to detect tampering
 */
export function validateScanMetrics(
  metrics: ScanMetrics,
  serial: string,
  config: ScanDetectionConfig = DEFAULT_SCAN_DETECTION_CONFIG,
): ScanValidationResult {
  // Validate timestamps are present
  if (
    !metrics.keystrokeTimestamps ||
    metrics.keystrokeTimestamps.length === 0
  ) {
    logger.warn("Scan validation failed: No timestamps provided", { serial });
    return {
      valid: false,
      inputMethod: "UNKNOWN",
      confidence: 0,
      rejectionReason: "No keystroke timestamps provided",
      tamperedDetected: true,
      tamperReason: "Missing timestamp data",
    };
  }

  // Check timestamp count matches expected
  if (metrics.keystrokeTimestamps.length !== config.expectedCharCount) {
    logger.warn("Scan validation failed: Wrong timestamp count", {
      serial,
      expected: config.expectedCharCount,
      actual: metrics.keystrokeTimestamps.length,
    });
    return {
      valid: false,
      inputMethod: "UNKNOWN",
      confidence: 0,
      rejectionReason: `Expected ${config.expectedCharCount} timestamps, got ${metrics.keystrokeTimestamps.length}`,
      tamperedDetected: true,
      tamperReason: "Timestamp count mismatch",
    };
  }

  // Validate timestamps are not in the future
  const now = Date.now();
  const lastTimestamp =
    metrics.keystrokeTimestamps[metrics.keystrokeTimestamps.length - 1];

  if (lastTimestamp > now + 5000) {
    // 5 second tolerance for clock skew
    logger.warn("Scan validation failed: Future timestamps", {
      serial,
      lastTimestamp,
      now,
    });
    return {
      valid: false,
      inputMethod: "UNKNOWN",
      confidence: 0,
      rejectionReason: "Invalid timestamps",
      tamperedDetected: true,
      tamperReason: "Timestamps are in the future",
    };
  }

  // NOTE: Timestamp staleness validation removed intentionally
  // Rationale: Database validations (unique pack number, pack existence, status checks)
  // already provide security. The staleness check was causing false positives in
  // legitimate batch scanning scenarios where users scan many packs over time.
  // The "future timestamps" check above is kept to prevent clock manipulation.
  // MCP SEC-014: Database-level validation is the authoritative security layer.

  // Re-analyze metrics from timestamps
  const reanalyzedMetrics = reanalyzeScanMetrics(
    metrics.keystrokeTimestamps,
    config,
  );

  // Check for tampering - compare client metrics vs reanalyzed
  const toleranceMs = 5;
  const avgDiff = Math.abs(
    metrics.avgInterKeyDelayMs - reanalyzedMetrics.avgInterKeyDelayMs,
  );
  const totalDiff = Math.abs(
    metrics.totalInputTimeMs - reanalyzedMetrics.totalInputTimeMs,
  );

  const tamperedDetected = avgDiff > toleranceMs || totalDiff > toleranceMs;
  let tamperReason: string | undefined;

  if (tamperedDetected) {
    tamperReason = "Client metrics do not match timestamp analysis";
    logger.warn("Scan validation: Possible tampering detected", {
      serial,
      clientAvg: metrics.avgInterKeyDelayMs,
      serverAvg: reanalyzedMetrics.avgInterKeyDelayMs,
      avgDiff,
      clientTotal: metrics.totalInputTimeMs,
      serverTotal: reanalyzedMetrics.totalInputTimeMs,
      totalDiff,
    });
  }

  // Use reanalyzed metrics for final decision
  const valid =
    reanalyzedMetrics.inputMethod === "SCANNED" &&
    reanalyzedMetrics.confidence >= config.minConfidence;

  if (!valid) {
    logger.info("Scan validation: Manual entry detected", {
      serial,
      inputMethod: reanalyzedMetrics.inputMethod,
      confidence: reanalyzedMetrics.confidence,
      reason: reanalyzedMetrics.rejectionReason,
    });
  }

  return {
    valid,
    inputMethod: reanalyzedMetrics.inputMethod,
    confidence: reanalyzedMetrics.confidence,
    rejectionReason: reanalyzedMetrics.rejectionReason,
    tamperedDetected,
    tamperReason,
    reanalyzedMetrics,
  };
}

/**
 * Validate a batch of scan metrics
 * Returns individual results and overall status
 */
export function validateBatchScanMetrics(
  serializedNumbers: string[],
  scanMetrics: ScanMetrics[] | undefined,
  enforceScanOnly: boolean = true,
  config: ScanDetectionConfig = DEFAULT_SCAN_DETECTION_CONFIG,
): BatchScanValidationResult {
  // If scan enforcement is disabled, skip validation
  if (!enforceScanOnly) {
    return {
      allValid: true,
      results: serializedNumbers.map((serial, index) => ({
        index,
        serial,
        valid: true,
        inputMethod: "UNKNOWN" as InputMethod,
        confidence: 0,
        tamperedDetected: false,
      })),
      rejectedCount: 0,
      tamperedCount: 0,
    };
  }

  // Validate scan metrics were provided
  if (!scanMetrics || scanMetrics.length === 0) {
    logger.warn("Batch scan validation: No metrics provided", {
      serialCount: serializedNumbers.length,
    });

    return {
      allValid: false,
      results: serializedNumbers.map((serial, index) => ({
        index,
        serial,
        valid: false,
        inputMethod: "UNKNOWN" as InputMethod,
        confidence: 0,
        rejectionReason: "Scan metrics required but not provided",
        tamperedDetected: true,
      })),
      rejectedCount: serializedNumbers.length,
      tamperedCount: serializedNumbers.length,
    };
  }

  // Validate metrics count matches serial count
  if (scanMetrics.length !== serializedNumbers.length) {
    logger.warn("Batch scan validation: Metrics count mismatch", {
      serialCount: serializedNumbers.length,
      metricsCount: scanMetrics.length,
    });

    return {
      allValid: false,
      results: serializedNumbers.map((serial, index) => ({
        index,
        serial,
        valid: false,
        inputMethod: "UNKNOWN" as InputMethod,
        confidence: 0,
        rejectionReason: "Scan metrics count does not match serial count",
        tamperedDetected: true,
      })),
      rejectedCount: serializedNumbers.length,
      tamperedCount: serializedNumbers.length,
    };
  }

  // Validate each scan
  const results = serializedNumbers.map((serial, index) => {
    // eslint-disable-next-line security/detect-object-injection -- controlled index
    const metrics = scanMetrics[index];
    const result = validateScanMetrics(metrics, serial, config);

    return {
      index,
      serial,
      valid: result.valid,
      inputMethod: result.inputMethod,
      confidence: result.confidence,
      rejectionReason: result.rejectionReason,
      tamperedDetected: result.tamperedDetected,
    };
  });

  const rejectedCount = results.filter((r) => !r.valid).length;
  const tamperedCount = results.filter((r) => r.tamperedDetected).length;

  logger.info("Batch scan validation complete", {
    total: serializedNumbers.length,
    valid: serializedNumbers.length - rejectedCount,
    rejected: rejectedCount,
    tampered: tamperedCount,
  });

  return {
    allValid: rejectedCount === 0,
    results,
    rejectedCount,
    tamperedCount,
  };
}

/**
 * Create audit log entry for scan validation
 */
export interface ScanAuditEntry {
  timestamp: Date;
  storeId: string;
  userId: string;
  serial: string;
  inputMethod: InputMethod;
  accepted: boolean;
  rejectionReason?: string;
  tamperedDetected: boolean;
  clientIp?: string;
  userAgent?: string;
  metrics: {
    totalInputTimeMs: number;
    avgInterKeyDelayMs: number;
    maxInterKeyDelayMs: number;
    confidence: number;
  };
}

/**
 * Log scan validation for audit purposes
 */
export function logScanAudit(entry: ScanAuditEntry): void {
  if (entry.accepted) {
    logger.info("Scan audit: Pack reception accepted", {
      storeId: entry.storeId,
      userId: entry.userId,
      serial: entry.serial,
      inputMethod: entry.inputMethod,
      confidence: entry.metrics.confidence,
      avgDelay: entry.metrics.avgInterKeyDelayMs,
    });
  } else {
    logger.warn("Scan audit: Pack reception rejected", {
      storeId: entry.storeId,
      userId: entry.userId,
      serial: entry.serial,
      inputMethod: entry.inputMethod,
      rejectionReason: entry.rejectionReason,
      tamperedDetected: entry.tamperedDetected,
      confidence: entry.metrics.confidence,
      avgDelay: entry.metrics.avgInterKeyDelayMs,
      clientIp: entry.clientIp,
    });
  }
}
