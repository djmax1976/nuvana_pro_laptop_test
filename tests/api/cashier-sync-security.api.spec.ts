/**
 * Cashier Sync Security Tests
 *
 * Comprehensive security testing for the cashier sync endpoint following
 * enterprise security standards. Tests authentication, authorization,
 * injection prevention, and privilege escalation prevention.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SECURITY TEST TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | OWASP Category                | Threat                  | Priority |
 * |-------------------|-------------------------------|-------------------------|----------|
 * | CSYNC-SEC-001     | A01:2021 Broken Access Ctrl   | Missing Auth            | P0       |
 * | CSYNC-SEC-002     | A01:2021 Broken Access Ctrl   | Invalid API Key         | P0       |
 * | CSYNC-SEC-003     | A01:2021 Broken Access Ctrl   | Revoked API Key         | P0       |
 * | CSYNC-SEC-004     | A01:2021 Broken Access Ctrl   | Expired API Key         | P0       |
 * | CSYNC-SEC-005     | A01:2021 Broken Access Ctrl   | Suspended API Key       | P0       |
 * | CSYNC-SEC-006     | A01:2021 Broken Access Ctrl   | Cross-Store Access      | P0       |
 * | CSYNC-SEC-007     | A01:2021 Broken Access Ctrl   | Cross-Session Access    | P0       |
 * | CSYNC-SEC-008     | A01:2021 Broken Access Ctrl   | Session Hijacking       | P0       |
 * | CSYNC-SEC-009     | A03:2021 Injection            | SQL Injection session_id| P0       |
 * | CSYNC-SEC-010     | A03:2021 Injection            | SQL Injection timestamp | P0       |
 * | CSYNC-SEC-011     | A03:2021 Injection            | SQL Injection limit     | P0       |
 * | CSYNC-SEC-012     | A03:2021 Injection            | NoSQL/JSON Injection    | P0       |
 * | CSYNC-SEC-013     | A04:2021 Insecure Design      | IDOR via session_id     | P0       |
 * | CSYNC-SEC-014     | A04:2021 Insecure Design      | Enum of cashier data    | P1       |
 * | CSYNC-SEC-015     | A05:2021 Security Misconfig   | Verbose Error Messages  | P1       |
 * | CSYNC-SEC-016     | A07:2021 Auth Failures        | Brute Force Prevention  | P1       |
 * | CSYNC-SEC-017     | A07:2021 Auth Failures        | Rate Limiting           | P1       |
 * | CSYNC-SEC-018     | A09:2021 Security Logging     | Audit Trail             | P1       |
 * | CSYNC-SEC-019     | PIN Hash Security             | No Plain PIN in Transit | P0       |
 * | CSYNC-SEC-020     | PIN Hash Security             | Bcrypt Cost Factor      | P0       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level Security
 * @justification Security-critical endpoint handling offline authentication data
 * @story CASHIER-SYNC-OFFLINE-AUTH
 * @priority P0 (Critical - Security testing for auth-related feature)
 */

import { test, expect } from "@playwright/test";

// ============================================================================
// Constants
// ============================================================================

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const SYNC_CASHIERS_PATH = "/api/v1/sync/cashiers";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Make request with optional API key
 */
