/**
 * Enterprise Security Utilities
 *
 * Implements OWASP security best practices for the frontend:
 * - SEC-004: XSS - Output encoding and sanitization
 * - FE-005: UI_SECURITY - Sensitive data masking
 * - API-008: OUTPUT_FILTERING - Data filtering before display
 *
 * @module lib/utils/security
 * @see https://owasp.org/www-community/xss-filter-evasion-cheatsheet
 */

/**
 * HTML entity encoding map for XSS prevention
 * Covers OWASP-recommended characters that must be encoded
 */
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

/**
 * Escape HTML special characters to prevent XSS attacks
 *
 * SEC-004: XSS - Escape all untrusted output
 *
 * @param unsafe - String that may contain HTML characters
 * @returns Safely escaped string
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
export function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe == null) return "";
  return String(unsafe).replace(
    /[&<>"'`=/]/g,
    // eslint-disable-next-line security/detect-object-injection -- Safe: char is matched from regex character class
    (char) => HTML_ENTITIES[char] || char,
  );
}

/**
 * Sanitize a string for safe display in the UI
 * Removes potentially dangerous content while preserving readable text
 *
 * SEC-004: XSS - Sanitize HTML fragments
 *
 * @param input - Untrusted input string
 * @returns Sanitized string safe for display
 */
export function sanitizeForDisplay(input: string | null | undefined): string {
  if (input == null) return "";

  return (
    String(input)
      // Remove script tags - simple safe pattern (avoid catastrophic backtracking)
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      // Remove event handlers
      .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
      // Remove javascript: URLs
      .replace(/javascript:/gi, "")
      // Remove data: URLs (can contain executable code)
      .replace(/data:/gi, "")
      // Escape remaining HTML entities
      // eslint-disable-next-line security/detect-object-injection -- Safe: char is matched from regex character class
      .replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char)
      // Trim whitespace
      .trim()
  );
}

/**
 * Mask sensitive data for UI display
 *
 * FE-005: UI_SECURITY - Mask sensitive values in UI
 *
 * @param value - Sensitive value to mask
 * @param visibleChars - Number of characters to show at start and end
 * @param maskChar - Character to use for masking (default: *)
 * @returns Masked string
 *
 * @example
 * maskSensitiveData('TXN-8847291', 4)
 * // Returns: 'TXN-****291'
 */
export function maskSensitiveData(
  value: string | null | undefined,
  visibleChars: number = 4,
  maskChar: string = "*",
): string {
  if (value == null) return "";
  const str = String(value);

  if (str.length <= visibleChars * 2) {
    // If string is too short, mask all but first char
    return str[0] + maskChar.repeat(str.length - 1);
  }

  const start = str.slice(0, visibleChars);
  const end = str.slice(-visibleChars);
  const maskLength = str.length - visibleChars * 2;

  return `${start}${maskChar.repeat(maskLength)}${end}`;
}

/**
 * Mask a transaction ID for display
 * Shows prefix and last 3 digits only
 *
 * @param transactionId - Full transaction ID
 * @returns Masked transaction ID
 *
 * @example
 * maskTransactionId('TXN-8847291')
 * // Returns: 'TXN-****291'
 */
export function maskTransactionId(
  transactionId: string | null | undefined,
): string {
  if (transactionId == null) return "";
  const str = String(transactionId);

  // Match pattern like "TXN-1234567"
  const match = str.match(/^([A-Z]{2,4}-)(\d+)$/);
  if (match) {
    const [, prefix, number] = match;
    const maskedNumber =
      number.length > 3
        ? "*".repeat(number.length - 3) + number.slice(-3)
        : number;
    return prefix + maskedNumber;
  }

  // Fallback for non-standard formats
  return maskSensitiveData(str, 4);
}

/**
 * Mask employee/cashier name for privacy
 *
 * FE-005: UI_SECURITY - Protect PII
 *
 * @param fullName - Full name to mask
 * @returns Name with only first name and last initial
 *
 * @example
 * maskEmployeeName('Sarah Miller')
 * // Returns: 'Sarah M.'
 */
export function maskEmployeeName(fullName: string | null | undefined): string {
  if (fullName == null) return "";
  const str = String(fullName).trim();

  const parts = str.split(/\s+/);
  if (parts.length === 1) {
    return parts[0];
  }

  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0];

  return `${firstName} ${lastInitial}.`;
}

/**
 * Format currency value safely
 * Validates input is a number and formats consistently
 *
 * @param value - Numeric value to format
 * @param options - Intl.NumberFormat options
 * @returns Formatted currency string
 */
export function formatCurrency(
  value: number | string | null | undefined,
  options: Partial<Intl.NumberFormatOptions> = {},
): string {
  if (value == null) return "$0.00";

  const numValue = typeof value === "string" ? parseFloat(value) : value;

  if (!Number.isFinite(numValue)) {
    return "$0.00";
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  });

  return formatter.format(numValue);
}

/**
 * Validate and sanitize a numeric ID
 * Prevents injection of non-numeric characters
 *
 * @param id - ID value to validate
 * @returns Sanitized ID or null if invalid
 */
export function sanitizeId(
  id: string | number | null | undefined,
): string | null {
  if (id == null) return null;

  const str = String(id);
  // Allow alphanumeric, hyphens, and underscores only
  const sanitized = str.replace(/[^a-zA-Z0-9\-_]/g, "");

  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Check if a URL is safe (same-origin or allowed external)
 *
 * @param url - URL to validate
 * @param allowedDomains - List of allowed external domains
 * @returns Boolean indicating if URL is safe
 */
export function isSafeUrl(url: string, allowedDomains: string[] = []): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url, window.location.origin);

    // Same-origin is always safe
    if (parsed.origin === window.location.origin) {
      return true;
    }

    // Check against allowed domains
    return allowedDomains.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    );
  } catch {
    // Invalid URL
    return false;
  }
}

