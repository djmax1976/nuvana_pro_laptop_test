import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { checkRedisHealth } from "../utils/redis";
import { checkRabbitMQHealth } from "../utils/rabbitmq";

/**
 * Health check endpoint that verifies all services
 * GET /api/health
 */
export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/health",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const redisHealth = await checkRedisHealth();
      const rabbitmqHealth = await checkRabbitMQHealth();

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

      // Return 503 if any critical service is unhealthy
      // This allows proper health checking in CI/CD pipelines and load balancers
      reply.code(allHealthy ? 200 : 503);

      return healthStatus;
    },
  );
}
