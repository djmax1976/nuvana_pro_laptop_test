import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import addFormats from "ajv-formats";
import { ZodError } from "zod";
import { initializeRedis, closeRedis } from "./utils/redis";
import {
  initializeRabbitMQ,
  closeRabbitMQ,
  setupTransactionsQueue,
} from "./utils/rabbitmq";
import { getFastifyCorsOptions, logCorsConfig } from "./config/cors.config";
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
import { clientStoreRoutes } from "./routes/client-stores";
import { clientRoleRoutes } from "./routes/client-roles";
import { cashierRoutes } from "./routes/cashiers";
import { adminRolesRoutes } from "./routes/admin-roles";
import { lotteryRoutes } from "./routes/lottery";
import { shiftClosingRoutes } from "./routes/shift-closing";
import { tenderTypeRoutes } from "./routes/tender-types";
import { departmentRoutes } from "./routes/departments";
import { taxRateRoutes } from "./routes/tax-rates";
import { posIntegrationRoutes } from "./routes/pos-integrations";
import { storePosAuditRoutes, adminPosAuditRoutes } from "./routes/pos-audit";
import { naxmlRoutes } from "./routes/naxml";
import { daySummaryRoutes } from "./routes/day-summaries";
import { xReportRoutes } from "./routes/x-reports";
import { zReportRoutes } from "./routes/z-reports";
import { reconciliationRoutes } from "./routes/reconciliation";
import { rlsPlugin } from "./middleware/rls.middleware";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3001",
  10,
);
const SERVER_START_TIME = Date.now();

// SECURITY: Configure body size limits to prevent DoS attacks via oversized payloads
//
// Strategy: Use conservative default limit for JSON APIs, higher limit for upload routes
// - Default bodyLimit: 1MB (sufficient for JSON payloads, protects against DoS)
// - Upload routes: Higher limit set per-route to accommodate file uploads
//
// Configuration:
// - MAX_UPLOAD_FILE_SIZE_MB: Maximum file size for uploads (default: 10MB)
// - MULTIPART_OVERHEAD_MB: Overhead for multipart encoding (default: 2MB)
// - DEFAULT_JSON_BODY_LIMIT_MB: Default limit for JSON endpoints (default: 1MB)
//
// Upload routes should set their own bodyLimit via route options:
//   fastify.post('/upload', { bodyLimit: uploadBodyLimitBytes }, handler)

// Read max upload file size (used for multipart fileSize limit and upload route bodyLimit)
const maxFileSizeMB = parseInt(process.env.MAX_UPLOAD_FILE_SIZE_MB || "10", 10);

// Read multipart overhead (boundaries, headers, field names, etc.)
const multipartOverheadMB = parseInt(
  process.env.MULTIPART_OVERHEAD_MB || "2",
  10,
);

// Default body limit for JSON endpoints (1MB is industry standard for JSON APIs)
const DEFAULT_JSON_BODY_LIMIT_MB = 1;
const defaultJsonBodyLimitMB = parseInt(
  process.env.DEFAULT_JSON_BODY_LIMIT_MB || String(DEFAULT_JSON_BODY_LIMIT_MB),
  10,
);

// Calculate upload body limit (for routes that handle file uploads)
const uploadBodyLimitMB = maxFileSizeMB + multipartOverheadMB;
export const uploadBodyLimitBytes = uploadBodyLimitMB * 1024 * 1024;

// Use conservative default for all routes (JSON APIs)
const maxRequestBodySizeMB = defaultJsonBodyLimitMB;
const maxRequestBodySizeBytes = maxRequestBodySizeMB * 1024 * 1024;

// Log the configuration for debugging
console.log(
  `Body limit configuration: defaultJsonLimit=${defaultJsonBodyLimitMB}MB, uploadLimit=${uploadBodyLimitMB}MB (for upload routes)`,
);

// Create Fastify instance with ajv-formats for UUID validation