/**
 * Sanitize URL to prevent javascript: and data: injections
 *
 * @param url - URL to sanitize
 * @returns Sanitized URL or empty string if unsafe
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (url == null) return "";

  const str = String(url).trim().toLowerCase();

  // Block dangerous protocols
  if (
    str.startsWith("javascript:") ||
    str.startsWith("data:") ||
    str.startsWith("vbscript:") ||
    str.startsWith("file:")
  ) {
    return "";
  }

  return url;
}

/**
 * Generate a cryptographically random ID for client-side use
 * Uses Web Crypto API for secure randomness
 *
 * CDP-003: RANDOMNESS - Use cryptographically secure RNGs
 *
 * @param length - Length of the ID (default: 16)
 * @returns Random alphanumeric string
 */
export function generateSecureId(length: number = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

/**
 * Rate limiter for client-side actions
 * Prevents rapid-fire API calls or button clicks
 *
 * API-002: RATE_LIMIT - Client-side rate limiting
 */
export class ClientRateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if an action is allowed under the rate limit
   * @returns true if allowed, false if rate limited
   */
  isAllowed(): boolean {
    const now = Date.now();
    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter((ts) => now - ts < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }

  /**
   * Get remaining requests in the current window
   */
  getRemainingRequests(): number {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((ts) => now - ts < this.windowMs);
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.timestamps = [];
  }
}

/**
 * Detect and log potential XSS attempts for security monitoring
 *
 * SEC-017: AUDIT_TRAILS - Log security-sensitive events
 *
 * @param input - Input to check
 * @param context - Context for logging (e.g., field name)
 * @returns true if suspicious content detected
 */
export function detectSuspiciousInput(
  input: string,
  context: string = "unknown",
): boolean {
  if (!input) return false;

  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // Event handlers like onclick=
    /data:/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<svg.*onload/i,
    /expression\s*\(/i, // CSS expression
    /url\s*\(\s*["']?javascript/i,
  ];

  const isSuspicious = suspiciousPatterns.some((pattern) =>
    pattern.test(input),
  );

  if (isSuspicious) {
    // Log for security monitoring (non-blocking)
    console.warn("[SECURITY] Suspicious input detected", {
      context,
      timestamp: new Date().toISOString(),
      pattern: "XSS_ATTEMPT",
    });
  }

  return isSuspicious;
}

/**
 * Security event types for structured logging
 * LM-001: LOGGING - Emit structured logs with severity levels
 */
export type SecurityEventType =
  | "AUTH_FAILED"
  | "AUTH_SUCCESS"
  | "SESSION_EXPIRED"
  | "CREDENTIAL_VERIFICATION_FAILED"
  | "PERMISSION_DENIED"
  | "RATE_LIMIT_EXCEEDED"
  | "SUSPICIOUS_INPUT"
  | "INVALID_TOKEN";

/**
 * Security event severity levels
 */
export type SecuritySeverity = "info" | "warn" | "error";

/**
 * Structured security event interface
 * Excludes PII and secrets per LM-001
 */
interface SecurityEvent {
  type: SecurityEventType;
  severity: SecuritySeverity;
  timestamp: string;
  context?: string;
  errorCode?: string;
  // Never include: email, password, PIN, tokens, PII
}

/**
 * Log a security event in structured format
 *
 * LM-001: LOGGING - Emit structured logs with severity levels and exclude secrets
 * SEC-017: AUDIT_TRAILS - Log security-sensitive events for monitoring
 * OWASP A09: Security Logging and Monitoring Failures
 *
 * @param type - Type of security event
 * @param severity - Severity level
 * @param details - Additional context (must NOT contain PII or secrets)
 *
 * @example
 * logSecurityEvent('AUTH_FAILED', 'warn', { context: 'management_login', errorCode: 'INVALID_CREDENTIALS' });
 */
export function logSecurityEvent(
  type: SecurityEventType,
  severity: SecuritySeverity,
  details: { context?: string; errorCode?: string } = {},
): void {
  const event: SecurityEvent = {
    type,
    severity,
    timestamp: new Date().toISOString(),
    ...details,
  };

  // In production, this would send to a centralized logging service
  // For now, use console with structured format
  const logMethod =
    severity === "error"
      ? console.error
      : severity === "warn"
        ? console.warn
        : console.info;

  logMethod("[SECURITY]", JSON.stringify(event));
}

/**
 * Log a failed authentication attempt
 *
 * OWASP A09: Log failed authentication for brute-force detection
 * Note: Does NOT log email/password/PIN - only event metadata
 *
 * @param context - Where the auth attempt occurred (e.g., 'management_login', 'cashier_pin')
 * @param errorCode - The error code returned (e.g., 'INVALID_CREDENTIALS', 'INSUFFICIENT_PERMISSIONS')
 */
export function logAuthFailure(context: string, errorCode?: string): void {
  logSecurityEvent("AUTH_FAILED", "warn", { context, errorCode });
}

/**
 * Log a credential verification failure (different from session expiration)
 *
 * Used when verifying OTHER users' credentials (not the current session)
 * Examples: Manager login for pack activation, cashier PIN verification
 *
 * @param context - Where the verification occurred
 * @param errorCode - The error code returned
 */
export function logCredentialVerificationFailure(
  context: string,
  errorCode?: string,
): void {
  logSecurityEvent("CREDENTIAL_VERIFICATION_FAILED", "warn", {
    context,
    errorCode,
  });
}