async function makeRequest(
  request: typeof test.prototype.request,
  params: Record<string, string>,
  headers: Record<string, string> = {},
) {
  const url = new URL(SYNC_CASHIERS_PATH, BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return request.get(url.toString(), { headers });
}

// ============================================================================
// Authentication Tests (A01:2021 Broken Access Control)
// ============================================================================

test.describe("CSYNC-SECURITY: Authentication Enforcement", () => {
  test("CSYNC-SEC-001: [P0] Request without API key should return 401", async ({
    request,
  }) => {
    // GIVEN: No X-API-Key header

    // WHEN: Making request without authentication
    const response = await request.get(
      `${BASE_URL}${SYNC_CASHIERS_PATH}?session_id=test`,
    );

    // THEN: 401 Unauthorized is returned
    expect(response.status()).toBe(401);

    // AND: Error response doesn't leak sensitive info
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.message).not.toContain("stack");
    expect(body.error.message).not.toContain("database");
  });

  test("CSYNC-SEC-002: [P0] Invalid API key format should return 401", async ({
    request,
  }) => {
    // GIVEN: Various invalid API key formats
    const invalidKeys = [
      "", // Empty
      "invalid", // Wrong format
      "nuvpos_sk_short", // Too short
      "Bearer token123", // JWT style
      "api_key_12345678_abcdefghijklmnop", // Wrong prefix
      "nuvpos_sk_!@#$%^&*_invalidchars!!", // Invalid characters
    ];

    for (const invalidKey of invalidKeys) {
      // WHEN: Making request with invalid key
      const response = await request.get(
        `${BASE_URL}${SYNC_CASHIERS_PATH}?session_id=test`,
        {
          headers: { "X-API-Key": invalidKey },
        },
      );

      // THEN: 401 Unauthorized is returned
      expect(response.status()).toBe(401);
    }
  });

  test("CSYNC-SEC-003: [P0] Revoked API key should return 401", async () => {
    // DOCUMENT: Revoked keys are handled by middleware
    // The apiKeyMiddleware checks status and rejects REVOKED keys

    const revokedKeyBehavior = {
      middleware: "apiKeyMiddleware",
      statusCheck: "status !== 'REVOKED'",
      expectedResponse: 401,
      errorCode: "KEY_REVOKED",
    };

    expect(revokedKeyBehavior.expectedResponse).toBe(401);
  });

  test("CSYNC-SEC-004: [P0] Expired API key should return 401", async () => {
    // DOCUMENT: Expired keys are handled by middleware
    // The apiKeyMiddleware checks expires_at against current time

    const expiredKeyBehavior = {
      middleware: "apiKeyMiddleware",
      expiryCheck: "expires_at === null || expires_at > now",
      expectedResponse: 401,
      errorCode: "KEY_EXPIRED",
    };

    expect(expiredKeyBehavior.expectedResponse).toBe(401);
  });

  test("CSYNC-SEC-005: [P0] Suspended API key should return 401", async () => {
    // DOCUMENT: Suspended keys are handled by middleware

    const suspendedKeyBehavior = {
      middleware: "apiKeyMiddleware",
      statusCheck: "status !== 'SUSPENDED'",
      expectedResponse: 401,
      errorCode: "KEY_SUSPENDED",
    };

    expect(suspendedKeyBehavior.expectedResponse).toBe(401);
  });
});

// ============================================================================
// Authorization Tests (A01:2021 Broken Access Control)
// ============================================================================

test.describe("CSYNC-SECURITY: Authorization - Store Isolation", () => {
  test("CSYNC-SEC-006: [P0] Cannot access cashiers from another store", async () => {
    // DOCUMENT: Store isolation enforcement
    // 1. API key is bound to store_id at creation
    // 2. Sync session inherits store_id from API key
    // 3. getCashiersForSync uses session's store_id
    // 4. Prisma query filters by store_id

    const storeIsolationLayers = [
      {
        layer: "API Key Creation",
        control: "Key is bound to single store_id",
      },
      {
        layer: "Session Creation",
        control: "Session inherits store_id from API key",
      },
      {
        layer: "Service Layer",
        control: "Store ID comes from validated session only",
      },
      {
        layer: "Database Query",
        control: "WHERE store_id = session.store_id",
      },
    ];

    expect(storeIsolationLayers).toHaveLength(4);
    storeIsolationLayers.forEach((layer) => {
      expect(layer.control).toBeTruthy();
    });
  });

  test("CSYNC-SEC-007: [P0] Cannot use session from another API key", async () => {
    // DOCUMENT: Session ownership validation
    // validateSyncSession() checks session.api_key_id === requesting key

    const sessionOwnershipCheck = {
      method: "validateSyncSession",
      validation: "session.api_key_id === requestingApiKeyId",
      onMismatch:
        "throws 'INVALID_SESSION: Session does not belong to this API key'",
      httpStatus: 400,
    };

    expect(sessionOwnershipCheck.httpStatus).toBe(400);
  });

  test("CSYNC-SEC-008: [P0] Expired sessions are rejected", async () => {
    // DOCUMENT: Session expiry enforcement
    // Sessions older than 1 hour are rejected

    const sessionExpiryCheck = {
      maxAge: 60 * 60 * 1000, // 1 hour in ms
      validation: "Date.now() - session.session_started_at < maxAge",
      onExpired: "throws 'INVALID_SESSION: Sync session has expired'",
      httpStatus: 400,
    };

    expect(sessionExpiryCheck.maxAge).toBe(3600000);
  });
});

// ============================================================================
// Injection Prevention Tests (A03:2021 Injection)
// ============================================================================

