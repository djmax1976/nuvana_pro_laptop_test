import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import dotenv from "dotenv";
import addFormats from "ajv-formats";
import { ZodError } from "zod";
import { initializeRedis, closeRedis } from "./utils/redis";
import {
  initializeRabbitMQ,
  closeRabbitMQ,
  setupTransactionsQueue,
} from "./utils/rabbitmq";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";
import { userRoutes } from "./routes/users";
import { companyRoutes } from "./routes/companies";
import { storeRoutes } from "./routes/store";
import { transactionRoutes } from "./routes/transactions";
import { shiftRoutes } from "./routes/shifts";
import { contactRoutes } from "./routes/contact";
import { adminUserRoutes } from "./routes/admin-users";
import { clientDashboardRoutes } from "./routes/client-dashboard";
import { clientEmployeeRoutes } from "./routes/client-employees";
import { clientRoleRoutes } from "./routes/client-roles";
import { adminRolesRoutes } from "./routes/admin-roles";
import { rlsPlugin } from "./middleware/rls.middleware";

// Load environment variables
dotenv.config();

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3001",
  10,
);
const SERVER_START_TIME = Date.now();

// Create Fastify instance with ajv-formats for UUID validation
const app = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      removeAdditional: false,
      coerceTypes: "array", // Coerce types for query strings while keeping strict validation for body
      allErrors: true,
    },
    plugins: [addFormats],
  },
});

// Global error handler for validation and other errors
app.setErrorHandler((error: any, _request, reply) => {
  app.log.error(
    { error, errorName: error.name, errorType: error.constructor?.name },
    "Request error",
  );

  // Handle Zod validation errors (from Zod schema validation)
  if (error instanceof ZodError) {
    app.log.warn({ error }, "Zod validation error caught by global handler");
    reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid query parameters",
        details:
          error.issues?.map((e: any) => ({
            field: e.path?.join(".") || "unknown",
            message: e.message || "Validation failed",
          })) || [],
      },
    });
    return;
  }

  // Handle JSON body parsing errors (e.g., empty body with Content-Type: application/json)
  // These errors occur BEFORE preHandler hooks, so we need to handle them here
  if (
    error.code === "FST_ERR_CTP_EMPTY_JSON_BODY" ||
    (error.message && error.message.includes("Unexpected end of JSON input"))
  ) {
    app.log.warn({ error }, "JSON body parsing error");
    reply.status(400).send({
      success: false,
      error: {
        code: "INVALID_JSON_BODY",
        message: "Request body must be valid JSON",
      },
    });
    return;
  }

  // Handle Fastify validation errors (schema validation failures)
  // Return consistent format with success field for production-grade API
  if (error.validation) {
    app.log.warn({ error }, "Fastify schema validation error");
    // Build a descriptive error message from validation details
    const validationDetails = error.validation || [];
    let message = "Validation failed";
    if (validationDetails.length > 0) {
      const firstError = validationDetails[0];
      // Include field name and specific error in the message
      const field =
        firstError.instancePath?.replace(/^\//, "").replace(/\//g, ".") ||
        firstError.params?.missingProperty ||
        "field";
      const errorMessage = firstError.message || "validation failed";
      // Special handling for common validation errors
      if (firstError.keyword === "maxLength" && firstError.params?.limit) {
        message = `${field} cannot exceed ${firstError.params.limit} characters`;
      } else if (firstError.keyword === "minLength") {
        message = `${field} is required and cannot be empty`;
      } else if (
        firstError.keyword === "format" &&
        firstError.params?.format === "uuid"
      ) {
        message = `${field} must be a valid UUID format`;
      } else {
        message = `${field}: ${errorMessage}`;
      }
    }
    reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message,
        details: validationDetails,
      },
    });
    return;
  }

  // Handle other errors with appropriate status codes
  // Extract error properties properly since Error objects don't serialize with JSON.stringify
  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    success: false,
    error: {
      code: error.code || error.name || "ERROR",
      message: error.message || "An unexpected error occurred",
    },
  });
});

// Register cookie parser (required for httpOnly cookie support)
app.register(cookie, {
  secret:
    process.env.COOKIE_SECRET || "default-cookie-secret-change-in-production",
});

// Register multipart form data parser (required for file uploads)
// SECURITY: File upload configuration
// - File size limit: Configurable via MAX_UPLOAD_FILE_SIZE_MB env var (default: 10MB)
// - Route handlers MUST:
//   1. Enforce file-type whitelists (check both MIME type and file signature/magic bytes)
//   2. Use streaming (file.file or file.stream) - NEVER use toBuffer() for large files
//   3. Validate content-type header matches actual file content (prevent MIME spoofing)
//   4. Implement per-user upload quota checks before accepting uploads
//   5. Reject any buffered-toBuffer() usage patterns for files > 1MB
const maxFileSizeMB = parseInt(process.env.MAX_UPLOAD_FILE_SIZE_MB || "10", 10);
const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;

app.register(multipart, {
  limits: {
    fileSize: maxFileSizeBytes, // Configurable max file size (default: 10MB)
  },
});

