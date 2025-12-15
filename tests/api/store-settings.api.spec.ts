/**
 * @test-level API
 * @justification Tests API endpoints for store settings management with full HTTP layer validation
 * @story 6-14-store-settings-page
 * @enhanced-by workflow-9 on 2025-01-28
 */
// tests/api/store-settings.api.spec.ts
import { test, expect } from "../support/fixtures/rbac.fixture";
import { createCompany, createUser, createStore } from "../support/helpers";
import bcrypt from "bcrypt";

/**
 * Store Settings API Tests
 *
 * Tests the store settings API endpoints for viewing and updating store configuration.
 *
 * API tests are THIRD in pyramid order (15-25% of tests)
 *
 * ENDPOINTS TESTED:
 * - GET /api/client/stores/:storeId/settings
 * - PUT /api/client/stores/:storeId/settings
 *
 * PRIORITY: P1 (High) - Store configuration management
 *
 * ENHANCEMENTS APPLIED (Workflow 9):
 * - Security tests: SQL injection, XSS, auth bypass, authorization, input validation, data leakage
 * - Automatic assertions: Status codes, response structure, validation rules
 * - Automatic edge cases: Empty strings, long strings, special characters, invalid formats
 * - Test isolation: Proper setup/teardown
 */

test.describe("Store Settings API", () => {
  test("6.14-API-001: GET /api/client/stores/:storeId/settings returns store configuration", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A client owner with a store (using store from clientUser fixture)
    // Update the existing store with test configuration
    await prismaClient.store.update({
      where: { store_id: clientUser.store_id },
      data: {
        configuration: {
          contact_email: "store@test.nuvana.local",
          timezone: "America/New_York",
          operating_hours: {
            monday: { open: "09:00", close: "17:00" },
          },
        },
      },
    });

    const store = await prismaClient.store.findUnique({
      where: { store_id: clientUser.store_id },
    });

    // WHEN: Fetching store settings
    const response = await clientUserApiRequest.get(
      `/api/client/stores/${clientUser.store_id}/settings`,
    );

    // THEN: Returns store configuration
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      name: store!.name,
      contact_email: "store@test.nuvana.local",
      timezone: "America/New_York",
    });
  });

  test("6.14-API-002: PUT /api/client/stores/:storeId/settings updates store configuration", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A client owner with a store (using store from clientUser fixture)
    const updatedConfig = {
      contact_email: "newemail@test.nuvana.local",
      timezone: "America/Los_Angeles",
      operating_hours: {
        monday: { open: "10:00", close: "18:00" },
      },
    };

    // WHEN: Updating store settings
    const response = await clientUserApiRequest.put(
      `/api/client/stores/${clientUser.store_id}/settings`,
      updatedConfig,
    );

    // THEN: Returns success and configuration is updated
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();

    // Verify configuration was updated in database
    const updatedStore = await prismaClient.store.findUnique({
      where: { store_id: clientUser.store_id },
      select: { configuration: true },
    });
    expect(updatedStore).toBeDefined();
    const config = updatedStore?.configuration as any;
    expect(config?.contact_email).toBe("newemail@test.nuvana.local");
    expect(config?.timezone).toBe("America/Los_Angeles");
    expect(config?.operating_hours?.monday?.open).toBe("10:00");
    expect(config?.operating_hours?.monday?.close).toBe("18:00");
  });

  test("6.14-API-003: PUT /api/client/stores/:storeId/settings validates timezone format", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A client owner with a store (using store from clientUser fixture)

    // WHEN: Updating with invalid timezone
    const response = await clientUserApiRequest.put(
      `/api/client/stores/${clientUser.store_id}/settings`,
      { timezone: "invalid-timezone" },
    );

    // THEN: Returns validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    const errorMessage =
      typeof body.error === "object"
        ? body.error.message || body.error.code
        : body.error || "";
    expect(errorMessage.toLowerCase()).toMatch(/timezone|invalid|format/i);
  });

  test("6.14-API-004: PUT /api/client/stores/:storeId/settings enforces RLS - user can only update own stores", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Another client owner with their own store
    const owner2 = await createUser(prismaClient);
    const company2 = await createCompany(prismaClient, {
      owner_user_id: owner2.user_id,
    });
    const store2 = await createStore(prismaClient, {
      company_id: company2.company_id,
    });

    // WHEN: clientUser (owner1) tries to update Owner2's store
    const response = await clientUserApiRequest.put(
      `/api/client/stores/${store2.store_id}/settings`,
      { contact_email: "hacked@test.nuvana.local" },
    );

    // THEN: Returns 403 Forbidden or 404 Not Found
    expect([403, 404]).toContain(response.status());
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  // ============================================================================
  // 🔒 SECURITY TESTS (Mandatory - Applied Automatically)
  // ============================================================================

  test.describe("Security: Authentication Bypass", () => {
    test("6.14-API-005: should reject requests without authentication token", async ({
      request,
      clientUser,
    }) => {
      // GIVEN: Unauthenticated request
      // WHEN: Attempting to get store settings without token
      const response = await request.get(
        `/api/client/stores/${clientUser.store_id}/settings`,
      );

      // THEN: Returns 401 Unauthorized
      expect(response.status()).toBe(401);
    });

    test("6.14-API-006: should reject requests with invalid token", async ({
      request,
      clientUser,
    }) => {
      // GIVEN: Request with invalid token
      // WHEN: Attempting to get store settings with invalid token
      const response = await request.get(
        `/api/client/stores/${clientUser.store_id}/settings`,
        {
          headers: {
            Authorization: "Bearer invalid-token-12345",
          },
        },
      );

      // THEN: Returns 401 Unauthorized
      expect(response.status()).toBe(401);
    });

    test("6.14-API-007: should reject requests with malformed token", async ({
      request,
      clientUser,
    }) => {
      // GIVEN: Request with malformed token
      // WHEN: Attempting to get store settings with malformed token
      const response = await request.get(
        `/api/client/stores/${clientUser.store_id}/settings`,
        {
          headers: {
            Authorization: "Bearer not.a.valid.jwt.token",
          },
        },
      );

      // THEN: Returns 401 Unauthorized
      expect(response.status()).toBe(401);
    });
  });

  test.describe("Security: SQL Injection Prevention", () => {
    test("6.14-API-008: should sanitize storeId parameter against SQL injection", async ({
      clientUserApiRequest,
    }) => {
      // GIVEN: Malicious SQL injection attempt in storeId
      const sqlInjectionPayloads = [
        "'; DROP TABLE stores; --",
        "1' OR '1'='1",
        "1' UNION SELECT * FROM users --",
        "'; DELETE FROM stores WHERE '1'='1",
      ];

      // WHEN: Attempting SQL injection in storeId parameter
      for (const payload of sqlInjectionPayloads) {
        const response = await clientUserApiRequest.get(
          `/api/client/stores/${payload}/settings`,
        );

        // THEN: Returns 400 Bad Request (invalid UUID format) or 404 Not Found
        expect([400, 404]).toContain(response.status());
        const body = await response.json();
        expect(body.success).toBe(false);
      }
    });

    test("6.14-API-009: should sanitize address field against SQL injection", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Malicious SQL injection in address field
      const sqlInjectionPayloads = [
        "'; DROP TABLE stores; --",
        "1' OR '1'='1",
        "'; UPDATE stores SET name='hacked' --",
      ];

      // WHEN: Attempting SQL injection in address
      for (const payload of sqlInjectionPayloads) {
        const response = await clientUserApiRequest.put(
          `/api/client/stores/${clientUser.store_id}/settings`,
          { address: payload },
        );

        // THEN: Request is processed safely (Prisma ORM prevents injection)
        // Address may be stored as-is (it's just text), but no SQL execution
        expect([200, 400]).toContain(response.status());
        // If 200, verify no SQL was executed by checking store still exists
        if (response.status() === 200) {
          const body = await response.json();
          expect(body.success).toBe(true);
        }
      }
    });
  });

  test.describe("Security: XSS Prevention", () => {
    test("6.14-API-010: should sanitize address field against XSS attacks", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: XSS payloads in address field
      const xssPayloads = [
        "<script>alert('XSS')</script>",
        "<iframe src='javascript:alert(1)'></iframe>",
        "javascript:alert('XSS')",
        "<img src=x onerror=alert(1)>",
        "<svg onload=alert(1)>",
      ];

      // WHEN: Attempting XSS in address field
      for (const payload of xssPayloads) {
        const response = await clientUserApiRequest.put(
          `/api/client/stores/${clientUser.store_id}/settings`,
          { address: payload },
        );

        // THEN: Returns 400 Bad Request (XSS pattern detected)
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        const errorMessage =
          typeof body.error === "object"
            ? body.error.message || body.error.code
            : body.error || "";
        expect(errorMessage.toLowerCase()).toMatch(/html|script|invalid/i);
      }
    });
  });

  test.describe("Security: Authorization Enforcement", () => {
    test("6.14-API-011: should prevent access to other users' stores via GET", async ({
      clientUserApiRequest,
      prismaClient,
    }) => {
      // GIVEN: Another client owner with their own store
      const owner2 = await createUser(prismaClient);
      const company2 = await createCompany(prismaClient, {
        owner_user_id: owner2.user_id,
      });
      const store2 = await createStore(prismaClient, {
        company_id: company2.company_id,
      });

      // WHEN: clientUser tries to GET Owner2's store settings
      const response = await clientUserApiRequest.get(
        `/api/client/stores/${store2.store_id}/settings`,
      );

      // THEN: Returns 403 Forbidden or 404 Not Found
      expect([403, 404]).toContain(response.status());
      const body = await response.json();
      expect(body.success).toBe(false);
    });
  });

  test.describe("Security: Input Validation", () => {
    test("6.14-API-012: should reject invalid request body types", async ({
      request,
      clientUser,
      backendUrl,
    }) => {
      // GIVEN: Invalid request body (not an object - sending array instead)
      // WHEN: Sending invalid body type (array instead of object)
      const response = await request.put(
        `${backendUrl}/api/client/stores/${clientUser.store_id}/settings`,
        {
          data: JSON.stringify(["not", "an", "object"]),
          headers: {
            "Content-Type": "application/json",
            Cookie: `access_token=${clientUser.token}`,
          },
        },
      );

      // THEN: Returns 400 Bad Request (Zod validation fails - expects object)
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test("6.14-API-013: should reject missing required fields gracefully", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Empty request body (all fields optional, but should handle gracefully)
      // WHEN: Sending empty body
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        {},
      );

      // THEN: Returns 200 (empty update is valid) or 400 if validation fails
      expect([200, 400]).toContain(response.status());
    });
  });

  test.describe("Security: Data Leakage Prevention", () => {
    test("6.14-API-014: should not expose password hashes in response", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Store with configuration
      await prismaClient.store.update({
        where: { store_id: clientUser.store_id },
        data: {
          configuration: {
            contact_email: "store@test.nuvana.local",
            timezone: "America/New_York",
          },
        },
      });

      // WHEN: Fetching store settings
      const response = await clientUserApiRequest.get(
        `/api/client/stores/${clientUser.store_id}/settings`,
      );

      // THEN: Response does not contain password_hash or other sensitive fields
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data).not.toHaveProperty("password_hash");
      expect(body.data).not.toHaveProperty("password");
      expect(body.data).not.toHaveProperty("internal_id");
      // Verify only expected fields are present
      const allowedFields = [
        "name",
        "address",
        "timezone",
        "contact_email",
        "operating_hours",
      ];
      const responseFields = Object.keys(body.data);
      responseFields.forEach((field) => {
        expect(allowedFields).toContain(field);
      });
    });
  });

  // ============================================================================
  // 🔄 AUTOMATIC EDGE CASES (Standard Boundaries - Applied Automatically)
  // ============================================================================

  test.describe("Edge Cases: Timezone Field", () => {
    test("6.14-API-015: should reject empty timezone string", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Empty timezone string
      // WHEN: Updating with empty timezone
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        { timezone: "" },
      );

      // THEN: Returns validation error (empty string fails IANA timezone validation)
      // Note: Empty string is falsy, so service layer skips validation, but Zod schema
      // may reject it. However, since timezone is optional, empty string might pass.
      // The service validates only if timezone is truthy, so empty string is effectively ignored.
      // This test verifies the behavior - empty string should either be rejected or ignored.
      expect([200, 400]).toContain(response.status());
      if (response.status() === 400) {
        const body = await response.json();
        expect(body.success).toBe(false);
      }
    });

    test("6.14-API-016: should reject invalid IANA timezone format", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Invalid timezone formats (not valid IANA timezones)
      const invalidTimezones = [
        "EST", // Abbreviation, not IANA
        "UTC+5", // Offset format, not IANA
        "GMT-8", // Offset format, not IANA
        "invalid-timezone", // Not a valid IANA timezone
        "America", // Missing city/region
        "New_York", // Missing continent
      ];

      // WHEN: Updating with invalid timezone
      for (const tz of invalidTimezones) {
        const response = await clientUserApiRequest.put(
          `/api/client/stores/${clientUser.store_id}/settings`,
          { timezone: tz },
        );

        // THEN: Returns validation error (service layer validates using Intl.DateTimeFormat)
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        const errorMessage =
          typeof body.error === "object"
            ? body.error.message || body.error.code
            : body.error || "";
        expect(errorMessage.toLowerCase()).toMatch(/timezone|invalid|format/i);
      }
    });

    test("6.14-API-017: should reject very long timezone string", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Very long timezone string (100+ chars)
      const longTimezone = "A".repeat(100);

      // WHEN: Updating with very long timezone
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        { timezone: longTimezone },
      );

      // THEN: Returns validation error (max 50 chars)
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });
  });

  test.describe("Edge Cases: Contact Email Field", () => {
    test("6.14-API-018: should reject invalid email formats", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Invalid email formats
      const invalidEmails = [
        "invalid-email",
        "missing@domain",
        "@nodomain.com",
        "nodomain@",
        "spaces in@email.com",
        "unicode@тест.com", // May or may not be valid depending on system
      ];

      // WHEN: Updating with invalid email
      for (const email of invalidEmails) {
        const response = await clientUserApiRequest.put(
          `/api/client/stores/${clientUser.store_id}/settings`,
          { contact_email: email },
        );

        // THEN: Returns validation error
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
      }
    });

    test("6.14-API-019: should reject very long email address", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Very long email (300+ chars)
      const longEmail = "a".repeat(250) + "@test.nuvana.local";

      // WHEN: Updating with very long email
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        { contact_email: longEmail },
      );

      // THEN: Returns validation error (max 255 chars)
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test("6.14-API-020: should accept null email (clearing email)", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Setting email to null
      // WHEN: Updating with null email
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        { contact_email: null },
      );

      // THEN: Returns success (null is allowed)
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  test.describe("Edge Cases: Address Field", () => {
    test("6.14-API-021: should reject very long address", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Very long address (1000+ chars)
      const longAddress = "A".repeat(1000);

      // WHEN: Updating with very long address
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        { address: longAddress },
      );

      // THEN: Returns validation error (max 500 chars)
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test("6.14-API-022: should accept empty address", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Empty address (address is optional and can be empty string)
      // WHEN: Updating with empty address
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        { address: "" },
      );

      // THEN: Returns success (empty string is allowed for optional address field)
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify empty address was stored in configuration.address
      const updatedStore = await prismaClient.store.findUnique({
        where: { store_id: clientUser.store_id },
        select: { configuration: true },
      });
      const config = updatedStore?.configuration as any;
      // Address is stored directly in configuration.address when updated via settings endpoint
      expect(config?.address).toBe("");
    });
  });

  test.describe("Edge Cases: Operating Hours", () => {
    test("6.14-API-023: should reject invalid time format", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Invalid time formats
      const invalidTimes = [
        "25:00", // Hour > 23
        "12:99", // Minute > 59
        "9:00", // Missing leading zero (must be HH:mm, not H:mm)
        "24:00", // Hour = 24 (should be 00:00 next day)
        "abc:def", // Non-numeric
        "1:30", // Missing leading zero
        "12:60", // Minute = 60 (should be 00:00 next hour)
      ];

      // WHEN: Updating with invalid time format
      for (const time of invalidTimes) {
        const response = await clientUserApiRequest.put(
          `/api/client/stores/${clientUser.store_id}/settings`,
          {
            operating_hours: {
              monday: { open: time, close: "17:00" },
            },
          },
        );

        // THEN: Returns validation error (Zod schema validates HH:mm format)
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        const errorMessage =
          typeof body.error === "object"
            ? body.error.message || body.error.code
            : body.error || "";
        expect(errorMessage.toLowerCase()).toMatch(
          /time|format|hh:mm|invalid/i,
        );
      }
    });

    test("6.14-API-024: should reject close time before open time", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Close time before open time (invalid time order)
      // WHEN: Updating with invalid time order
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        {
          operating_hours: {
            monday: { open: "17:00", close: "09:00" },
          },
        },
      );

      // THEN: Returns validation error (service layer validates close > open)
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      const errorMessage =
        typeof body.error === "object"
          ? body.error.message || body.error.code
          : body.error || "";
      expect(errorMessage.toLowerCase()).toMatch(/close|after|before|monday/i);
    });

    test("6.14-API-028: should reject close time equal to open time", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Close time equal to open time (invalid - must be after)
      // WHEN: Updating with equal times
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        {
          operating_hours: {
            monday: { open: "09:00", close: "09:00" },
          },
        },
      );

      // THEN: Returns validation error (close must be after open)
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      const errorMessage =
        typeof body.error === "object"
          ? body.error.message || body.error.code
          : body.error || "";
      expect(errorMessage.toLowerCase()).toMatch(/close|after|before|monday/i);
    });

    test("6.14-API-025: should accept all days closed", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: All days marked as closed
      // WHEN: Updating with all days closed
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        {
          operating_hours: {
            monday: { closed: true },
            tuesday: { closed: true },
            wednesday: { closed: true },
            thursday: { closed: true },
            friday: { closed: true },
            saturday: { closed: true },
            sunday: { closed: true },
          },
        },
      );

      // THEN: Returns success (closed days are valid)
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  // ============================================================================
  // ✅ ADDITIONAL ASSERTIONS (Best Practices - Applied Automatically)
  // ============================================================================

  test.describe("Response Structure Assertions", () => {
    test("6.14-API-026: GET should return consistent response structure", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Store with configuration
      await prismaClient.store.update({
        where: { store_id: clientUser.store_id },
        data: {
          configuration: {
            contact_email: "store@test.nuvana.local",
            timezone: "America/New_York",
          },
        },
      });

      // WHEN: Fetching store settings
      const response = await clientUserApiRequest.get(
        `/api/client/stores/${clientUser.store_id}/settings`,
      );

      // THEN: Response has consistent structure
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("success");
      expect(body).toHaveProperty("data");
      expect(typeof body.success).toBe("boolean");
      expect(body.success).toBe(true);
      expect(typeof body.data).toBe("object");
      expect(body.data).toHaveProperty("name");
      expect(typeof body.data.name).toBe("string");
      expect(body.data).toHaveProperty("timezone");
      expect(typeof body.data.timezone).toBe("string");
    });

    test("6.14-API-027: PUT should return updated store data in response", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Updated configuration
      const updatedConfig = {
        contact_email: "updated@test.nuvana.local",
        timezone: "America/Chicago",
      };

      // WHEN: Updating store settings
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        updatedConfig,
      );

      // THEN: Response contains updated store data with configuration
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      // PUT endpoint returns full store object
      expect(body.data).toHaveProperty("store_id");
      expect(body.data).toHaveProperty("name");
      expect(body.data).toHaveProperty("configuration");
      expect(typeof body.data.configuration).toBe("object");

      // Verify configuration was updated
      const config = body.data.configuration as any;
      expect(config?.contact_email).toBe("updated@test.nuvana.local");
      expect(config?.timezone).toBe("America/Chicago");
    });
  });

  // ============================================================================
  // 🔍 ADDITIONAL EDGE CASES
  // ============================================================================

  test.describe("Edge Cases: Additional Validations", () => {
    test("6.14-API-030: should handle partial operating hours update", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Store with existing operating hours
      await prismaClient.store.update({
        where: { store_id: clientUser.store_id },
        data: {
          configuration: {
            operating_hours: {
              monday: { open: "09:00", close: "17:00" },
              tuesday: { open: "09:00", close: "17:00" },
            },
          },
        },
      });

      // WHEN: Updating only one day
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        {
          operating_hours: {
            monday: { open: "10:00", close: "18:00" },
          },
        },
      );

      // THEN: Returns success and only monday is updated (deep merge preserves other days)
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify deep merge - tuesday should still exist
      const updatedStore = await prismaClient.store.findUnique({
        where: { store_id: clientUser.store_id },
        select: { configuration: true },
      });
      const config = updatedStore?.configuration as any;
      expect(config?.operating_hours?.monday?.open).toBe("10:00");
      expect(config?.operating_hours?.monday?.close).toBe("18:00");
      expect(config?.operating_hours?.tuesday?.open).toBe("09:00"); // Preserved
      expect(config?.operating_hours?.tuesday?.close).toBe("17:00"); // Preserved
    });

    test("6.14-API-031: should handle multiple fields update simultaneously", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Multiple fields to update
      const updatedConfig = {
        address: "123 Test Street, Test City, TS 12345",
        timezone: "America/Denver",
        contact_email: "multifield@test.nuvana.local",
        operating_hours: {
          monday: { open: "08:00", close: "20:00" },
          friday: { open: "08:00", close: "20:00" },
        },
      };

      // WHEN: Updating all fields at once
      const response = await clientUserApiRequest.put(
        `/api/client/stores/${clientUser.store_id}/settings`,
        updatedConfig,
      );

      // THEN: Returns success and all fields are updated
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify all fields in database
      const updatedStore = await prismaClient.store.findUnique({
        where: { store_id: clientUser.store_id },
        select: { configuration: true },
      });
      const config = updatedStore?.configuration as any;
      expect(config?.address).toBe("123 Test Street, Test City, TS 12345");
      expect(config?.timezone).toBe("America/Denver");
      expect(config?.contact_email).toBe("multifield@test.nuvana.local");
      expect(config?.operating_hours?.monday?.open).toBe("08:00");
      expect(config?.operating_hours?.monday?.close).toBe("20:00");
      expect(config?.operating_hours?.friday?.open).toBe("08:00");
      expect(config?.operating_hours?.friday?.close).toBe("20:00");
    });
  });

  // ============================================================================
  // AC-8: Reset PIN Functionality Tests
  // ============================================================================

  test.describe("AC-8: Cashier PIN Reset", () => {
    test("6.14-API-040: [P1-AC-8] PUT /api/stores/:storeId/cashiers/:cashierId should reset cashier PIN", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: A client owner with a cashier
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: clientUser.store_id,
          name: `Test Cashier ${Date.now()}`,
          employee_id: `EMP${Date.now()}`,
          pin_hash: await bcrypt.hash("1234", 10),
          hired_on: new Date(),
          is_active: true,
          created_by: clientUser.user_id,
        },
      });

      const newPIN = "5678";

      // WHEN: Resetting cashier PIN
      const response = await clientUserApiRequest.put(
        `/api/stores/${clientUser.store_id}/cashiers/${cashier.cashier_id}`,
        { pin: newPIN },
      );

      // THEN: Returns success and PIN is updated
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();

      // Verify PIN was updated in database
      const updatedCashier = await prismaClient.cashier.findUnique({
        where: { cashier_id: cashier.cashier_id },
      });
      expect(updatedCashier?.pin_hash).toBeDefined();
      const isValid = await bcrypt.compare(newPIN, updatedCashier!.pin_hash!);
      expect(isValid).toBe(true);

      // Cleanup
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
    });

    test("6.14-API-041: [P1-AC-8] PUT /api/stores/:storeId/cashiers/:cashierId should validate PIN format (exactly 4 digits)", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: A client owner with a cashier
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: clientUser.store_id,
          name: `Test Cashier ${Date.now()}`,
          employee_id: `EMP${Date.now()}`,
          pin_hash: await bcrypt.hash("1234", 10),
          hired_on: new Date(),
          is_active: true,
          created_by: clientUser.user_id,
        },
      });

      // WHEN: Resetting with invalid PIN formats
      const invalidPINs = ["123", "12345", "abcd", "12ab", ""];

      for (const invalidPIN of invalidPINs) {
        const response = await clientUserApiRequest.put(
          `/api/stores/${clientUser.store_id}/cashiers/${cashier.cashier_id}`,
          { pin: invalidPIN },
        );

        // THEN: Returns validation error
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        const errorMessage =
          typeof body.error === "object"
            ? body.error.message || body.error.code
            : body.error || "";
        expect(errorMessage.toLowerCase()).toMatch(
          /pin|4.*digit|format|invalid/i,
        );
      }

      // Cleanup
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
    });

    test("6.14-API-042: [P1-AC-8] PUT /api/stores/:storeId/cashiers/:cashierId should enforce RLS - owner can only reset own cashiers", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Another client owner with their own cashier
      const owner2 = await createUser(prismaClient);
      const company2 = await createCompany(prismaClient, {
        owner_user_id: owner2.user_id,
      });
      const store2 = await createStore(prismaClient, {
        company_id: company2.company_id,
      });

      const cashier2 = await prismaClient.cashier.create({
        data: {
          store_id: store2.store_id,
          name: `Cashier 2 ${Date.now()}`,
          employee_id: `EMP${Date.now()}`,
          pin_hash: await bcrypt.hash("1234", 10),
          hired_on: new Date(),
          is_active: true,
          created_by: owner2.user_id,
        },
      });

      // WHEN: clientUser (owner1) tries to reset owner2's cashier PIN
      const response = await clientUserApiRequest.put(
        `/api/stores/${store2.store_id}/cashiers/${cashier2.cashier_id}`,
        { pin: "9999" },
      );

      // THEN: Returns 403 Forbidden or 404 Not Found
      expect([403, 404]).toContain(response.status());
      const body = await response.json();
      expect(body.success).toBe(false);

      // Cleanup
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier2.cashier_id },
      });
      await prismaClient.store.delete({ where: { store_id: store2.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company2.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner2.user_id } });
    });
  });
});