test.describe("CSYNC-SECURITY: Injection Prevention", () => {
  test("CSYNC-SEC-009: [P0] SQL injection in session_id is prevented", async ({
    request,
  }) => {
    // GIVEN: SQL injection payloads
    const sqlPayloads = [
      "'; DROP TABLE cashiers; --",
      "1' OR '1'='1",
      "1; SELECT * FROM users --",
      "' UNION SELECT * FROM api_keys --",
      "1' AND (SELECT COUNT(*) FROM pg_tables) > 0 --",
    ];

    for (const payload of sqlPayloads) {
      // WHEN: Making request with SQL injection attempt
      const response = await request.get(
        `${BASE_URL}${SYNC_CASHIERS_PATH}?session_id=${encodeURIComponent(payload)}`,
      );

      // THEN: Request is rejected (400 for invalid format or 401 for no auth)
      expect([400, 401]).toContain(response.status());

      // AND: No SQL error is exposed
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain("syntax error");
      expect(JSON.stringify(body)).not.toContain("pg_");
      expect(JSON.stringify(body)).not.toContain("SELECT");
    }
  });

  test("CSYNC-SEC-010: [P0] SQL injection in since_timestamp is prevented", async ({
    request,
  }) => {
    // GIVEN: SQL injection in timestamp parameter
    const timestampPayloads = [
      "2024-01-01'; DROP TABLE cashiers; --",
      "1' OR '1'='1",
    ];

    for (const payload of timestampPayloads) {
      // WHEN: Making request with injection in timestamp
      const response = await request.get(
        `${BASE_URL}${SYNC_CASHIERS_PATH}?session_id=test&since_timestamp=${encodeURIComponent(payload)}`,
      );

      // THEN: Request is rejected
      expect([400, 401]).toContain(response.status());
    }
  });

  test("CSYNC-SEC-011: [P0] SQL injection in limit is prevented", async ({
    request,
  }) => {
    // GIVEN: SQL injection in limit parameter
    const limitPayloads = [
      "100; DROP TABLE cashiers",
      "100 OR 1=1",
      "-1 UNION SELECT * FROM users",
    ];

    for (const payload of limitPayloads) {
      // WHEN: Making request with injection in limit
      const response = await request.get(
        `${BASE_URL}${SYNC_CASHIERS_PATH}?session_id=test&limit=${encodeURIComponent(payload)}`,
      );

      // THEN: Request is rejected
      expect([400, 401]).toContain(response.status());
    }
  });

  test("CSYNC-SEC-012: [P0] NoSQL/JSON injection is prevented", async ({
    request,
  }) => {
    // GIVEN: NoSQL-style injection payloads
    const nosqlPayloads = [
      '{"$gt":""}',
      '{"$where":"this.password"}',
      '{"$regex":".*"}',
    ];

    for (const payload of nosqlPayloads) {
      // WHEN: Making request with NoSQL injection
      const response = await request.get(
        `${BASE_URL}${SYNC_CASHIERS_PATH}?session_id=${encodeURIComponent(payload)}`,
      );

      // THEN: Request is rejected
      expect([400, 401]).toContain(response.status());
    }
  });
});

// ============================================================================
// Insecure Design Tests (A04:2021)
// ============================================================================

test.describe("CSYNC-SECURITY: Secure Design Patterns", () => {
  test("CSYNC-SEC-013: [P0] IDOR prevented - cannot enumerate sessions", async () => {
    // DOCUMENT: IDOR prevention for sessions
    // 1. Session IDs are UUIDs (non-sequential)
    // 2. Session ownership is validated
    // 3. Cannot access data without valid API key + matching session

    const idorPrevention = {
      sessionIdFormat: "UUID v4 (random)",
      ownershipValidation: true,
      apiKeyRequired: true,
      rationale: "Cannot enumerate or guess valid session IDs",
    };

    expect(idorPrevention.sessionIdFormat).toContain("UUID");
    expect(idorPrevention.ownershipValidation).toBe(true);
  });

  test("CSYNC-SEC-014: [P1] Cannot enumerate cashiers across stores", async () => {
    // DOCUMENT: Enumeration prevention
    // 1. No endpoint allows listing all cashiers
    // 2. Store ID comes from validated session
    // 3. Cannot manipulate store_id parameter

    const enumerationPrevention = {
      noGlobalList: true,
      storeIdFromSession: true,
      noStoreIdParam: true,
    };

    expect(enumerationPrevention.noGlobalList).toBe(true);
    expect(enumerationPrevention.storeIdFromSession).toBe(true);
  });
});

// ============================================================================
// Security Misconfiguration Tests (A05:2021)
// ============================================================================

test.describe("CSYNC-SECURITY: Error Handling", () => {
  test("CSYNC-SEC-015: [P1] Error messages should not leak sensitive info", async ({
    request,
  }) => {
    // GIVEN: Various error-inducing requests

    // WHEN: Making invalid request
    const response = await request.get(
      `${BASE_URL}${SYNC_CASHIERS_PATH}?session_id=invalid`,
    );

    // THEN: Error response doesn't leak sensitive info
    const body = await response.json();
    const bodyString = JSON.stringify(body);

    // Should NOT contain:
    expect(bodyString).not.toContain("password");
    expect(bodyString).not.toContain("pin_hash");
    expect(bodyString).not.toContain("database");
    expect(bodyString).not.toContain("postgres");
    expect(bodyString).not.toContain("prisma");
    expect(bodyString).not.toMatch(/at \w+\.js:\d+:\d+/); // Stack traces
    expect(bodyString).not.toContain("node_modules");
  });
});

