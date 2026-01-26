import { test, expect } from "../support/fixtures/rbac.fixture";
import { createStore, createCompany, createUser } from "../support/helpers";

/**
 * Store POS Configuration Read API Tests
 *
 * @test-level API
 * @justification API-level integration tests for store POS configuration retrieval via GET /api/stores/:storeId
 * @story store-pos-config-read
 * @created 2026-01-26
 * @priority P0 (Critical)
 *
 * BUSINESS CONTEXT:
 * This test suite validates that GET /api/stores/:storeId returns POS configuration fields
 * (pos_type, pos_connection_type, pos_connection_config). A bug was discovered where these
 * fields were missing from the response schema, causing the frontend to display incorrect
 * default values ("MANUAL_ENTRY") even after saving different POS configurations.
 *
 * ROOT CAUSE FIXED:
 * The Fastify response schema for GET /api/stores/:storeId was missing POS fields.
 * Fastify serializes responses according to the schema, stripping any fields not defined.
 * This caused POS configuration to be silently dropped from GET responses.
 *
 * BUSINESS RULES TESTED:
 * - BR-POSREAD-001: GET /api/stores/:storeId returns pos_type field
 * - BR-POSREAD-002: GET /api/stores/:storeId returns pos_connection_type field
 * - BR-POSREAD-003: GET /api/stores/:storeId returns pos_connection_config field
 * - BR-POSREAD-004: pos_type values match strict enum allowlist
 * - BR-POSREAD-005: pos_connection_type values match strict enum allowlist
 * - BR-POSREAD-006: Round-trip: PUT then GET returns identical POS configuration
 * - BR-POSREAD-007: Default values (MANUAL_ENTRY/MANUAL) returned for new stores
 * - BR-POSREAD-008: Null pos_connection_config correctly serialized
 * - BR-POSREAD-009: Company isolation enforced for POS config reads
 *
 * SECURITY FOCUS:
 * - API-008: OUTPUT_FILTERING - Response schema whitelist must include POS fields
 * - DB-006: TENANT_ISOLATION - Company scoping enforced for read access
 * - API-004: AUTHENTICATION - JWT required for store access
 *
 * TRACEABILITY:
 * - Fix: backend/src/routes/store.ts lines 1229-1259 (added POS fields to GET response schema)
 * - Frontend: src/components/stores/EditStoreModal.tsx lines 324-332 (loads POS from store object)
 * - Database: backend/prisma/schema.prisma lines 227, 235, 254 (POS field definitions)
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on API contract validation and response correctness
 * - Verify both happy path and edge cases
 * - Ensure round-trip consistency (PUT then GET)
 */

