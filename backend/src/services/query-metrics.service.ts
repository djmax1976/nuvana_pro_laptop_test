/**
 * Query Metrics Service
 *
 * Phase 6.1 & 6.2: Monitoring & Alerting
 *
 * Enterprise coding standards applied:
 * - LM-001: LOGGING - Structured logs with severity levels, exclude secrets/PII
 * - LM-002: MONITORING - Health, performance, and dependency probes
 * - LM-004: METRICS - SLO-aligned metrics with history retention
 * - DB-008: QUERY_LOGGING - Log parameterized queries, scrub sensitive values
 * - CDP-005: DATA_MASKING - Mask sensitive data in logs
 * - API-003: ERROR_HANDLING - Centralized exception handling with correlation IDs
 *
 * Provides:
 * - Query timing middleware for Prisma
 * - Slow query detection with configurable thresholds
 * - N+1 query pattern detection
 * - Transaction timeout tracking
 * - Dashboard metrics endpoint data
 */

/**
 * Query timing record for individual queries
 * Excludes sensitive data (parameters, actual values)
 */
interface QueryTimingRecord {
  /** Timestamp when query was executed */
  timestamp: Date;
  /** Prisma model being queried (e.g., 'User', 'LotteryPack') */
  model: string;
  /** Prisma action (e.g., 'findMany', 'create', 'update') */
  action: string;
  /** Query execution time in milliseconds */
  durationMs: number;
  /** Whether this was flagged as a slow query */
  isSlow: boolean;
  /** Request correlation ID for tracing (if available) */
  correlationId?: string;
}

/**
 * N+1 detection record
 * Tracks rapid repeated queries to the same model
 */
interface N1DetectionRecord {
  /** Timestamp of detection */
  timestamp: Date;
  /** Model exhibiting N+1 pattern */
  model: string;
  /** Action being repeated */
  action: string;
  /** Number of repeated queries in the window */
  queryCount: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Request correlation ID (if available) */
  correlationId?: string;
}

/**
 * Transaction timeout record
 */
