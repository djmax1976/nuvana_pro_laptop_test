import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { checkRedisHealth } from "../utils/redis";
import { checkRabbitMQHealth } from "../utils/rabbitmq";
import { tokenValidationService } from "../services/token-validation.service";
import { permissionCacheService } from "../services/permission-cache.service";
import { userAccessCacheService } from "../services/user-access-cache.service";
import { authMiddleware } from "../middleware/auth.middleware";
import { circuitBreakerRegistry, CircuitState } from "../utils/circuit-breaker";

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
}