// Register CORS
app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
  credentials: true, // Required for cookies to work with CORS
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Type", "Authorization"],
  preflightContinue: false, // Ensure Fastify handles OPTIONS requests
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
// Rate limit configuration:
// - CI/Test: Very high limit (10000) to prevent false test failures from rate limiting
// - Development: High limit (1000) for Fast Refresh and hot reloading
// - Production: Standard limit (100) for real users
const isDevelopment = process.env.NODE_ENV !== "production";
const isCI = process.env.CI === "true";
const rateLimitMax = isCI ? 10000 : isDevelopment ? 1000 : 100;

app.register(rateLimit, {
  max: rateLimitMax,
  timeWindow: "1 minute",
  // Note: Per-company rate limiting (500/min) would require custom implementation
  // based on company context from authentication middleware
  //
  // SECURITY: Upload endpoints have stricter rate limits configured per-route:
  // - UPLOAD_RATE_LIMIT_MAX: Max uploads per time window (default: 5)
  // - UPLOAD_RATE_LIMIT_WINDOW: Time window for upload rate limit (default: "1 minute")
  // This prevents abuse of upload bandwidth and ensures fair resource usage
});

// Register RLS (Row-Level Security) plugin
// This automatically wraps ALL route handlers with RLS context for tenant isolation
app.register(rlsPlugin);

// Register health check routes
app.register(healthRoutes);

// Register auth routes
app.register(authRoutes);

// Register user routes
app.register(userRoutes);

// Register company routes
app.register(companyRoutes);

// Register store routes
app.register(storeRoutes);

// Register transaction routes
app.register(transactionRoutes);

// Register shift routes
app.register(shiftRoutes);

// Register contact routes (public - no auth required)
app.register(contactRoutes);

// Register admin routes (with permission middleware examples)
app.register(adminRoutes);

// Register admin user management routes
app.register(adminUserRoutes);

// Register admin role management routes (Super Admin only)
app.register(adminRolesRoutes);

// Register client dashboard routes
app.register(clientDashboardRoutes);

// Register client employee management routes
app.register(clientEmployeeRoutes);

// Register client role permission management routes
app.register(clientRoleRoutes);

// Root endpoint - API information and status
app.get("/", async () => {
  return {
    name: "Nuvana Pro API",
    version: process.env.npm_package_version || "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
    endpoints: {
      health: "/api/health",
      auth: "/api/auth/*",
      users: "/api/users/*",
      companies: "/api/companies/*",
      stores: "/api/stores/*",
      transactions: "/api/transactions",
      admin: "/api/admin/*",
      contact: "/api/contact",
      // Client dashboard: GET /api/client/dashboard - Returns dashboard data for authenticated client users (companies, stores, stats)
      clientDashboard: "/api/client/dashboard",
      // Client employees: POST/GET /api/client/employees, DELETE /api/client/employees/:userId
      clientEmployees: "/api/client/employees",
    },
    documentation: "https://github.com/your-org/nuvana-pro",
  };
});

// Legacy health check endpoint (backward compatibility)
// Register GET and OPTIONS, HEAD is auto-generated by Fastify
app.get("/health", async () => {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
  };
});

app.options("/health", async (_request, reply) => {
  reply.header("Allow", "GET, HEAD, OPTIONS");
  reply.code(200);
  return;
});

// Handle unsupported methods with 405
app.route({
  method: ["POST", "PUT", "PATCH", "DELETE"],
  url: "/health",
  handler: async (request, reply) => {
    reply.code(405);
    reply.header("Allow", "GET, HEAD, OPTIONS");
    return {
      error: "Method Not Allowed",
      message: `${request.method} is not allowed for ${request.url}. Supported methods: GET, HEAD, OPTIONS`,
    };
  },
});

// Start server
const start = async () => {
  try {
    // Initialize Redis connection with retry
    app.log.info("Initializing Redis connection...");
    try {
      await initializeRedis();
      app.log.info("Redis connection established");
    } catch (err) {
      app.log.warn(
        { err },
        "Redis connection failed - server will start but health checks will report degraded",
      );
      // Don't crash - Redis reconnect logic will handle reconnection
      // Health check endpoint will report service as unhealthy
    }

    // Initialize RabbitMQ connection with retry
    app.log.info("Initializing RabbitMQ connection...");
    try {
      await initializeRabbitMQ();
      app.log.info("RabbitMQ connection established");

      // Initialize queues for transaction processing
      app.log.info("Setting up RabbitMQ queues...");
      await setupTransactionsQueue();
      app.log.info("RabbitMQ queues initialized successfully");
    } catch (err) {
      app.log.warn(
        { err },
        "RabbitMQ setup failed - server will start but health checks will report degraded",
      );
      // Don't crash - RabbitMQ reconnect logic will handle reconnection
      // Health check endpoint will report service as unhealthy
    }

    // Start server even if dependencies are temporarily unavailable
    // The health check endpoint will report service health accurately
    // Use '::' to listen on all IPv6 and IPv4 addresses (dual-stack)
    // This ensures compatibility with both IPv4 (127.0.0.1) and IPv6 (::1) localhost requests
    const host = process.env.LISTEN_HOST || "::";
    await app.listen({ port: PORT, host });
    app.log.info(`Server listening on ${host}:${PORT}`);
    app.log.info("Health endpoint available at /api/health");
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