interface TransactionTimeoutRecord {
  /** Timestamp of timeout */
  timestamp: Date;
  /** Operation that timed out (masked for PII) */
  operation: string;
  /** Configured timeout in milliseconds */
  timeoutMs: number;
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Aggregated metrics for dashboard
 */
export interface QueryMetrics {
  /** Timestamp when metrics were collected */
  collectedAt: Date;
  /** Time window covered by these metrics */
  windowMinutes: number;
  /** Total query count in window */
  totalQueries: number;
  /** Average query time in milliseconds */
  averageQueryTimeMs: number;
  /** 95th percentile query time */
  p95QueryTimeMs: number;
  /** 99th percentile query time */
  p99QueryTimeMs: number;
  /** Slow query count */
  slowQueryCount: number;
  /** Slow query rate (percentage) */
  slowQueryRate: number;
  /** N+1 detection alerts */
  n1Detections: number;
  /** Transaction timeout count */
  transactionTimeouts: number;
  /** Transaction timeout rate (percentage) */
  transactionTimeoutRate: number;
  /** Queries by model (top 10) */
  queriesByModel: Array<{ model: string; count: number; avgMs: number }>;
  /** Queries by action (top 10) */
  queriesByAction: Array<{ action: string; count: number; avgMs: number }>;
  /** Recent slow queries (last 10, sanitized) */
  recentSlowQueries: Array<{
    timestamp: string;
    model: string;
    action: string;
    durationMs: number;
  }>;
  /** Alert flags */
  alerts: {
    highSlowQueryRate: boolean;
    n1PatternsDetected: boolean;
    highTimeoutRate: boolean;
    queryVolumeSpike: boolean;
  };
}

/**
 * Configuration for query metrics service
 */
export interface QueryMetricsConfig {
  /** Threshold in ms to flag a query as slow (default: 1000) */
  slowQueryThresholdMs: number;
  /** Time window for N+1 detection in ms (default: 100) */
  n1DetectionWindowMs: number;
  /** Minimum queries in window to trigger N+1 alert (default: 5) */
  n1DetectionThreshold: number;
  /** Maximum records to retain for analysis (default: 10000) */
  maxRecordsRetained: number;
  /** Metrics aggregation window in minutes (default: 5) */
  metricsWindowMinutes: number;
  /** Enable detailed logging (default: false in production) */
  enableDetailedLogging: boolean;
  /** Alert threshold for slow query rate percentage (default: 10) */
  slowQueryRateAlertThreshold: number;
  /** Alert threshold for timeout rate percentage (default: 5) */
  timeoutRateAlertThreshold: number;
  /** Baseline query count for spike detection (default: 1000) */
  queryVolumeBaseline: number;
  /** Multiplier for query volume spike detection (default: 3) */
  queryVolumeSpikeMultiplier: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: QueryMetricsConfig = {
  slowQueryThresholdMs: 1000,
  n1DetectionWindowMs: 100,
  n1DetectionThreshold: 5,
  maxRecordsRetained: 10000,
  metricsWindowMinutes: 5,
  enableDetailedLogging: process.env.NODE_ENV !== "production",
  slowQueryRateAlertThreshold: 10,
  timeoutRateAlertThreshold: 5,
  queryVolumeBaseline: 1000,
  queryVolumeSpikeMultiplier: 3,
};

/**
 * Query Metrics Service
 *
 * Singleton service that collects and aggregates query performance metrics.
 * Thread-safe through JavaScript's single-threaded event loop.
 *
 * Design decisions:
 * - In-memory storage for low latency (not persistent)
 * - Rolling window approach prevents unbounded memory growth
 * - Sensitive data (parameters, values) never stored
 * - Correlation IDs enable request tracing without PII
 */
class QueryMetricsService {
  private config: QueryMetricsConfig;
  private queryTimings: QueryTimingRecord[] = [];
  private n1Detections: N1DetectionRecord[] = [];
  private transactionTimeouts: TransactionTimeoutRecord[] = [];
  private totalTransactions: number = 0;

  // N+1 detection state: tracks recent queries per model+action
  private recentQueries: Map<
    string,
    { timestamps: number[]; correlationId?: string }
  > = new Map();

  // Metrics cache for efficient retrieval
  private cachedMetrics: QueryMetrics | null = null;
  private cacheValidUntil: number = 0;
  private readonly CACHE_TTL_MS = 5000; // 5 second cache

  constructor(config: Partial<QueryMetricsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // LM-001: Structured log at service initialization
    console.log(
      JSON.stringify({
        level: "info",
        service: "QueryMetricsService",
        event: "initialized",
        config: {
          slowQueryThresholdMs: this.config.slowQueryThresholdMs,
          n1DetectionWindowMs: this.config.n1DetectionWindowMs,
          n1DetectionThreshold: this.config.n1DetectionThreshold,
          metricsWindowMinutes: this.config.metricsWindowMinutes,
        },
      }),
    );
  }

  /**
   * Record a query execution timing
   *
   * CDP-005: No sensitive data (parameters, values) is logged
   * LM-001: Structured logging with correlation ID
   *
   * @param model - Prisma model name
   * @param action - Prisma action (findMany, create, etc.)
   * @param durationMs - Query execution time
   * @param correlationId - Optional request correlation ID
   */
  recordQuery(
    model: string,
    action: string,
    durationMs: number,
    correlationId?: string,
  ): void {
    const timestamp = new Date();
    const isSlow = durationMs >= this.config.slowQueryThresholdMs;

    // Record timing
    const record: QueryTimingRecord = {
      timestamp,
      model,
      action,
      durationMs,
      isSlow,
      correlationId,
    };
    this.queryTimings.push(record);

    // Enforce retention limit (FIFO)
    if (this.queryTimings.length > this.config.maxRecordsRetained) {
      this.queryTimings.shift();
    }

    // Check for N+1 pattern
    this.checkN1Pattern(model, action, timestamp.getTime(), correlationId);

    // Log slow queries
    if (isSlow) {
      // LM-001: Structured log with severity
      console.warn(
        JSON.stringify({
          level: "warn",
          service: "QueryMetricsService",
          event: "slow_query",
          model,
          action,
          durationMs,
          thresholdMs: this.config.slowQueryThresholdMs,
          correlationId: correlationId || "none",
          timestamp: timestamp.toISOString(),
        }),
      );
    } else if (this.config.enableDetailedLogging) {
      // Only in non-production for debugging
      console.log(
        JSON.stringify({
          level: "debug",
          service: "QueryMetricsService",
          event: "query_executed",
          model,
          action,
          durationMs,
          correlationId: correlationId || "none",
        }),
      );
    }

    // Invalidate cache
    this.cachedMetrics = null;
  }

