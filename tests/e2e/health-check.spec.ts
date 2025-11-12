import { test, expect } from "../support/fixtures";

/**
 * E2E Tests - Critical User Journeys
 *
 * These tests validate complete user-facing workflows end-to-end.
 * Focus on critical paths that must always work (P0 priority).
 */

test.describe("E2E-001: Health Check - Critical Paths", () => {
  test("[P0] E2E-001-001: Health check endpoint should be accessible from frontend", async ({
    page,
  }) => {
    // GIVEN: Frontend is running
    // WHEN: User navigates to health check page (or frontend calls health API)
    const response = await page.request.get("/api/health");

    // THEN: Health check returns 200 OK with service status
    expect(response.status()).toBe(200);

    const healthData = await response.json();
    expect(healthData).toHaveProperty("status");
    expect(healthData).toHaveProperty("timestamp");
    expect(healthData).toHaveProperty("services");
    expect(healthData.services).toHaveProperty("redis");
    expect(healthData.services).toHaveProperty("rabbitmq");
  });

  test("[P0] E2E-001-002: Health check should report all services as healthy", async ({
    page,
  }) => {
    // GIVEN: All services (Redis, RabbitMQ) are running
    // WHEN: Health check endpoint is called
    const response = await page.request.get("/api/health");

    // THEN: All services report healthy status
    expect(response.status()).toBe(200);

    const healthData = await response.json();
    expect(healthData.status).toBe("ok");
    expect(healthData.services.redis.healthy).toBe(true);
    expect(healthData.services.rabbitmq.healthy).toBe(true);
  });

  test("[P1] E2E-001-003: Health check should include version information", async ({
    page,
  }) => {
    // GIVEN: Backend is running
    // WHEN: Health check endpoint is called
    const response = await page.request.get("/api/health");

    // THEN: Response includes version information
    expect(response.status()).toBe(200);

    const healthData = await response.json();
    expect(healthData).toHaveProperty("version");
    expect(typeof healthData.version).toBe("string");
    expect(healthData.version.length).toBeGreaterThan(0);
  });
});
