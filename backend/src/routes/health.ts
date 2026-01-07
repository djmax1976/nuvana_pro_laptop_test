import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { checkRedisHealth } from "../utils/redis";
import { checkRabbitMQHealth } from "../utils/rabbitmq";
import { tokenValidationService } from "../services/token-validation.service";
import { permissionCacheService } from "../services/permission-cache.service";
import { userAccessCacheService } from "../services/user-access-cache.service";
import { authMiddleware } from "../middleware/auth.middleware";
import { circuitBreakerRegistry, CircuitState } from "../utils/circuit-breaker";
import { queryMetricsService } from "../services/query-metrics.service";

/**
 * Health check endpoint that verifies all services
 * GET /api/health
 */
/**
 * Timeout wrapper for health checks - ensures fast response even if services are slow
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  defaultValue: T,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(() => resolve(defaultValue), timeoutMs),
    ),
  ]);
}

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/health",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Use timeout to ensure health check responds quickly (within 2 seconds)
      // This prevents ALB from timing out (ALB timeout is 5 seconds)
      const HEALTH_CHECK_TIMEOUT = 2000; // 2 seconds max

      const [redisHealth, rabbitmqHealth] = await Promise.all([
        withTimeout(checkRedisHealth(), HEALTH_CHECK_TIMEOUT, {
          healthy: false,
          status: "disconnected" as const,
          error: "Health check timeout",
        }),
        withTimeout(checkRabbitMQHealth(), HEALTH_CHECK_TIMEOUT, {
          healthy: false,
          error: "Health check timeout",
        }),
      ]);

      // Determine overall health status
      const allHealthy = redisHealth.healthy && rabbitmqHealth.healthy;

      const healthStatus = {
        status: allHealthy ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        services: {
          redis: redisHealth,
          rabbitmq: rabbitmqHealth,
        },
        version: process.env.npm_package_version || "1.0.0",
      };

      // Always return 200 for ALB health checks
      // ALB target group expects 200 status code to mark targets as healthy
      // Service degradation is indicated in the response body (status: "degraded")
      // This allows the application to remain accessible even if Redis/RabbitMQ are temporarily unavailable
      // Monitoring systems can still detect degraded status from the response body
      reply.code(200);

      return healthStatus;
    },
  );

  /**
   * Token validation metrics endpoint (authenticated, admin only)
   * GET /api/health/auth-metrics
   *
   * Provides metrics for monitoring token validation performance and security
   * - Total validations, success/failure counts
   * - Failure breakdown (expired, invalid signature, malformed)
   * - Average validation time
   * - High failure rate warning
   */
  fastify.get(
    "/api/health/auth-metrics",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user;

      // Only allow system admins to view auth metrics
      if (!user?.is_system_admin) {
        return reply.code(403).send({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }

      const metrics = tokenValidationService.getMetrics();
      const highFailureRate = tokenValidationService.isFailureRateHigh(10);

      return {
        success: true,
        data: {
          ...metrics,
          alerts: {
            highFailureRate,
            failureRatePercent:
              metrics.totalValidations > 0
                ? (
                    (metrics.failureCount / metrics.totalValidations) *
                    100
                  ).toFixed(2)
                : "0.00",
          },
        },
      };
    },
  );

  /**
   * Permission cache metrics endpoint (authenticated, admin only)
   * GET /api/health/cache-metrics
   *
   * Provides metrics for monitoring permission cache performance
   * - Store-company mapping cache hits/misses
   * - User access cache hits/misses (PHASE 4)
   * - Overall hit rates
   */
  fastify.get(
    "/api/health/cache-metrics",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user;

      // Only allow system admins to view cache metrics
      if (!user?.is_system_admin) {
        return reply.code(403).send({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }

      const permissionCacheMetrics = permissionCacheService.getMetrics();
      const userAccessCacheMetrics = userAccessCacheService.getMetrics();

      return {
        success: true,
        data: {
          // Store-company mapping cache (Phase 3)
          storeCompanyCache: permissionCacheMetrics,
          // User access map cache (Phase 4)
          userAccessCache: userAccessCacheMetrics,
          // Combined summary
          summary: {
            totalCacheHits:
              permissionCacheMetrics.storeCompanyHits +
              userAccessCacheMetrics.hits,
            totalCacheMisses:
              permissionCacheMetrics.storeCompanyMisses +
              userAccessCacheMetrics.misses,
          },
        },
      };
    },
  );

  /**
   * Circuit breaker metrics endpoint (authenticated, admin only)
   * GET /api/health/circuit-breaker
   *
   * Provides metrics for monitoring circuit breaker health and state (Phase 5)
   * - State of each circuit breaker (CLOSED, OPEN, HALF_OPEN)
   * - Request counts (total, success, failure, rejected)
   * - Timeout counts
   * - Failure rates
   * - Average response times
   *
   * Alerts are raised when:
   * - Any circuit is OPEN or HALF_OPEN
   * - Failure rate exceeds 30%
   * - Rejected requests > 0 (circuit has been tripped)
   */
  fastify.get(
    "/api/health/circuit-breaker",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user;

      // Only allow system admins to view circuit breaker metrics
      if (!user?.is_system_admin) {
        return reply.code(403).send({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }

      const allMetrics = circuitBreakerRegistry.getAllMetrics();

      // Determine if any circuit is unhealthy
      const unhealthyCircuits = allMetrics.filter(
        (m) =>
          m.state !== CircuitState.CLOSED ||
          m.failureRate > 30 ||
          m.rejectedRequests > 0,
      );

      // Build alerts array
      const alerts: string[] = [];

      for (const metric of allMetrics) {
        if (metric.state === CircuitState.OPEN) {
          alerts.push(`${metric.name}: Circuit OPEN - service unavailable`);
        } else if (metric.state === CircuitState.HALF_OPEN) {
          alerts.push(`${metric.name}: Circuit HALF_OPEN - testing recovery`);
        }

        if (metric.failureRate > 30) {
          alerts.push(
            `${metric.name}: High failure rate (${metric.failureRate.toFixed(1)}%)`,
          );
        }

        if (metric.rejectedRequests > 0) {
          alerts.push(
            `${metric.name}: ${metric.rejectedRequests} requests rejected (circuit was open)`,
          );
        }
      }

      return {
        success: true,
        data: {
          circuits: allMetrics.map((m) => ({
            name: m.name,
            state: m.state,
            stats: {
              totalRequests: m.totalRequests,
              successfulRequests: m.successfulRequests,
              failedRequests: m.failedRequests,
              rejectedRequests: m.rejectedRequests,
              timeouts: m.timeouts,
            },
            performance: {
              failureRate: `${m.failureRate.toFixed(2)}%`,
              averageResponseTime: `${m.averageResponseTime}ms`,
              lastFailure: m.lastFailure?.toISOString() || null,
              lastSuccess: m.lastSuccess?.toISOString() || null,
              lastStateChange: m.lastStateChange.toISOString(),
            },
          })),
          summary: {
            totalCircuits: allMetrics.length,
            healthyCircuits: allMetrics.length - unhealthyCircuits.length,
            unhealthyCircuits: unhealthyCircuits.length,
            alerts: alerts.length > 0 ? alerts : ["All circuits healthy"],
          },
        },
      };
    },
  );

  /**
   * Reset all circuit breakers (authenticated, admin only)
   * POST /api/health/circuit-breaker/reset
   *
   * Manually resets all circuit breakers to CLOSED state
   * Use with caution - should only be used after confirming underlying issues are resolved
   */
  fastify.post(
    "/api/health/circuit-breaker/reset",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user;

      // Only allow system admins to reset circuit breakers
      if (!user?.is_system_admin) {
        return reply.code(403).send({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }

      // Reset all circuit breakers
      circuitBreakerRegistry.resetAll();

      // Log the action for audit purposes
      console.warn(
        `Circuit breakers manually reset by user ${user.id} (${user.email})`,
      );

      return {
        success: true,
        message: "All circuit breakers have been reset to CLOSED state",
      };
    },
  );

  /**
   * Query metrics endpoint (authenticated, admin only)
   * GET /api/health/query-metrics
   *
   * Phase 6.1 & 6.2: Monitoring & Alerting
   *
   * Enterprise coding standards applied:
   * - LM-002: MONITORING - Performance probes for database queries
   * - LM-004: METRICS - SLO-aligned metrics with percentiles
   * - DB-008: QUERY_LOGGING - Aggregated query statistics
   * - CDP-005: DATA_MASKING - No sensitive data in response
   * - SEC-010: AUTHZ - Admin-only access control
   *
   * Provides metrics for monitoring database query performance:
   * - Total query count and average time
   * - P95 and P99 latency percentiles
   * - Slow query detection with rate
   * - N+1 pattern detection alerts
   * - Transaction timeout tracking
   * - Per-model and per-action breakdown
   * - Alert flags for automated monitoring
   *
   * Query parameters:
   * - windowMinutes: Override default metrics window (1-60 minutes)
   */
  const QueryMetricsQuerySchema = z.object({
    windowMinutes: z.coerce
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe("Metrics window in minutes (1-60)"),
  });

  fastify.get(
    "/api/health/query-metrics",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user;

      // SEC-010: AUTHZ - Only allow system admins to view query metrics
      if (!user?.is_system_admin) {
        return reply.code(403).send({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }

      // API-001: VALIDATION - Validate query parameters
      const queryParams = QueryMetricsQuerySchema.safeParse(request.query);
      if (!queryParams.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details: queryParams.error.issues,
          },
        });
      }

      // Optionally update window if provided
      if (queryParams.data.windowMinutes) {
        queryMetricsService.updateConfig({
          metricsWindowMinutes: queryParams.data.windowMinutes,
        });
      }

      // Get aggregated metrics
      const metrics = queryMetricsService.getMetrics();
      const config = queryMetricsService.getConfig();

      // LM-001: LOGGING - Structured log for audit
      console.log(
        JSON.stringify({
          level: "info",
          service: "health",
          event: "query_metrics_accessed",
          userId: user.id,
          timestamp: new Date().toISOString(),
        }),
      );

      return {
        success: true,
        data: {
          metrics,
          config: {
            slowQueryThresholdMs: config.slowQueryThresholdMs,
            n1DetectionWindowMs: config.n1DetectionWindowMs,
            n1DetectionThreshold: config.n1DetectionThreshold,
            metricsWindowMinutes: config.metricsWindowMinutes,
          },
          documentation: {
            description:
              "Database query performance metrics for monitoring dashboards",
            alertThresholds: {
              slowQueryRate: `>${config.slowQueryRateAlertThreshold}%`,
              timeoutRate: `>${config.timeoutRateAlertThreshold}%`,
              n1Detection: "Any detected N+1 pattern",
              queryVolumeSpike: `>${config.queryVolumeBaseline * config.queryVolumeSpikeMultiplier} queries/window`,
            },
            envVars: {
              SLOW_QUERY_THRESHOLD_MS:
                "Threshold for slow query detection (default: 1000)",
              N1_DETECTION_WINDOW_MS: "Window for N+1 detection (default: 100)",
              N1_DETECTION_THRESHOLD:
                "Min queries in window to trigger N+1 alert (default: 5)",
              METRICS_WINDOW_MINUTES:
                "Aggregation window in minutes (default: 5)",
              ENABLE_DETAILED_QUERY_LOGGING:
                "Enable detailed query logs (default: non-prod only)",
            },
          },
        },
      };
    },
  );

  /**
   * Update query metrics configuration (authenticated, admin only)
   * PATCH /api/health/query-metrics/config
   *
   * Phase 6.1: Monitoring & Alerting - Runtime configuration
   *
   * Enterprise coding standards applied:
   * - SEC-010: AUTHZ - Admin-only access control
   * - API-001: VALIDATION - Zod schema validation
   * - LM-001: LOGGING - Audit logging for configuration changes
   *
   * Allows runtime updates to query metrics configuration without restart.
   * Useful for tuning alert thresholds in production.
   */
  const QueryMetricsConfigUpdateSchema = z.object({
    slowQueryThresholdMs: z.coerce
      .number()
      .int()
      .min(100)
      .max(60000)
      .optional()
      .describe("Slow query threshold (100-60000ms)"),
    n1DetectionWindowMs: z.coerce
      .number()
      .int()
      .min(10)
      .max(1000)
      .optional()
      .describe("N+1 detection window (10-1000ms)"),
    n1DetectionThreshold: z.coerce
      .number()
      .int()
      .min(2)
      .max(100)
      .optional()
      .describe("N+1 detection threshold (2-100 queries)"),
    metricsWindowMinutes: z.coerce
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe("Metrics aggregation window (1-60 minutes)"),
    enableDetailedLogging: z
      .boolean()
      .optional()
      .describe("Enable detailed query logging"),
    slowQueryRateAlertThreshold: z.coerce
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Alert threshold for slow query rate (1-100%)"),
    timeoutRateAlertThreshold: z.coerce
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Alert threshold for timeout rate (1-100%)"),
  });

  fastify.patch(
    "/api/health/query-metrics/config",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user;

      // SEC-010: AUTHZ - Only allow system admins to update configuration
      if (!user?.is_system_admin) {
        return reply.code(403).send({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }

      // API-001: VALIDATION - Validate request body
      const bodyParse = QueryMetricsConfigUpdateSchema.safeParse(request.body);
      if (!bodyParse.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid configuration values",
            details: bodyParse.error.issues,
          },
        });
      }

      const updates = bodyParse.data;

      // Check if any updates were provided
      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "No configuration updates provided",
          },
        });
      }

      // Get previous config for audit logging
      const previousConfig = queryMetricsService.getConfig();

      // Apply updates
      queryMetricsService.updateConfig(updates);

      // Get updated config
      const newConfig = queryMetricsService.getConfig();

      // LM-001: LOGGING - Audit log for configuration change
      console.warn(
        JSON.stringify({
          level: "warn",
          service: "health",
          event: "query_metrics_config_updated",
          userId: user.id,
          userEmail: user.email,
          changes: updates,
          previousConfig: {
            slowQueryThresholdMs: previousConfig.slowQueryThresholdMs,
            n1DetectionWindowMs: previousConfig.n1DetectionWindowMs,
            n1DetectionThreshold: previousConfig.n1DetectionThreshold,
            metricsWindowMinutes: previousConfig.metricsWindowMinutes,
          },
          timestamp: new Date().toISOString(),
        }),
      );

      return {
        success: true,
        message: "Query metrics configuration updated",
        data: {
          config: {
            slowQueryThresholdMs: newConfig.slowQueryThresholdMs,
            n1DetectionWindowMs: newConfig.n1DetectionWindowMs,
            n1DetectionThreshold: newConfig.n1DetectionThreshold,
            metricsWindowMinutes: newConfig.metricsWindowMinutes,
            enableDetailedLogging: newConfig.enableDetailedLogging,
            slowQueryRateAlertThreshold: newConfig.slowQueryRateAlertThreshold,
            timeoutRateAlertThreshold: newConfig.timeoutRateAlertThreshold,
          },
        },
      };
    },
  );

  /**
   * Reset query metrics (authenticated, admin only)
   * POST /api/health/query-metrics/reset
   *
   * Phase 6.1: Monitoring & Alerting - Metrics reset
   *
   * Clears all accumulated metrics. Useful for:
   * - After deploying fixes for performance issues
   * - Resetting baseline after configuration changes
   * - Testing metric collection
   */
  fastify.post(
    "/api/health/query-metrics/reset",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user;

      // SEC-010: AUTHZ - Only allow system admins to reset metrics
      if (!user?.is_system_admin) {
        return reply.code(403).send({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }

      // Reset all metrics
      queryMetricsService.reset();

      // LM-001: LOGGING - Audit log for reset
      console.warn(
        JSON.stringify({
          level: "warn",
          service: "health",
          event: "query_metrics_reset",
          userId: user.id,
          userEmail: user.email,
          timestamp: new Date().toISOString(),
        }),
      );

      return {
        success: true,
        message: "Query metrics have been reset",
      };
    },
  );
}