  /**
   * Check for N+1 query patterns
   *
   * Detects rapid repeated queries to the same model+action,
   * which is a common indicator of N+1 query problems.
   *
   * @param model - Model being queried
   * @param action - Action being performed
   * @param timestamp - Query timestamp
   * @param correlationId - Request correlation ID
   */
  private checkN1Pattern(
    model: string,
    action: string,
    timestamp: number,
    correlationId?: string,
  ): void {
    const key = `${model}:${action}`;
    const windowStart = timestamp - this.config.n1DetectionWindowMs;

    // Get or create tracking entry
    let tracking = this.recentQueries.get(key);
    if (!tracking) {
      tracking = { timestamps: [], correlationId };
      this.recentQueries.set(key, tracking);
    }

    // Add current timestamp
    tracking.timestamps.push(timestamp);

    // Filter to queries within window
    tracking.timestamps = tracking.timestamps.filter((t) => t >= windowStart);

    // Check if threshold exceeded
    if (tracking.timestamps.length >= this.config.n1DetectionThreshold) {
      const detection: N1DetectionRecord = {
        timestamp: new Date(timestamp),
        model,
        action,
        queryCount: tracking.timestamps.length,
        windowMs: this.config.n1DetectionWindowMs,
        correlationId,
      };
      this.n1Detections.push(detection);

      // Enforce retention limit
      if (this.n1Detections.length > this.config.maxRecordsRetained / 10) {
        this.n1Detections.shift();
      }

      // LM-001: Alert log for N+1 detection
      console.error(
        JSON.stringify({
          level: "error",
          service: "QueryMetricsService",
          event: "n1_pattern_detected",
          model,
          action,
          queryCount: tracking.timestamps.length,
          windowMs: this.config.n1DetectionWindowMs,
          correlationId: correlationId || "none",
          message: `Potential N+1 query detected: ${tracking.timestamps.length} ${model}.${action} queries in ${this.config.n1DetectionWindowMs}ms`,
        }),
      );

      // Reset tracking to avoid repeated alerts for same pattern
      tracking.timestamps = [];
    }
  }

  /**
   * Record a transaction timeout
   *
   * CDP-005: Operation names are sanitized to remove sensitive info
   *
   * @param operation - Operation that timed out (will be sanitized)
   * @param timeoutMs - Configured timeout that was exceeded
   * @param correlationId - Request correlation ID
   */
  recordTransactionTimeout(
    operation: string,
    timeoutMs: number,
    correlationId?: string,
  ): void {
    this.totalTransactions++;

    // CDP-005: Sanitize operation name (remove any potential IDs or parameters)
    const sanitizedOperation = this.sanitizeOperationName(operation);

    const record: TransactionTimeoutRecord = {
      timestamp: new Date(),
      operation: sanitizedOperation,
      timeoutMs,
      correlationId,
    };
    this.transactionTimeouts.push(record);

    // Enforce retention limit
    if (this.transactionTimeouts.length > this.config.maxRecordsRetained / 10) {
      this.transactionTimeouts.shift();
    }

    // LM-001: Alert log for timeout
    console.error(
      JSON.stringify({
        level: "error",
        service: "QueryMetricsService",
        event: "transaction_timeout",
        operation: sanitizedOperation,
        timeoutMs,
        correlationId: correlationId || "none",
        message: `Transaction timeout after ${timeoutMs}ms: ${sanitizedOperation}`,
      }),
    );

    // Invalidate cache
    this.cachedMetrics = null;
  }