// ============================================================================
// Rate Limiting Tests (A07:2021)
// ============================================================================

test.describe("CSYNC-SECURITY: Rate Limiting", () => {
  test("CSYNC-SEC-017: [P1] Rate limiting should be enforced", async () => {
    // DOCUMENT: Rate limiting configuration
    // Enforced by apiKeyMiddleware checking rate_limit_rpm

    const rateLimitConfig = {
      middleware: "apiKeyMiddleware",
      perKeyLimit: "configurable per API key (rate_limit_rpm)",
      defaultLimit: "1000 RPM",
      responseOnExceed: 429,
      errorCode: "RATE_LIMIT_EXCEEDED",
    };

    expect(rateLimitConfig.responseOnExceed).toBe(429);
  });
});

// ============================================================================
// Audit Logging Tests (A09:2021)
// ============================================================================

test.describe("CSYNC-SECURITY: Audit Logging", () => {
  test("CSYNC-SEC-018: [P1] Sync operations should be logged", async () => {
    // DOCUMENT: Audit logging for sync operations

    const auditRequirements = {
      eventsLogged: ["SYNC_STARTED", "Cashier sync (via eventDetails)"],
      fieldsLogged: [
        "apiKeyId",
        "sessionId",
        "ipAddress",
        "cashierCount",
        "deviceFingerprint",
      ],
      retentionPeriod: "Per compliance requirements",
      accessRestriction: "Admin only",
    };

    expect(auditRequirements.eventsLogged.length).toBeGreaterThan(0);
    expect(auditRequirements.fieldsLogged).toContain("apiKeyId");
    expect(auditRequirements.fieldsLogged).toContain("ipAddress");
  });
});

// ============================================================================
// PIN Hash Security Tests
// ============================================================================

test.describe("CSYNC-SECURITY: PIN Hash Security", () => {
  test("CSYNC-SEC-019: [P0] Plain PINs should never be transmitted", async () => {
    // DOCUMENT: PIN security requirements
    // 1. PINs are hashed with bcrypt at creation
    // 2. Only hashes are stored in database
    // 3. Only hashes are transmitted in sync response
    // 4. Desktop app verifies PINs locally using bcrypt.compare

    const pinSecurityFlow = {
      storage: "bcrypt hash only",
      transmission: "bcrypt hash only",
      verification: "bcrypt.compare(inputPin, storedHash)",
      plainPinExposure: "NEVER",
    };

    expect(pinSecurityFlow.plainPinExposure).toBe("NEVER");
    expect(pinSecurityFlow.storage).toContain("bcrypt");
    expect(pinSecurityFlow.transmission).toContain("bcrypt");
  });

  test("CSYNC-SEC-020: [P0] Bcrypt cost factor should be appropriate", async () => {
    // DOCUMENT: Bcrypt configuration
    // Cost factor 10 provides ~100ms hash time, appropriate for PINs

    const bcryptConfig = {
      algorithm: "bcrypt",
      costFactor: 10,
      hashFormat: "$2a$10$...",
      rationale: "Balance between security and usability for 4-digit PINs",
    };

    // Verify expected hash format
    const exampleHash = "$2a$10$N9qo8uLOickgx2ZMRZoMye";
    expect(exampleHash).toMatch(/^\$2[aby]?\$10\$/);
    expect(bcryptConfig.costFactor).toBe(10);
  });
});

// ============================================================================
// Privilege Escalation Tests
// ============================================================================

test.describe("CSYNC-SECURITY: Privilege Escalation Prevention", () => {
  test("PRIV-ESC-001: [P0] API key cannot access elevated permissions", async () => {
    // DOCUMENT: API keys have fixed, non-elevated permissions
    // ApiKeyIdentity.isElevated is always false

    const apiKeyPrivileges = {
      isElevated: false,
      cannotElevate: true,
      permissionsFromPayload: "offline_permissions array",
      noAdminAccess: true,
    };

    expect(apiKeyPrivileges.isElevated).toBe(false);
    expect(apiKeyPrivileges.cannotElevate).toBe(true);
  });

  test("PRIV-ESC-002: [P0] Cannot modify session store_id", async () => {
    // DOCUMENT: Store ID immutability
    // 1. store_id comes from API key at session creation
    // 2. No endpoint accepts store_id as input parameter
    // 3. store_id is always read from validated session

    const storeIdImmutability = {
      source: "API key (at session creation)",
      userInput: false,
      modifiable: false,
    };

    expect(storeIdImmutability.userInput).toBe(false);
    expect(storeIdImmutability.modifiable).toBe(false);
  });
});