test.describe("Store POS Configuration Read API", () => {
  // =============================================================================
  // HAPPY PATH: POS Fields Included in GET Response
  // =============================================================================

  test.describe("POS Fields in GET Response", () => {
    /**
     * BR-POSREAD-001, BR-POSREAD-002, BR-POSREAD-003: All POS fields returned
     * This is the PRIMARY test case that validates the bug fix
     */
    test("POSREAD-API-001: [P0] GET /api/stores/:storeId returns all POS configuration fields", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store with configured POS settings
      const company = await createCompany(prismaClient, {
        name: "POS Read Test Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "POS Read Test Store",
        status: "ACTIVE",
        pos_type: "GILBARCO_NAXML",
        pos_connection_type: "FILE",
        pos_connection_config: {
          import_path: "c:\\XMLGateway",
          poll_interval_seconds: 60,
        },
      });

      // WHEN: Fetching the store via GET endpoint
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );

      // THEN: Request succeeds
      expect(response.status()).toBe(200);

      const body = await response.json();

      // AND: Response includes pos_type (BR-POSREAD-001)
      expect(body).toHaveProperty("pos_type");
      expect(body.pos_type).toBe("GILBARCO_NAXML");

      // AND: Response includes pos_connection_type (BR-POSREAD-002)
      expect(body).toHaveProperty("pos_connection_type");
      expect(body.pos_connection_type).toBe("FILE");

      // AND: Response includes pos_connection_config (BR-POSREAD-003)
      expect(body).toHaveProperty("pos_connection_config");
      expect(body.pos_connection_config).toMatchObject({
        import_path: "c:\\XMLGateway",
        poll_interval_seconds: 60,
      });
    });

    /**
     * BR-POSREAD-007: Default values returned for new stores
     */
    test("POSREAD-API-002: [P0] GET /api/stores/:storeId returns default POS values for new store", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A newly created store (no POS config explicitly set)
      const company = await createCompany(prismaClient, {
        name: "Default POS Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Default POS Store",
        status: "ACTIVE",
        // No pos_type, pos_connection_type, pos_connection_config set
      });

      // WHEN: Fetching the store
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );

      // THEN: Request succeeds
      expect(response.status()).toBe(200);

      const body = await response.json();

      // AND: Default pos_type is MANUAL_ENTRY
      expect(body.pos_type).toBe("MANUAL_ENTRY");

      // AND: Default pos_connection_type is MANUAL
      expect(body.pos_connection_type).toBe("MANUAL");

      // AND: Default pos_connection_config is null
      expect(body.pos_connection_config).toBeNull();
    });

    /**
     * BR-POSREAD-008: Null config correctly serialized
     */
    test("POSREAD-API-003: [P0] GET /api/stores/:storeId returns null for empty pos_connection_config", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store with MANUAL configuration (no connection config needed)
      const company = await createCompany(prismaClient, {
        name: "Null Config Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Null Config Store",
        status: "ACTIVE",
        pos_type: "MANUAL_ENTRY",
        pos_connection_type: "MANUAL",
      });

      // WHEN: Fetching the store
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );

      // THEN: Request succeeds
      expect(response.status()).toBe(200);

      const body = await response.json();

      // AND: pos_connection_config is explicitly null (not undefined or missing)
      expect(body).toHaveProperty("pos_connection_config");
      expect(body.pos_connection_config).toBeNull();
    });
  });

  // =============================================================================
  // ROUND-TRIP: PUT then GET Consistency
  // =============================================================================

  test.describe("Round-Trip Consistency", () => {
    /**
     * BR-POSREAD-006: Round-trip consistency
     * Critical: This is the exact user workflow that was broken
     */
    test("POSREAD-API-010: [P0] Round-trip: PUT then GET returns identical POS configuration", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store with default POS config
      const company = await createCompany(prismaClient, {
        name: "Round-Trip Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Round-Trip Store",
        status: "ACTIVE",
      });

      // Verify initial default state
      const initialResponse = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );
      expect(initialResponse.status()).toBe(200);
      const initialBody = await initialResponse.json();
      expect(initialBody.pos_type).toBe("MANUAL_ENTRY");

      // WHEN: Updating POS configuration via PUT
      const putResponse = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        {
          pos_type: "GILBARCO_NAXML",
          pos_connection_type: "FILE",
          pos_connection_config: {
            import_path: "c:\\XMLGateway_new",
            poll_interval_seconds: 120,
            file_pattern: "*.xml",
          },
        },
      );

      expect(putResponse.status()).toBe(200);
      const putBody = await putResponse.json();

      // AND: Then fetching via GET
      const getResponse = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );

      // THEN: GET response matches PUT response exactly
      expect(getResponse.status()).toBe(200);
      const getBody = await getResponse.json();

      expect(getBody.pos_type).toBe(putBody.pos_type);
      expect(getBody.pos_type).toBe("GILBARCO_NAXML");

      expect(getBody.pos_connection_type).toBe(putBody.pos_connection_type);
      expect(getBody.pos_connection_type).toBe("FILE");

      expect(getBody.pos_connection_config).toMatchObject(
        putBody.pos_connection_config,
      );
      expect(getBody.pos_connection_config).toMatchObject({
        import_path: "c:\\XMLGateway_new",
        poll_interval_seconds: 120,
        file_pattern: "*.xml",
      });
    });

    /**
     * Round-trip with API-based POS type
     */
    test("POSREAD-API-011: [P0] Round-trip: PUT then GET returns Square REST configuration", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store
      const company = await createCompany(prismaClient, {
        name: "Square REST Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Square REST Store",
        status: "ACTIVE",
      });

      // WHEN: Setting Square REST configuration
      const config = {
        pos_type: "SQUARE_REST",
        pos_connection_type: "API",
        pos_connection_config: {
          base_url: "https://connect.squareup.com",
          api_key: "sq0-test-key-12345",
          location_id: "LOC-123",
        },
      };

      await superadminApiRequest.put(`/api/stores/${store.store_id}`, config);

      // THEN: GET returns the same configuration
      const getResponse = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );

      expect(getResponse.status()).toBe(200);
      const body = await getResponse.json();

      expect(body.pos_type).toBe("SQUARE_REST");
      expect(body.pos_connection_type).toBe("API");
      expect(body.pos_connection_config).toMatchObject({
        base_url: "https://connect.squareup.com",
        api_key: "sq0-test-key-12345",
        location_id: "LOC-123",
      });
    });

    /**
     * Round-trip: Change POS type and verify GET reflects change
     */
    test("POSREAD-API-012: [P0] Round-trip: Changing POS type from FILE to API is reflected in GET", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store with FILE-based POS
      const company = await createCompany(prismaClient, {
        name: "POS Change Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "POS Change Store",
        status: "ACTIVE",
        pos_type: "GILBARCO_NAXML",
        pos_connection_type: "FILE",
        pos_connection_config: { import_path: "c:\\old_path" },
      });

      // Verify initial state
      const initialGet = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );
      expect((await initialGet.json()).pos_type).toBe("GILBARCO_NAXML");

      // WHEN: Changing to API-based POS
      await superadminApiRequest.put(`/api/stores/${store.store_id}`, {
        pos_type: "CLOVER_REST",
        pos_connection_type: "API",
        pos_connection_config: {
          base_url: "https://api.clover.com",
          merchant_id: "MID-456",
        },
      });

      // THEN: GET returns the new configuration
      const getResponse = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );
      const body = await getResponse.json();

      expect(body.pos_type).toBe("CLOVER_REST");
      expect(body.pos_connection_type).toBe("API");
      expect(body.pos_connection_config).toMatchObject({
        base_url: "https://api.clover.com",
        merchant_id: "MID-456",
      });
    });

    /**
     * Round-trip: Clearing POS config (back to MANUAL)
     */
    test("POSREAD-API-013: [P0] Round-trip: Clearing POS config (to MANUAL) is reflected in GET", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store with configured POS
      const company = await createCompany(prismaClient, {
        name: "Clear Config Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Clear Config Store",
        status: "ACTIVE",
        pos_type: "GILBARCO_NAXML",
        pos_connection_type: "FILE",
        pos_connection_config: { import_path: "c:\\path_to_clear" },
      });

      // WHEN: Clearing to MANUAL configuration
      await superadminApiRequest.put(`/api/stores/${store.store_id}`, {
        pos_type: "MANUAL_ENTRY",
        pos_connection_type: "MANUAL",
        pos_connection_config: null,
      });

      // THEN: GET returns MANUAL configuration
      const getResponse = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );
      const body = await getResponse.json();

      expect(body.pos_type).toBe("MANUAL_ENTRY");
      expect(body.pos_connection_type).toBe("MANUAL");
      expect(body.pos_connection_config).toBeNull();
    });
  });

  // =============================================================================
  // ENUM VALIDATION: Valid POS Types and Connection Types
  // =============================================================================

  test.describe("Enum Value Validation", () => {
    /**
     * BR-POSREAD-004: All valid pos_type values can be read
     */
    test("POSREAD-API-020: [P1] GET /api/stores/:storeId returns all valid pos_type values correctly", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      const validPosTypes = [
        "GILBARCO_PASSPORT",
        "GILBARCO_NAXML",
        "GILBARCO_COMMANDER",
        "VERIFONE_RUBY2",
        "VERIFONE_COMMANDER",
        "VERIFONE_SAPPHIRE",
        "CLOVER_REST",
        "ORACLE_SIMPHONY",
        "NCR_ALOHA",
        "LIGHTSPEED_REST",
        "SQUARE_REST",
        "TOAST_REST",
        "GENERIC_XML",
        "GENERIC_REST",
        "MANUAL_ENTRY",
      ] as const;

      const company = await createCompany(prismaClient, {
        name: "All POS Types Read Company",
        owner_user_id: superadminUser.user_id,
      });

      for (const posType of validPosTypes) {
        const store = await createStore(prismaClient, {
          company_id: company.company_id,
          name: `Store for ${posType}`,
          status: "ACTIVE",
          pos_type: posType,
        });

        const response = await superadminApiRequest.get(
          `/api/stores/${store.store_id}`,
        );

        expect(
          response.status(),
          `Expected 200 for reading pos_type=${posType}`,
        ).toBe(200);

        const body = await response.json();
        expect(body.pos_type, `pos_type should be ${posType}`).toBe(posType);
      }
    });

    /**
     * BR-POSREAD-005: All valid pos_connection_type values can be read
     */
    test("POSREAD-API-021: [P1] GET /api/stores/:storeId returns all valid pos_connection_type values correctly", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      const validConnectionTypes = [
        "NETWORK",
        "API",
        "WEBHOOK",
        "FILE",
        "MANUAL",
      ] as const;

      const company = await createCompany(prismaClient, {
        name: "All Conn Types Read Company",
        owner_user_id: superadminUser.user_id,
      });

      for (const connType of validConnectionTypes) {
        const store = await createStore(prismaClient, {
          company_id: company.company_id,
          name: `Store for ${connType}`,
          status: "ACTIVE",
          pos_connection_type: connType,
        });

        const response = await superadminApiRequest.get(
          `/api/stores/${store.store_id}`,
        );

        expect(
          response.status(),
          `Expected 200 for reading pos_connection_type=${connType}`,
        ).toBe(200);

        const body = await response.json();
        expect(
          body.pos_connection_type,
          `pos_connection_type should be ${connType}`,
        ).toBe(connType);
      }
    });
  });

  // =============================================================================
  // SECURITY: Company Isolation
  // =============================================================================

  test.describe("Security - Company Isolation", () => {
    /**
     * BR-POSREAD-009: Company isolation enforced for POS config reads
     * DB-006: TENANT_ISOLATION
     */
    test("POSREAD-API-030: [P0-SEC] Corporate admin cannot read POS config from other company's store", async ({
      corporateAdminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A store from a different company
      const otherOwner = await createUser(prismaClient);
      const otherCompany = await createCompany(prismaClient, {
        name: "Other Company",
        owner_user_id: otherOwner.user_id,
      });
      const otherStore = await createStore(prismaClient, {
        company_id: otherCompany.company_id,
        name: "Other Company Store",
        status: "ACTIVE",
        pos_type: "GILBARCO_NAXML",
        pos_connection_type: "FILE",
        pos_connection_config: { import_path: "c:\\sensitive_path" },
      });

      // WHEN: Corporate admin tries to read store from other company
      const response = await corporateAdminApiRequest.get(
        `/api/stores/${otherStore.store_id}`,
      );

      // THEN: Request is rejected with 403
      expect(response.status()).toBe(403);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
    });

    /**
     * System admin CAN read any store's POS config
     */
    test("POSREAD-API-031: [P0] System admin can read POS config for any company's store", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A store from any company
      const owner = await createUser(prismaClient);
      const company = await createCompany(prismaClient, {
        name: "Any Company for Read",
        owner_user_id: owner.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Any Company Store",
        status: "ACTIVE",
        pos_type: "TOAST_REST",
        pos_connection_type: "API",
        pos_connection_config: {
          restaurant_guid: "REST-GUID-789",
          api_key: "toast-key-abc",
        },
      });

      // WHEN: System admin reads the store
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );

      // THEN: Request succeeds and includes POS config
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.pos_type).toBe("TOAST_REST");
      expect(body.pos_connection_type).toBe("API");
      expect(body.pos_connection_config).toMatchObject({
        restaurant_guid: "REST-GUID-789",
        api_key: "toast-key-abc",
      });
    });
  });

  // =============================================================================
  // AUTHORIZATION: Permission Enforcement
  // =============================================================================

  test.describe("Authorization - Permission Enforcement", () => {
    /**
     * Unauthenticated request rejected
     */
    test("POSREAD-API-040: [P0-SEC] GET /api/stores/:storeId requires authentication", async ({
      request,
      prismaClient,
    }) => {
      // GIVEN: A store
      const owner = await createUser(prismaClient);
      const company = await createCompany(prismaClient, {
        name: "Auth Test Company",
        owner_user_id: owner.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Auth Test Store",
        status: "ACTIVE",
        pos_type: "GILBARCO_NAXML",
      });

      // WHEN: Making unauthenticated request
      const response = await request.get(
        `http://localhost:3001/api/stores/${store.store_id}`,
      );

      // THEN: Request is rejected with 401
      expect(response.status()).toBe(401);
    });
  });

  // =============================================================================
  // EDGE CASES: Complex Configuration Scenarios
  // =============================================================================

  test.describe("Edge Cases", () => {
    /**
     * Complex nested config object is preserved
     */
    test("POSREAD-API-050: [P1] GET /api/stores/:storeId preserves complex nested config", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store with complex nested config
      const company = await createCompany(prismaClient, {
        name: "Complex Config Company",
        owner_user_id: superadminUser.user_id,
      });
      const complexConfig = {
        connection: {
          host: "192.168.1.100",
          port: 5000,
          timeout_ms: 30000,
        },
        retry: {
          max_attempts: 3,
          backoff_ms: 1000,
        },
        features: {
          auto_reconnect: true,
          validate_ssl: false,
        },
      };

      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Complex Config Store",
        status: "ACTIVE",
        pos_type: "GENERIC_REST",
        pos_connection_type: "NETWORK",
        pos_connection_config: complexConfig,
      });

      // WHEN: Fetching the store
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );

      // THEN: Complex config is fully preserved
      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body.pos_connection_config).toMatchObject(complexConfig);
      expect(body.pos_connection_config.connection.host).toBe("192.168.1.100");
      expect(body.pos_connection_config.retry.max_attempts).toBe(3);
      expect(body.pos_connection_config.features.auto_reconnect).toBe(true);
    });

    /**
     * Snake_case keys in config are preserved
     */
    test("POSREAD-API-051: [P0] GET /api/stores/:storeId preserves snake_case keys in config", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store with snake_case config keys
      const company = await createCompany(prismaClient, {
        name: "Snake Case Read Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Snake Case Read Store",
        status: "ACTIVE",
        pos_type: "GILBARCO_NAXML",
        pos_connection_type: "FILE",
        pos_connection_config: {
          import_path: "c:\\XMLGateway",
          poll_interval_seconds: 60,
          file_pattern: "*.xml",
          max_file_age_hours: 24,
        },
      });

      // WHEN: Fetching the store
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );

      // THEN: Snake_case keys are preserved
      expect(response.status()).toBe(200);
      const body = await response.json();
      const config = body.pos_connection_config;

      // Keys should be snake_case (not camelCase)
      expect(config).toHaveProperty("import_path");
      expect(config).toHaveProperty("poll_interval_seconds");
      expect(config).toHaveProperty("file_pattern");
      expect(config).toHaveProperty("max_file_age_hours");

      // Should NOT have camelCase versions
      expect(config).not.toHaveProperty("importPath");
      expect(config).not.toHaveProperty("pollIntervalSeconds");
      expect(config).not.toHaveProperty("filePattern");
      expect(config).not.toHaveProperty("maxFileAgeHours");
    });

    /**
     * Empty object config (not null) is preserved
     */
    test("POSREAD-API-052: [P1] GET /api/stores/:storeId handles empty object config", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store with empty object config
      const company = await createCompany(prismaClient, {
        name: "Empty Object Config Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Empty Object Config Store",
        status: "ACTIVE",
        pos_connection_config: {},
      });

      // WHEN: Fetching the store
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}`,
      );

      // THEN: Empty object is returned (not null, not undefined)
      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body.pos_connection_config).toBeDefined();
      expect(typeof body.pos_connection_config).toBe("object");
      expect(Object.keys(body.pos_connection_config)).toHaveLength(0);
    });

    /**
     * Non-existent store returns 404
     */
    test("POSREAD-API-053: [P1] GET /api/stores/:storeId returns 404 for non-existent store", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: A non-existent store ID
      const fakeStoreId = "00000000-0000-0000-0000-000000000000";

      // WHEN: Fetching non-existent store
      const response = await superadminApiRequest.get(
        `/api/stores/${fakeStoreId}`,
      );

      // THEN: Returns 404
      expect(response.status()).toBe(404);
    });

    /**
     * Invalid UUID format returns 400
     */
    test("POSREAD-API-054: [P1] GET /api/stores/:storeId returns 400 for invalid UUID", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: Invalid UUID format
      const invalidId = "not-a-valid-uuid";

      // WHEN: Fetching with invalid store ID
      const response = await superadminApiRequest.get(
        `/api/stores/${invalidId}`,
      );

      // THEN: Returns 400
      expect(response.status()).toBe(400);
    });
  });
});
