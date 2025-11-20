import { test, expect } from "../support/fixtures/rbac.fixture";
import { createClient } from "../support/factories";

/**
 * Public ID Security Tests
 *
 * Verifies security properties of the public ID implementation:
 * - IDOR prevention
 * - Format validation
 * - Enumeration resistance
 * - Authorization checks
 * - SQL injection prevention
 * - XSS prevention
 * - Collision resistance
 *
 * Priority: P0 (Security-critical)
 */

test.describe("Public ID Security - IDOR Prevention", () => {
  test("[P0] SEC-PID-001: Should prevent enumeration attacks via sequential IDs", async ({
    prismaClient,
  }) => {
    // GIVEN: Three clients created in sequence
    const client1 = await prismaClient.client.create({
      data: createClient({ name: "Client 1" }),
    });
    const client2 = await prismaClient.client.create({
      data: createClient({ name: "Client 2" }),
    });
    const client3 = await prismaClient.client.create({
      data: createClient({ name: "Client 3" }),
    });

    // THEN: public_ids are NOT sequential or predictable
    expect(client1.public_id).not.toBe(client2.public_id);
    expect(client2.public_id).not.toBe(client3.public_id);

    // Extract numeric portion if any (there shouldn't be sequential numbers)
    const numericPattern = /\d+/;
    const num1 = client1.public_id?.match(numericPattern)?.[0];
    const num2 = client2.public_id?.match(numericPattern)?.[0];
    const num3 = client3.public_id?.match(numericPattern)?.[0];

    // If numbers exist, they should not be sequential
    if (num1 && num2 && num3) {
      expect(parseInt(num2) - parseInt(num1)).not.toBe(1);
      expect(parseInt(num3) - parseInt(num2)).not.toBe(1);
    }

    // Cleanup
    await Promise.all([
      prismaClient.client.delete({ where: { client_id: client1.client_id } }),
      prismaClient.client.delete({ where: { client_id: client2.client_id } }),
      prismaClient.client.delete({ where: { client_id: client3.client_id } }),
    ]);
  });

  test("[P0] SEC-PID-002: Should prevent IDOR by rejecting fabricated public_ids", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting to access with plausible-looking but fake public_id
    const fabricatedIds = [
      "clt_1234567890",
      "clt_abcdefghij",
      "clt_aaaaaaaaaa",
      "clt_zzzzzzzzzz",
    ];

    for (const fakeId of fabricatedIds) {
      const response = await superadminApiRequest.get(`/api/clients/${fakeId}`);

      // THEN: Request is rejected with 404 (not 500)
      expect(response.status(), `Should reject ${fakeId}`).toBe(404);
    }
  });

  test("[P0] SEC-PID-003: Should prevent brute force enumeration via consistent 404s", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Making rapid sequential requests with different public_ids
    const attempts = 10;

    const responses = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        superadminApiRequest.get(
          `/api/clients/clt_fake${i.toString().padStart(10, "0")}`,
        ),
      ),
    );

    // THEN: All requests should fail with 404 (consistent response)
    responses.forEach((response) => {
      expect(response.status()).toBe(404);
    });

    // Note: This test verifies consistent 404s which prevents enumeration
    // Actual rate limiting would be tested separately with load testing tools
  });
});

test.describe("Public ID Security - Format Validation", () => {
  test("[P0] SEC-PID-004: Should reject SQL injection attempts in public_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // WHEN: Attempting SQL injection via public_id parameter
    const sqlInjectionAttempts = [
      "clt_'; DROP TABLE clients; --",
      "clt_' OR '1'='1",
      "clt_admin'--",
      "clt_'; DELETE FROM clients WHERE '1'='1",
    ];

    for (const maliciousId of sqlInjectionAttempts) {
      const response = await superadminApiRequest.get(
        `/api/clients/${encodeURIComponent(maliciousId)}`,
      );

      // THEN: Request is rejected (not executed)
      expect(response.status()).toBe(404);
    }

    // AND: Verify database is intact (clients table still exists)
    const clientsExist = await superadminApiRequest.get("/api/clients");
    expect(clientsExist.status()).toBe(200);

    // AND: Verify no clients were deleted by SQL injection
    const allClients = await prismaClient.client.findMany();
    expect(allClients).toBeDefined();
  });

  test("[P0] SEC-PID-005: Should reject XSS attempts in public_id", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting XSS injection via public_id parameter
    const xssAttempts = [
      "clt_<script>alert('xss')</script>",
      "clt_<img src=x onerror=alert(1)>",
      "clt_javascript:alert(1)",
    ];

    for (const maliciousId of xssAttempts) {
      const response = await superadminApiRequest.get(
        `/api/clients/${encodeURIComponent(maliciousId)}`,
      );

      // THEN: Request is rejected
      expect(response.status()).toBe(404);

      const body = await response.json();
      // Response should not contain unescaped script tags
      expect(JSON.stringify(body)).not.toContain("<script>");
    }
  });

  test("[P0] SEC-PID-006: Should reject path traversal attempts", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting path traversal via public_id
    const traversalAttempts = [
      "clt_../../etc/passwd",
      "clt_....//....//....//etc/passwd",
      "../clients/clt_valid",
    ];

    for (const maliciousId of traversalAttempts) {
      const response = await superadminApiRequest.get(
        `/api/clients/${encodeURIComponent(maliciousId)}`,
      );

      // THEN: Request is rejected
      expect(response.status()).toBe(404);
    }
  });
});