  /**
   * Record a successful transaction (for timeout rate calculation)
   */
  recordTransactionSuccess(): void {
    this.totalTransactions++;
  }

  /**
   * Sanitize operation name to remove potential PII/sensitive data
   *
   * CDP-005: Data masking implementation
   *
   * @param operation - Raw operation name
   * @returns Sanitized operation name
   */
  private sanitizeOperationName(operation: string): string {
    // Remove UUIDs
    let sanitized = operation.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "[UUID]",
    );

    // Remove numeric IDs
    sanitized = sanitized.replace(/\b\d{4,}\b/g, "[ID]");

    // Remove potential email patterns
    sanitized = sanitized.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      "[EMAIL]",
    );

    // Remove potential phone numbers
    sanitized = sanitized.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[PHONE]");

    return sanitized;
  }

  /**
   * Get aggregated metrics for dashboard
   *
   * LM-002: Performance metrics for monitoring dashboard
   * LM-004: SLO-aligned metrics with percentiles
   *
   * @returns Aggregated query metrics
   */
  getMetrics(): QueryMetrics {
    const now = Date.now();

    // Return cached metrics if still valid
    if (this.cachedMetrics && now < this.cacheValidUntil) {
      return this.cachedMetrics;
    }

    const windowMs = this.config.metricsWindowMinutes * 60 * 1000;
    const windowStart = new Date(now - windowMs);

    // Filter records to current window
    const recentQueries = this.queryTimings.filter(
      (q) => q.timestamp >= windowStart,
    );
    const recentN1 = this.n1Detections.filter(
      (n) => n.timestamp >= windowStart,
    );
    const recentTimeouts = this.transactionTimeouts.filter(
      (t) => t.timestamp >= windowStart,
    );

    // Calculate basic stats
    const totalQueries = recentQueries.length;
    const slowQueries = recentQueries.filter((q) => q.isSlow);
    const slowQueryCount = slowQueries.length;
    const slowQueryRate =
      totalQueries > 0 ? (slowQueryCount / totalQueries) * 100 : 0;

    // Calculate average and percentiles
    const durations = recentQueries
      .map((q) => q.durationMs)
      .sort((a, b) => a - b);
    const averageQueryTimeMs =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;
    const p95QueryTimeMs = this.percentile(durations, 95);
    const p99QueryTimeMs = this.percentile(durations, 99);

    // Calculate timeout rate
    const transactionTimeouts = recentTimeouts.length;
    const transactionTimeoutRate =
      this.totalTransactions > 0
        ? (transactionTimeouts / this.totalTransactions) * 100
        : 0;

    // Aggregate by model
    const modelStats = new Map<string, { count: number; totalMs: number }>();
    for (const q of recentQueries) {
      const existing = modelStats.get(q.model) || { count: 0, totalMs: 0 };
      existing.count++;
      existing.totalMs += q.durationMs;
      modelStats.set(q.model, existing);
    }
    const queriesByModel = Array.from(modelStats.entries())
      .map(([model, stats]) => ({
        model,
        count: stats.count,
        avgMs: Math.round(stats.totalMs / stats.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Aggregate by action
    const actionStats = new Map<string, { count: number; totalMs: number }>();
    for (const q of recentQueries) {
      const existing = actionStats.get(q.action) || { count: 0, totalMs: 0 };
      existing.count++;
      existing.totalMs += q.durationMs;
      actionStats.set(q.action, existing);
    }
    const queriesByAction = Array.from(actionStats.entries())
      .map(([action, stats]) => ({
        action,
        count: stats.count,
        avgMs: Math.round(stats.totalMs / stats.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Recent slow queries (sanitized, last 10)
    const recentSlowQueries = slowQueries
      .slice(-10)
      .map((q) => ({
        timestamp: q.timestamp.toISOString(),
        model: q.model,
        action: q.action,
        durationMs: q.durationMs,
      }))
      .reverse();

    // Alert flags
    const alerts = {
      highSlowQueryRate:
        slowQueryRate > this.config.slowQueryRateAlertThreshold,
      n1PatternsDetected: recentN1.length > 0,
      highTimeoutRate:
        transactionTimeoutRate > this.config.timeoutRateAlertThreshold,
      queryVolumeSpike:
        totalQueries >
        this.config.queryVolumeBaseline *
          this.config.queryVolumeSpikeMultiplier,
    };

    const metrics: QueryMetrics = {
      collectedAt: new Date(),
      windowMinutes: this.config.metricsWindowMinutes,
      totalQueries,
      averageQueryTimeMs: Math.round(averageQueryTimeMs),
      p95QueryTimeMs,
      p99QueryTimeMs,
      slowQueryCount,
      slowQueryRate: Math.round(slowQueryRate * 100) / 100,
      n1Detections: recentN1.length,
      transactionTimeouts,
      transactionTimeoutRate: Math.round(transactionTimeoutRate * 100) / 100,
      queriesByModel,
      queriesByAction,
      recentSlowQueries,
      alerts,
    };

    // Cache metrics
    this.cachedMetrics = metrics;
    this.cacheValidUntil = now + this.CACHE_TTL_MS;

    return metrics;
  }

  /**
   * Calculate percentile from sorted array
   *
   * @param sortedArr - Sorted array of numbers
   * @param p - Percentile (0-100)
   * @returns Percentile value
   */
  private percentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, index)];
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.queryTimings = [];
    this.n1Detections = [];
    this.transactionTimeouts = [];
    this.totalTransactions = 0;
    this.recentQueries.clear();
    this.cachedMetrics = null;
    this.cacheValidUntil = 0;
  }

  /**
   * Update configuration at runtime
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<QueryMetricsConfig>): void {
    this.config = { ...this.config, ...config };

    // LM-001: Log configuration change
    console.log(
      JSON.stringify({
        level: "info",
        service: "QueryMetricsService",
        event: "config_updated",
        config: {
          slowQueryThresholdMs: this.config.slowQueryThresholdMs,
          n1DetectionWindowMs: this.config.n1DetectionWindowMs,
          n1DetectionThreshold: this.config.n1DetectionThreshold,
        },
      }),
    );
  }

  /**
   * Check if alerts are active
   *
   * @returns True if any alert is active
   */
  hasActiveAlerts(): boolean {
    const metrics = this.getMetrics();
    return (
      metrics.alerts.highSlowQueryRate ||
      metrics.alerts.n1PatternsDetected ||
      metrics.alerts.highTimeoutRate ||
      metrics.alerts.queryVolumeSpike
    );
  }

  /**
   * Get current configuration (for debugging)
   */
  getConfig(): QueryMetricsConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const queryMetricsService = new QueryMetricsService({
  // Configuration from environment variables with sensible defaults
  slowQueryThresholdMs: parseInt(
    process.env.SLOW_QUERY_THRESHOLD_MS || "1000",
    10,
  ),
  n1DetectionWindowMs: parseInt(
    process.env.N1_DETECTION_WINDOW_MS || "100",
    10,
  ),
  n1DetectionThreshold: parseInt(process.env.N1_DETECTION_THRESHOLD || "5", 10),
  metricsWindowMinutes: parseInt(process.env.METRICS_WINDOW_MINUTES || "5", 10),
  enableDetailedLogging:
    process.env.ENABLE_DETAILED_QUERY_LOGGING === "true" ||
    process.env.NODE_ENV !== "production",
});

// Export types for use in other modules
export type { QueryTimingRecord, N1DetectionRecord, TransactionTimeoutRecord };
