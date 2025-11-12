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
      const healthStatus = {
        status: "ok",
        timestamp: new Date().toISOString(),
        services: {
          redis: await checkRedisHealth(),
          rabbitmq: await checkRabbitMQHealth(),
        },
        version: process.env.npm_package_version || "1.0.0",
      };

      // Determine overall health status
      const allHealthy =
        healthStatus.services.redis.healthy &&
        healthStatus.services.rabbitmq.healthy;

      const statusCode = allHealthy ? 200 : 503;
      reply.code(statusCode);

      return healthStatus;
    },
  );
}