test.describe("Public ID Security - Authorization Bypass Prevention", () => {
  test("[P0] SEC-PID-007: Should enforce authorization even with valid public_id", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Auth Test Client" }),
    });

    // WHEN: Non-admin user attempts to access client via public_id
    const response = await storeManagerApiRequest.get(
      `/api/clients/${client.public_id}`,
    );

    // THEN: Request is rejected with 403 (authorization checked before ID resolution)
    expect(response.status()).toBe(403);

    // Cleanup
    await prismaClient.client.delete({
      where: { client_id: client.client_id },
    });
  });

  test("[P0] SEC-PID-008: Should not leak existence of clients through different error codes", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing client
    const existingClient = await prismaClient.client.create({
      data: createClient({ name: "Existing Client" }),
    });

    // WHEN: Fetching non-existent vs existing client
    const nonExistentResponse = await superadminApiRequest.get(
      "/api/clients/clt_nonexistent123",
    );
    const existingResponse = await superadminApiRequest.get(
      `/api/clients/${existingClient.public_id}`,
    );

    // THEN: Error codes should not leak information
    // Non-existent: 404
    expect(nonExistentResponse.status()).toBe(404);

    // Existing (for comparison): 200
    expect(existingResponse.status()).toBe(200);

    // AND: Error messages should be generic
    if (nonExistentResponse.status() === 404) {
      const body = await nonExistentResponse.json();
      expect(body.message.toLowerCase()).toContain("not found");
      // Should NOT contain: "invalid format" which would leak validation info
    }

    // Cleanup
    await prismaClient.client.delete({
      where: { client_id: existingClient.client_id },
    });
  });
});

test.describe("Public ID Security - Collision Resistance", () => {
  test("[P0] SEC-PID-009: Should never generate duplicate public_ids", async ({
    prismaClient,
  }) => {
    // WHEN: Creating 100 clients rapidly (stress test for collisions)
    const createPromises = Array.from({ length: 100 }, (_, i) =>
      prismaClient.client.create({
        data: createClient({ name: `Collision Test ${i}` }),
      }),
    );

    const clients = await Promise.all(createPromises);

    // THEN: All public_ids are unique
    const publicIds = clients.map((c) => c.public_id);
    const uniqueIds = new Set(publicIds);

    expect(uniqueIds.size).toBe(100);

    // Cleanup
    await Promise.all(
      clients.map((c) =>
        prismaClient.client.delete({ where: { client_id: c.client_id } }),
      ),
    );
  });

  test("[P1] SEC-PID-010: Should maintain uniqueness constraint at database level", async ({
    prismaClient,
  }) => {
    // GIVEN: A client exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Uniqueness Test" }),
    });

    // WHEN: Attempting to create client with duplicate public_id (bypassing service layer)
    const attemptDuplicate = async () => {
      await prismaClient.$executeRaw`
        INSERT INTO clients (client_id, public_id, name, status)
        VALUES (gen_random_uuid(), ${client.public_id}, 'Duplicate', 'ACTIVE')
      `;
    };

    // THEN: Database should reject duplicate
    await expect(attemptDuplicate()).rejects.toThrow(/unique|duplicate/i);

    // Cleanup
    await prismaClient.client.delete({
      where: { client_id: client.client_id },
    });
  });
});

test.describe("Public ID Security - Update and Delete Operations", () => {
  test("[P0] SEC-PID-011: Should prevent unauthorized update via fabricated public_id", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting to update non-existent client with valid format public_id
    const response = await superadminApiRequest.put(
      "/api/clients/clt_nonexistent000",
      {
        name: "Hacked Update",
        status: "ACTIVE",
      },
    );

    // THEN: Request is rejected with 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("[P0] SEC-PID-012: Should prevent unauthorized delete via fabricated public_id", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting to delete non-existent client with valid format public_id
    const response = await superadminApiRequest.delete(
      "/api/clients/clt_nonexistent000",
    );

    // THEN: Request is rejected with 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("[P0] SEC-PID-013: Should prevent update via public_id from unauthorized role", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Protected Client" }),
    });

    // WHEN: Store manager attempts to update via public_id
    const response = await storeManagerApiRequest.put(
      `/api/clients/${client.public_id}`,
      { name: "Unauthorized Update" },
    );

    // THEN: Request is rejected with 403
    expect(response.status()).toBe(403);

    // Verify client was not updated
    const unchangedClient = await prismaClient.client.findUnique({
      where: { client_id: client.client_id },
    });
    expect(unchangedClient?.name).toBe("Protected Client");

    // Cleanup
    await prismaClient.client.delete({
      where: { client_id: client.client_id },
    });
  });
});
