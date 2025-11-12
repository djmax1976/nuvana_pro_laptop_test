import { test, expect } from "../support/fixtures";
import { createUser } from "../support/factories";

/**
 * Edge Cases API Tests
 *
 * These tests verify edge cases and boundary conditions:
 * - Empty request bodies
 * - Boundary values
 * - Special characters in data
 * - Unicode and international characters
 * - Very long strings
 * - Empty strings
 * - Null/undefined handling
 *
 * Coverage: Edge cases and boundary conditions
 * Priority: P2 (medium priority - important but not critical)
 */

test.describe("EDGE-API-001: Edge Cases - Empty and Null Values", () => {
  test("[P2] EDGE-API-001-001: GET /health with empty query string should return 200", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Requesting health endpoint with empty query string
    const response = await apiRequest.get("/health?");

    // THEN: Response is 200 OK
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("status", "ok");
  });

  test("[P2] EDGE-API-001-002: POST /api/users with empty body should return 400 or 404", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Sending POST request with empty body
    // Use factory to show intent: empty object represents missing required fields
    const emptyUserData = {}; // Explicitly empty - factory would add required fields
    const response = await apiRequest.post("/api/users", emptyUserData);

    // THEN: Response is 400 Bad Request or 404 Not Found
    // Note: Depends on endpoint implementation
    expect([400, 404]).toContain(response.status());
  });
});

test.describe("EDGE-API-002: Edge Cases - Special Characters", () => {
  test("[P2] EDGE-API-002-001: Health endpoint should handle special characters in headers", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Sending request with special characters in custom header
    const response = await apiRequest.get("/health", {
      headers: {
        "X-Custom-Header": 'test<script>alert("xss")</script>',
      },
    });

    // THEN: Server handles gracefully (200 or 400)
    expect([200, 400]).toContain(response.status());
  });

  test("[P2] EDGE-API-002-002: Health endpoint should handle unicode characters", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Requesting with unicode characters in query
    const response = await apiRequest.get(
      "/health?test=测试&name=José&emoji=🎉",
    );

    // THEN: Server handles unicode gracefully (200 or 400)
    expect([200, 400]).toContain(response.status());
  });
});

test.describe("EDGE-API-003: Edge Cases - Boundary Values", () => {
  test("[P2] EDGE-API-003-001: Health endpoint should handle very long URL", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Requesting with very long query string
    const longQuery = "param=" + "x".repeat(1000);
    const response = await apiRequest.get(`/health?${longQuery}`);

    // THEN: Server handles long URL (200 or 414 URI Too Long)
    expect([200, 400, 414]).toContain(response.status());
  });

  test("[P2] EDGE-API-003-002: Health endpoint should handle multiple query parameters", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Requesting with many query parameters
    const manyParams = Array.from(
      { length: 50 },
      (_, i) => `param${i}=value${i}`,
    ).join("&");
    const response = await apiRequest.get(`/health?${manyParams}`);

    // THEN: Server handles many parameters (200 or 414)
    expect([200, 400, 414]).toContain(response.status());
  });
});

test.describe("EDGE-API-004: Edge Cases - HTTP Headers", () => {
  test("[P2] EDGE-API-004-001: Health endpoint should handle missing Accept header", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Requesting without Accept header
    const response = await apiRequest.get("/health", {
      headers: {},
    });

    // THEN: Server handles missing Accept header (200)
    expect(response.status()).toBe(200);
  });

  test("[P2] EDGE-API-004-002: Health endpoint should handle various Accept headers", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Requesting with different Accept headers
    const acceptHeaders = [
      "application/json",
      "application/xml",
      "text/html",
      "*/*",
      "application/json, text/plain, */*",
    ];

    for (const accept of acceptHeaders) {
      const response = await apiRequest.get("/health", {
        headers: {
          Accept: accept,
        },
      });

      // THEN: Server handles various Accept headers (200)
      expect(response.status()).toBe(200);
    }
  });
});

test.describe("EDGE-API-005: Edge Cases - Concurrent Requests", () => {
  test("[P2] EDGE-API-005-001: Health endpoint should handle concurrent requests", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Sending multiple concurrent requests
    const requests = Array.from({ length: 10 }, () =>
      apiRequest.get("/health"),
    );

    const responses = await Promise.all(requests);

    // THEN: All requests succeed
    responses.forEach((response) => {
      expect(response.status()).toBe(200);
    });
  });

  test("[P2] EDGE-API-005-002: Health endpoint should handle rapid sequential requests", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Sending rapid sequential requests
    const responses = [];
    for (let i = 0; i < 20; i++) {
      const response = await apiRequest.get("/health");
      responses.push(response);
    }

    // THEN: All requests succeed
    responses.forEach((response) => {
      expect(response.status()).toBe(200);
    });
  });
});

test.describe("EDGE-API-006: Edge Cases - Response Format", () => {
  test("[P2] EDGE-API-006-001: Health endpoint response should have valid timestamp format", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Requesting health endpoint
    const response = await apiRequest.get("/health");

    // THEN: Response contains valid ISO timestamp
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("timestamp");
    expect(typeof body.timestamp).toBe("string");

    // Verify ISO 8601 format
    const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    expect(body.timestamp).toMatch(timestampRegex);
  });

  test("[P2] EDGE-API-006-002: Health endpoint response should be valid JSON", async ({
    apiRequest,
  }) => {
    // GIVEN: Backend server is running
    // WHEN: Requesting health endpoint
    const response = await apiRequest.get("/health");

    // THEN: Response is valid JSON
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");

    const body = await response.json();
    expect(body).toBeDefined();
    expect(typeof body).toBe("object");
  });
});
