import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import dotenv from "dotenv";
import { initializeRedis, closeRedis } from "./utils/redis";
import { initializeRabbitMQ, closeRabbitMQ } from "./utils/rabbitmq";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || "3001", 10);

// Create Fastify instance
const app = Fastify({
  logger: true,
});

// Register cookie parser (required for httpOnly cookie support)
app.register(cookie, {
  secret:
    process.env.COOKIE_SECRET || "default-cookie-secret-change-in-production",
});

// Register CORS
app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
  credentials: true, // Required for cookies to work with CORS
});

// Register Helmet for security headers
app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
});

// Register rate limiting
app.register(rateLimit, {
  max: 100, // 100 requests per minute per user (default)
  timeWindow: "1 minute",
  // Note: Per-company rate limiting (500/min) would require custom implementation
  // based on company context from authentication middleware
});

// Register health check routes
app.register(healthRoutes);

// Register auth routes
app.register(authRoutes);

// Register admin routes (with permission middleware examples)
app.register(adminRoutes);

// Configure method not allowed handler to return 405 instead of 404
app.setMethodNotAllowedHandler((request, reply) => {
  reply.code(405).send({
    error: "Method Not Allowed",
    message: `${request.method} is not allowed for ${request.url}`,
  });
});

// Legacy health check endpoint (backward compatibility)
app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Start server
const start = async () => {
  try {
    // Initialize Redis connection
    app.log.info("Initializing Redis connection...");
    try {
      await initializeRedis();
      app.log.info("Redis connection established");
    } catch (err) {
      app.log.error({ err }, "Failed to initialize Redis connection");
      throw new Error("Cannot start server without Redis connection");
    }

    // Initialize RabbitMQ connection
    app.log.info("Initializing RabbitMQ connection...");
    try {
      await initializeRabbitMQ();
      app.log.info("RabbitMQ connection established");
    } catch (err) {
      app.log.error({ err }, "Failed to initialize RabbitMQ connection");
      throw new Error("Cannot start server without RabbitMQ connection");
    }

    // Start server after connections are established
    await app.listen({ port: PORT, host: "0.0.0.0" });
    app.log.info(`Server listening on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully...`);
  try {
    // Close Fastify server
    await app.close();
    app.log.info("Server closed successfully");

    // Close Redis connection
    app.log.info("Closing Redis connection...");
    await closeRedis();

    // Close RabbitMQ connection
    app.log.info("Closing RabbitMQ connection...");
    await closeRabbitMQ();

    app.log.info("All connections closed successfully");
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start the server
start();
