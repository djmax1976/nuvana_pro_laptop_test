import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { checkRedisHealth } from "../utils/redis";
import { checkRabbitMQHealth } from "../utils/rabbitmq";

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
}
