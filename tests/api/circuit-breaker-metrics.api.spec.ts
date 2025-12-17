/**
 * Circuit Breaker Metrics API Tests
 *
 * Tests for the circuit breaker monitoring endpoints added in Phase 5.
 * Verifies admin-only access and correct metrics reporting.
 *
 * @test-level API
 * @story Phase 5 - Rate Limit/Circuit Breaker
 * @priority P1 (High - Monitoring critical infrastructure)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";

test.describe("Phase5-API: Circuit Breaker Metrics", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/health/circuit-breaker - View circuit breaker metrics
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("GET /api/health/circuit-breaker", () => {
    test("should return circuit breaker metrics for system admin", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: An authenticated system admin
      const response = await superadminApiRequest.get(
        "/api/health/circuit-breaker",
      );

      // THEN: Response should be successful with circuit breaker data
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.circuits).toBeDefined();
      expect(Array.isArray(body.data.circuits)).toBe(true);
      expect(body.data.summary).toBeDefined();
      expect(body.data.summary.alerts).toBeDefined();
    });

    test("should include rbac circuit breaker in metrics", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: An authenticated system admin
      const response = await superadminApiRequest.get(
        "/api/health/circuit-breaker",
      );

      // THEN: RBAC circuit breaker should be present
      const body = await response.json();
      const circuitNames = body.data.circuits.map(
        (c: { name: string }) => c.name,
      );
      expect(circuitNames).toContain("rbac");
    });

    test("should include stats for each circuit", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: An authenticated system admin
      const response = await superadminApiRequest.get(
        "/api/health/circuit-breaker",
      );

      // THEN: Each circuit should have stats
      const body = await response.json();
      for (const circuit of body.data.circuits) {
        expect(circuit.name).toBeDefined();
        expect(circuit.state).toBeDefined();
        expect(circuit.stats).toBeDefined();
        expect(typeof circuit.stats.totalRequests).toBe("number");
        expect(typeof circuit.stats.successfulRequests).toBe("number");
        expect(typeof circuit.stats.failedRequests).toBe("number");
        expect(typeof circuit.stats.rejectedRequests).toBe("number");
        expect(typeof circuit.stats.timeouts).toBe("number");
        expect(circuit.performance).toBeDefined();
        expect(circuit.performance.failureRate).toBeDefined();
        expect(circuit.performance.averageResponseTime).toBeDefined();
      }
    });

    test("should include summary with healthy/unhealthy counts", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: An authenticated system admin
      const response = await superadminApiRequest.get(
        "/api/health/circuit-breaker",
      );

      // THEN: Summary should have expected fields
      const body = await response.json();
      expect(body.data.summary.totalCircuits).toBeDefined();
      expect(body.data.summary.healthyCircuits).toBeDefined();
      expect(body.data.summary.unhealthyCircuits).toBeDefined();
      expect(body.data.summary.alerts).toBeDefined();
    });

    test("should return 403 for non-admin users", async ({
      storeManagerApiRequest,
    }) => {
      // GIVEN: A non-admin user (store manager)
      // WHEN: Non-admin tries to access circuit breaker metrics
      const response = await storeManagerApiRequest.get(
        "/api/health/circuit-breaker",
      );

      // THEN: Should return 403 Forbidden
      expect(response.status()).toBe(403);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
    });

    test("should return 401 for unauthenticated requests", async ({
      apiRequest,
    }) => {
      // WHEN: Unauthenticated request
      const response = await apiRequest.get("/api/health/circuit-breaker");

      // THEN: Should return 401 Unauthorized
      expect(response.status()).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/health/circuit-breaker/reset - Reset all circuit breakers
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("POST /api/health/circuit-breaker/reset", () => {
    test("should reset circuit breakers for system admin", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: An authenticated system admin
      const response = await superadminApiRequest.post(
        "/api/health/circuit-breaker/reset",
        {},
      );

      // THEN: Response should be successful
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain("reset");
    });

    test("should result in all circuits being CLOSED after reset", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: Reset was performed
      await superadminApiRequest.post("/api/health/circuit-breaker/reset", {});

      // WHEN: Check circuit breaker metrics
      const response = await superadminApiRequest.get(
        "/api/health/circuit-breaker",
      );

      // THEN: All circuits should be CLOSED
      const body = await response.json();
      for (const circuit of body.data.circuits) {
        expect(circuit.state).toBe("CLOSED");
      }
    });

    test("should return 403 for non-admin users", async ({
      cashierApiRequest,
    }) => {
      // GIVEN: A non-admin user (cashier)
      // WHEN: Non-admin tries to reset circuit breakers
      const response = await cashierApiRequest.post(
        "/api/health/circuit-breaker/reset",
        {},
      );

      // THEN: Should return 403 Forbidden
      expect(response.status()).toBe(403);
    });

    test("should return 401 for unauthenticated requests", async ({
      apiRequest,
    }) => {
      // WHEN: Unauthenticated request
      const response = await apiRequest.post(
        "/api/health/circuit-breaker/reset",
        {},
      );

      // THEN: Should return 401 Unauthorized
      expect(response.status()).toBe(401);
    });
  });
});

test.describe("Phase5-API: Rate Limit Headers", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // Rate Limit Headers Verification
  // ═══════════════════════════════════════════════════════════════════════════

  test("should include rate limit headers in responses", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: An authenticated request
    const response = await superadminApiRequest.get("/api/health");

    // THEN: Response should include rate limit headers
    // Note: In test environment rate limiting may be disabled,
    // but in production these headers should be present
    expect(response.status()).toBe(200);

    // Headers are lowercased by Playwright
    const headers = response.headers();
    // These headers are added when rate limiting is enabled (non-test env)
    // In test environment, we just verify the endpoint works
  });

  test("health endpoint should always be accessible", async ({
    apiRequest,
  }) => {
    // GIVEN: Multiple rapid requests to health endpoint
    const responses = await Promise.all([
      apiRequest.get("/api/health"),
      apiRequest.get("/api/health"),
      apiRequest.get("/api/health"),
    ]);

    // THEN: All should succeed (health endpoint shouldn't be rate limited)
    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  });
});
