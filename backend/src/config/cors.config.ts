/**
 * CORS Configuration Module
 *
 * Enterprise-grade CORS configuration with:
 * - Environment-aware origin validation
 * - Startup validation to fail fast on misconfiguration
 * - Support for multiple origins (production, staging, development)
 * - Security logging for debugging CORS issues
 *
 * Configuration via CORS_ORIGIN environment variable:
 * - Single origin: "https://app.example.com"
 * - Multiple origins: "https://app.example.com,https://staging.example.com"
 * - Development: "http://localhost:3000" (default when not set)
 */

import type { FastifyCorsOptions } from "@fastify/cors";

// =============================================================================
// Types
// =============================================================================

interface CorsConfig {
  origins: string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// Constants
// =============================================================================

const ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];
const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "x-cashier-session",
  "x-elevation-token", // For step-up authentication (SEC-010)
];
const EXPOSED_HEADERS = ["Content-Type", "Authorization"];

// Preflight cache duration (24 hours in seconds)
const PREFLIGHT_MAX_AGE = 86400;

// Default origins for development
const DEFAULT_DEV_ORIGINS = ["http://localhost:3000"];

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validates a single origin URL
 */
function validateOriginUrl(origin: string): string[] {
  const errors: string[] = [];

  // Must be a valid URL
  try {
    const url = new URL(origin);

    // Must use HTTPS in production (allow HTTP for localhost only)
    const isLocalhost =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !isLocalhost) {
      errors.push(
        `Origin "${origin}" must use HTTPS (HTTP only allowed for localhost)`,
      );
    }

    // Should not have trailing slash
    if (origin.endsWith("/")) {
      errors.push(
        `Origin "${origin}" should not have trailing slash - use "${origin.slice(0, -1)}"`,
      );
    }

    // Should not have path (CORS origins are just scheme + host + port)
    if (url.pathname !== "/" && url.pathname !== "") {
      errors.push(
        `Origin "${origin}" should not include path - use "${url.origin}"`,
      );
    }
  } catch {
    errors.push(`Origin "${origin}" is not a valid URL`);
  }

  return errors;
}

/**
 * Validates the complete CORS configuration
 */
function validateCorsConfig(config: CorsConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have at least one origin
  if (config.origins.length === 0) {
    errors.push("CORS_ORIGIN must specify at least one origin");
  }

  // Validate each origin
  for (const origin of config.origins) {
    errors.push(...validateOriginUrl(origin));
  }

  // Check for wildcard (never allowed in production with credentials)
  if (config.origins.includes("*") && config.credentials) {
    errors.push(
      "Wildcard origin (*) cannot be used with credentials: true - this is a browser security restriction",
    );
  }

  // Production-specific checks
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    // Warn if localhost is in production origins
    const localhostOrigins = config.origins.filter(
      (o) => o.includes("localhost") || o.includes("127.0.0.1"),
    );
    if (localhostOrigins.length > 0) {
      warnings.push(
        `Localhost origins in production: ${localhostOrigins.join(", ")} - ensure this is intentional`,
      );
    }

    // Error if no origins configured in production
    if (
      config.origins.length === 1 &&
      config.origins[0] === "http://localhost:3000"
    ) {
      errors.push(
        "CORS_ORIGIN appears to be using default localhost value in production - set explicit production origins",
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// Configuration Builder
// =============================================================================

/**
 * Parses CORS_ORIGIN environment variable into array of origins
 */
function parseOrigins(): string[] {
  const corsOrigin = process.env.CORS_ORIGIN?.trim();

  if (!corsOrigin) {
    return DEFAULT_DEV_ORIGINS;
  }

  // Split by comma and clean up each origin
  return corsOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Builds the complete CORS configuration
 */
function buildCorsConfig(): CorsConfig {
  return {
    origins: parseOrigins(),
    credentials: true, // Required for httpOnly cookies
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: PREFLIGHT_MAX_AGE,
  };
}

// =============================================================================
// Exported Configuration
// =============================================================================

/**
 * Gets the validated CORS configuration
 * Throws on validation errors in production, warns in development
 */
export function getCorsConfig(): CorsConfig {
  const config = buildCorsConfig();
  const validation = validateCorsConfig(config);

  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.NODE_ENV === "test";

  // Log warnings
  for (const warning of validation.warnings) {
    console.warn(`[CORS Warning] ${warning}`);
  }

  // Handle errors
  if (!validation.valid) {
    const errorMessage = `CORS Configuration Errors:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`;

    if (isProduction) {
      // Fail fast in production
      throw new Error(errorMessage);
    } else if (!isTest) {
      // Warn in development (don't log in test to reduce noise)
      console.error(`[CORS Error] ${errorMessage}`);
    }
  }

  return config;
}

/**
 * Gets Fastify CORS plugin options
 */
export function getFastifyCorsOptions(): FastifyCorsOptions {
  const config = getCorsConfig();

  return {
    origin: config.origins,
    credentials: config.credentials,
    methods: config.methods,
    allowedHeaders: config.allowedHeaders,
    exposedHeaders: config.exposedHeaders,
    maxAge: config.maxAge,
    preflightContinue: false, // Ensure Fastify handles OPTIONS requests
  };
}

/**
 * Logs the current CORS configuration (for debugging)
 * Redacts sensitive info in production
 */
export function logCorsConfig(): void {
  const config = getCorsConfig();
  const isProduction = process.env.NODE_ENV === "production";

  console.log("[CORS] Configuration:");
  console.log(`  Origins: ${config.origins.join(", ")}`);
  console.log(`  Credentials: ${config.credentials}`);
  console.log(`  Methods: ${config.methods.join(", ")}`);

  if (!isProduction) {
    console.log(`  Allowed Headers: ${config.allowedHeaders.join(", ")}`);
    console.log(`  Preflight Max Age: ${config.maxAge}s`);
  }
}

// =============================================================================
// Origin Matching (for custom origin validation if needed)
// =============================================================================

/**
 * Checks if a request origin is allowed
 * Use this for custom origin validation in route handlers if needed
 */
export function isOriginAllowed(requestOrigin: string | undefined): boolean {
  if (!requestOrigin) {
    return false;
  }

  const config = getCorsConfig();
  return config.origins.includes(requestOrigin);
}