const app = Fastify({
  logger: true,
  bodyLimit: maxRequestBodySizeBytes,
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

  // Handle request body too large errors
  // Fastify throws FST_ERR_CTP_BODY_TOO_LARGE when body exceeds bodyLimit
  if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
    app.log.warn({ error }, "Request body too large");
    reply.status(413).send({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: `Request body exceeds maximum size of ${maxRequestBodySizeMB}MB`,
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
// SECURITY: Cookie secret must be set via environment variable - no fallback allowed
const cookieSecret = process.env.COOKIE_SECRET?.trim();
if (!cookieSecret || cookieSecret.length < 32) {
  throw new Error(
    "COOKIE_SECRET environment variable is required. Set a strong, random secret (minimum 32 characters).",
  );
}
app.register(cookie, {
  secret: cookieSecret,
});

// Register multipart form data parser (required for file uploads)
// SECURITY: File upload configuration
// - File size limit: Configurable via MAX_UPLOAD_FILE_SIZE_MB env var (default: 10MB)
// - Note: bodyLimit (configured above) is automatically set to accommodate max upload size + overhead
// - Route handlers MUST:
//   1. Enforce file-type whitelists (check both MIME type and file signature/magic bytes)
//   2. Use streaming (file.file or file.stream) - NEVER use toBuffer() for large files
//   3. Validate content-type header matches actual file content (prevent MIME spoofing)
//   4. Implement per-user upload quota checks before accepting uploads
//   5. Reject any buffered-toBuffer() usage patterns for files > 1MB
const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;

app.register(multipart, {
  limits: {
    fileSize: maxFileSizeBytes, // Configurable max file size (default: 10MB)
  },
});

// Register CORS with validated configuration
// Configuration is validated at startup - fails fast in production if misconfigured
// See backend/src/config/cors.config.ts for configuration details
logCorsConfig();
app.register(cors, getFastifyCorsOptions());

// Register Helmet for security headers
// Note: This API server doesn't serve HTML, but CSP headers are set as defense-in-depth
app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
});

// Register rate limiting
// Rate limit configuration:
// - CI/Test: COMPLETELY DISABLED - rate limiting should be tested in dedicated tests
// - Development: High limit (1000) for Fast Refresh and hot reloading
// - Production: Standard limit (100) for real users per IP, stricter for sensitive endpoints
//
// Phase 5: Added per-user rate limiting with Redis backend
// - Authenticated users: Rate limited by user ID (fairer distribution)
// - Unauthenticated users: Rate limited by IP (prevents abuse)
// - Sensitive endpoints (login, password reset): Stricter limits
const isDevelopment = process.env.NODE_ENV !== "production";
const isTest = process.env.NODE_ENV === "test";
const isCI = process.env.CI === "true";
const shouldDisableRateLimit = isCI || isTest;

// Only register rate limiting plugin in non-test environments
// This completely prevents any 429 errors during parallel test execution
if (!shouldDisableRateLimit) {
  app.register(rateLimit, {
    // Global rate limit per user/IP
    max: isDevelopment ? 1000 : 100,
    timeWindow: "1 minute",
    // Per-user rate limiting: Use user ID if authenticated, IP otherwise
    // This ensures fair distribution across users and prevents single-user abuse
    keyGenerator: (request) => {
      // Extract user from request (set by auth middleware)
      const user = (request as any).user;
      if (user?.id) {
        return `user:${user.id}`;
      }
      // Fall back to IP for unauthenticated requests
      return (
        (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        request.ip ||
        "unknown"
      );
    },
    // Add rate limit headers for client visibility (MCP guideline: expose X-RateLimit-Remaining)
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
    // Error response for rate limit exceeded
    errorResponseBuilder: (_request, context) => {
      return {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Too many requests. Please try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
          retryAfter: Math.ceil(context.ttl / 1000),
        },
      };
    },
  });
}

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

// Register client store settings routes
app.register(clientStoreRoutes);

// Register client role permission management routes
app.register(clientRoleRoutes);

// Register cashier management routes
app.register(cashierRoutes);

// Register lottery management routes
app.register(lotteryRoutes);

// Register shift closing routes
app.register(shiftClosingRoutes);

// Register tender type configuration routes (Phase 1: Shift & Day Summary)
app.register(tenderTypeRoutes, { prefix: "/api/config/tender-types" });

// Register department configuration routes (Phase 1.2: Shift & Day Summary)
app.register(departmentRoutes, { prefix: "/api/config/departments" });

// Register tax rate configuration routes (Phase 1.3: Shift & Day Summary)
app.register(taxRateRoutes, { prefix: "/api/config/tax-rates" });

// Register POS integration routes (Phase 1.6: POS Integration & Auto-Onboarding)
app.register(posIntegrationRoutes, {
  prefix: "/api/stores/:storeId/pos-integration",
});

// Register POS audit routes (Phase 0: Data Exchange Audit Infrastructure)
app.register(storePosAuditRoutes, {
  prefix: "/api/stores/:storeId/pos-audit",
});
app.register(adminPosAuditRoutes, {
  prefix: "/api/admin/pos-audit",
});

// Register NAXML file management routes (Phase 1: NAXML Core Infrastructure)
app.register(naxmlRoutes, {
  prefix: "/api/stores/:storeId/naxml",
});

// Register day summary routes (Phase 3.1: Shift & Day Summary)
app.register(daySummaryRoutes);

// Register X/Z report routes (Phase 4: Report Snapshots)
app.register(xReportRoutes);
app.register(zReportRoutes);

// Register reconciliation routes (Phase 5.3: Validation & Reconciliation)
app.register(reconciliationRoutes);

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
      // Cashiers: POST /api/stores/:storeId/cashiers - Create a new cashier for a store (requires CASHIER_CREATE permission)
      //           GET /api/stores/:storeId/cashiers - List cashiers for a store with optional filtering (requires CASHIER_READ permission)
      //           GET /api/stores/:storeId/cashiers/:cashierId - Get cashier details by ID (requires CASHIER_READ permission)
      //           PUT /api/stores/:storeId/cashiers/:cashierId - Update cashier information (requires CASHIER_UPDATE permission)
      //           DELETE /api/stores/:storeId/cashiers/:cashierId - Soft delete cashier (requires CASHIER_DELETE permission)
      //           POST /api/stores/:storeId/cashiers/authenticate - Authenticate cashier by name/employee_id and PIN (public endpoint for terminal access)
      cashiers: "/api/stores/:storeId/cashiers",
      // POS Integration: GET/POST/PATCH/DELETE /api/stores/:storeId/pos-integration - Manage POS connection for store
      //                  POST /api/stores/:storeId/pos-integration/test - Test POS connection
      //                  POST /api/stores/:storeId/pos-integration/sync - Trigger manual sync
      //                  GET /api/stores/:storeId/pos-integration/logs - Get sync history
      posIntegration: "/api/stores/:storeId/pos-integration",
      // POS Audit: GET /api/stores/:storeId/pos-audit - Get audit records for a store (requires POS_AUDIT_READ permission)
      //            GET /api/stores/:storeId/pos-audit/summary - Get audit summary for a store
      //            GET /api/stores/:storeId/pos-audit/:auditId - Get specific audit record
      //            GET /api/admin/pos-audit - Query all audit records (admin only)
      //            GET /api/admin/pos-audit/summary - Get system-wide audit summary (admin only)
      //            GET /api/admin/pos-audit/pii-report - Generate PII access report (admin only)
      //            POST /api/admin/pos-audit/retention-cleanup - Trigger retention cleanup (admin only)
      posAudit: "/api/stores/:storeId/pos-audit",
      posAuditAdmin: "/api/admin/pos-audit",
      // NAXML: GET /api/stores/:storeId/naxml/files - List NAXML file logs
      //        GET /api/stores/:storeId/naxml/files/:fileLogId - Get file log details
      //        POST /api/stores/:storeId/naxml/files/import - Manual file import
      //        POST /api/stores/:storeId/naxml/export/departments - Export departments
      //        POST /api/stores/:storeId/naxml/export/tender-types - Export tender types
      //        POST /api/stores/:storeId/naxml/export/tax-rates - Export tax rates
      //        GET/POST/PATCH /api/stores/:storeId/naxml/watcher - Watcher config
      //        POST /api/stores/:storeId/naxml/watcher/start - Start watcher
      //        POST /api/stores/:storeId/naxml/watcher/stop - Stop watcher
      naxml: "/api/stores/:storeId/naxml",
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
