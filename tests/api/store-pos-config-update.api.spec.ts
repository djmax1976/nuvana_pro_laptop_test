import { test, expect } from "../support/fixtures/rbac.fixture";
import { createStore, createCompany, createUser } from "../support/helpers";

/**
 * Store POS Configuration Update API Tests
 *
 * @test-level API
 * @justification API-level integration tests for store POS configuration update via PUT /api/stores/:storeId
 * @story store-pos-config-update
 * @created 2026-01-26
 * @priority P0 (Critical)
 *
 * BUSINESS CONTEXT:
 * This test suite validates the fix for a critical bug where POS configuration fields
 * (pos_type, pos_connection_type, pos_connection_config) were silently dropped when
 * updating a store via the admin dashboard. The bug caused data loss without any error.
 *
 * BUSINESS RULES TESTED:
 * - BR-POSUPD-001: PUT /api/stores/:storeId accepts and saves pos_type field
 * - BR-POSUPD-002: PUT /api/stores/:storeId accepts and saves pos_connection_type field
 * - BR-POSUPD-003: PUT /api/stores/:storeId accepts and saves pos_connection_config field
 * - BR-POSUPD-004: pos_type must be from strict enum allowlist (15 values)
 * - BR-POSUPD-005: pos_connection_type must be from strict enum allowlist (5 values)
 * - BR-POSUPD-006: pos_connection_config can be null to clear configuration
 * - BR-POSUPD-007: Response includes updated POS configuration fields
 * - BR-POSUPD-008: Database reflects POS configuration changes
 * - BR-POSUPD-009: Company isolation enforced for POS config updates
 *
 * SECURITY FOCUS:
 * - SEC-014: INPUT_VALIDATION - Enum allowlist validation for pos_type and pos_connection_type
 * - SEC-004: XSS - JSON config content validation (rejected at service layer)
 * - SEC-006: SQL_INJECTION - Prisma ORM parameterized queries
 * - DB-006: TENANT_ISOLATION - Company scoping enforced
 *
 * ENDPOINTS TESTED:
 * - PUT /api/stores/:storeId (extended with POS configuration fields)
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on API contract validation and data persistence
 * - Verify both response and database state
 */

test.describe("Store POS Configuration Update API", () => {
  // =============================================================================
  // HAPPY PATH: Successful POS Configuration Updates
  // =============================================================================

  test.describe("Successful POS Configuration Updates", () => {
    /**
     * BR-POSUPD-001, BR-POSUPD-002, BR-POSUPD-003: All POS fields saved correctly
     * This is the PRIMARY test case that validates the bug fix
     */
    test("POSUPD-API-001: [P0] PUT /api/stores/:storeId saves all POS configuration fields", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A company and store with default POS configuration
      const company = await createCompany(prismaClient, {
        name: "POS Config Test Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "POS Config Test Store",
        status: "ACTIVE",
      });

      // Verify initial state is MANUAL_ENTRY/MANUAL
      expect(store.pos_type).toBe("MANUAL_ENTRY");
      expect(store.pos_connection_type).toBe("MANUAL");

      // WHEN: Updating store with POS configuration
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        {
          pos_type: "GILBARCO_NAXML",
          pos_connection_type: "FILE",
          pos_connection_config: {
            import_path: "c:\\XMLGateway",
            poll_interval_seconds: 60,
          },
        },
      );

      // THEN: Request succeeds
      expect(response.status()).toBe(200);

      const body = await response.json();

      // AND: Response includes updated POS fields (BR-POSUPD-007)
      expect(body.pos_type).toBe("GILBARCO_NAXML");
      expect(body.pos_connection_type).toBe("FILE");
      expect(body.pos_connection_config).toMatchObject({
        import_path: "c:\\XMLGateway",
        poll_interval_seconds: 60,
      });

      // AND: Database reflects changes (BR-POSUPD-008)
      const dbStore = await prismaClient.store.findUnique({
        where: { store_id: store.store_id },
      });
      expect(dbStore?.pos_type).toBe("GILBARCO_NAXML");
      expect(dbStore?.pos_connection_type).toBe("FILE");
      expect(dbStore?.pos_connection_config).toMatchObject({
        import_path: "c:\\XMLGateway",
        poll_interval_seconds: 60,
      });
    });

    /**
     * BR-POSUPD-001: Change from GILBARCO_NAXML to MANUAL_ENTRY
     * Critical scenario: User changing from automated to manual entry
     */
    test("POSUPD-API-002: [P0] PUT /api/stores/:storeId changes POS type from GILBARCO_NAXML to MANUAL_ENTRY", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store with GILBARCO_NAXML configuration
      const company = await createCompany(prismaClient, {
        name: "NAXML to Manual Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "NAXML to Manual Store",
        status: "ACTIVE",
        pos_type: "GILBARCO_NAXML",
        pos_connection_type: "FILE",
        pos_connection_config: { import_path: "c:\\old_path" },
      });

      // WHEN: Changing to MANUAL_ENTRY
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        {
          pos_type: "MANUAL_ENTRY",
          pos_connection_type: "MANUAL",
          pos_connection_config: null,
        },
      );

      // THEN: Request succeeds
      expect(response.status()).toBe(200);

      const body = await response.json();

      // AND: Response shows MANUAL configuration
      expect(body.pos_type).toBe("MANUAL_ENTRY");
      expect(body.pos_connection_type).toBe("MANUAL");
      expect(body.pos_connection_config).toBeNull();

      // AND: Database reflects MANUAL configuration
      const dbStore = await prismaClient.store.findUnique({
        where: { store_id: store.store_id },
      });
      expect(dbStore?.pos_type).toBe("MANUAL_ENTRY");
      expect(dbStore?.pos_connection_type).toBe("MANUAL");
      expect(dbStore?.pos_connection_config).toBeNull();
    });

    /**
     * BR-POSUPD-006: Clear pos_connection_config with null
     */
    test("POSUPD-API-003: [P0] PUT /api/stores/:storeId clears pos_connection_config with null", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store with existing config
      const company = await createCompany(prismaClient, {
        name: "Clear Config Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Clear Config Store",
        status: "ACTIVE",
        pos_connection_config: { import_path: "c:\\path_to_clear" },
      });

      // WHEN: Setting config to null
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        {
          pos_connection_config: null,
        },
      );

      // THEN: Request succeeds and config is cleared
      expect(response.status()).toBe(200);

      const dbStore = await prismaClient.store.findUnique({
        where: { store_id: store.store_id },
      });
      expect(dbStore?.pos_connection_config).toBeNull();
    });

    /**
     * Test all valid POS system types
     */
    test("POSUPD-API-004: [P1] PUT /api/stores/:storeId accepts all valid pos_type values", async ({
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
      ];

      const company = await createCompany(prismaClient, {
        name: "All POS Types Company",
        owner_user_id: superadminUser.user_id,
      });

      for (const posType of validPosTypes) {
        const store = await createStore(prismaClient, {
          company_id: company.company_id,
          name: `Store for ${posType}`,
          status: "ACTIVE",
        });

        const response = await superadminApiRequest.put(
          `/api/stores/${store.store_id}`,
          { pos_type: posType },
        );

        expect(response.status(), `Expected 200 for pos_type=${posType}`).toBe(
          200,
        );

        const body = await response.json();
        expect(body.pos_type).toBe(posType);
      }
    });

    /**
     * Test all valid connection types
     */
    test("POSUPD-API-005: [P1] PUT /api/stores/:storeId accepts all valid pos_connection_type values", async ({
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
      ];

      const company = await createCompany(prismaClient, {
        name: "All Connection Types Company",
        owner_user_id: superadminUser.user_id,
      });

      for (const connType of validConnectionTypes) {
        const store = await createStore(prismaClient, {
          company_id: company.company_id,
          name: `Store for ${connType}`,
          status: "ACTIVE",
        });

        const response = await superadminApiRequest.put(
          `/api/stores/${store.store_id}`,
          { pos_connection_type: connType },
        );

        expect(
          response.status(),
          `Expected 200 for pos_connection_type=${connType}`,
        ).toBe(200);

        const body = await response.json();
        expect(body.pos_connection_type).toBe(connType);
      }
    });
  });

  // =============================================================================
  // VALIDATION: Schema Enforcement
  // =============================================================================

  test.describe("Schema Validation", () => {
    /**
     * BR-POSUPD-004: Invalid pos_type rejected
     * SEC-014: INPUT_VALIDATION
     */
    test("POSUPD-API-010: [P0] PUT /api/stores/:storeId rejects invalid pos_type", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store
      const company = await createCompany(prismaClient, {
        name: "Invalid POS Type Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Invalid POS Type Store",
        status: "ACTIVE",
      });

      // WHEN: Updating with invalid pos_type
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        { pos_type: "INVALID_POS_TYPE" },
      );

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);

      // AND: Store is unchanged in database
      const dbStore = await prismaClient.store.findUnique({
        where: { store_id: store.store_id },
      });
      expect(dbStore?.pos_type).toBe("MANUAL_ENTRY"); // Default unchanged
    });

    /**
     * BR-POSUPD-005: Invalid pos_connection_type rejected
     * SEC-014: INPUT_VALIDATION
     */
    test("POSUPD-API-011: [P0] PUT /api/stores/:storeId rejects invalid pos_connection_type", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store
      const company = await createCompany(prismaClient, {
        name: "Invalid Conn Type Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Invalid Conn Type Store",
        status: "ACTIVE",
      });

      // WHEN: Updating with invalid connection type
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        { pos_connection_type: "INVALID_CONNECTION" },
      );

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);
    });

    /**
     * Test: pos_connection_config array rejected (must be object)
     */
    test("POSUPD-API-012: [P1] PUT /api/stores/:storeId rejects array as pos_connection_config", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store
      const company = await createCompany(prismaClient, {
        name: "Array Config Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Array Config Store",
        status: "ACTIVE",
      });

      // WHEN: Updating with array instead of object
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        { pos_connection_config: ["invalid", "array"] },
      );

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);
    });
  });

  // =============================================================================
  // SECURITY: XSS Prevention
  // =============================================================================

  test.describe("Security - XSS Prevention", () => {
    /**
     * SEC-004: XSS - Script tag in config rejected
     */
    test("POSUPD-API-020: [P0-SEC] PUT /api/stores/:storeId rejects XSS script tag in config", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store
      const company = await createCompany(prismaClient, {
        name: "XSS Script Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "XSS Script Store",
        status: "ACTIVE",
      });

      // WHEN: Updating with XSS in config
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        {
          pos_connection_config: {
            import_path: "<script>alert('xss')</script>",
          },
        },
      );

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);

      // AND: Store config is unchanged
      const dbStore = await prismaClient.store.findUnique({
        where: { store_id: store.store_id },
      });
      expect(dbStore?.pos_connection_config).toBeNull();
    });

    /**
     * SEC-004: XSS - javascript: URL in config rejected
     */
    test("POSUPD-API-021: [P0-SEC] PUT /api/stores/:storeId rejects javascript: URL in config", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store
      const company = await createCompany(prismaClient, {
        name: "XSS JS URL Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "XSS JS URL Store",
        status: "ACTIVE",
      });

      // WHEN: Updating with javascript: URL
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        {
          pos_connection_config: {
            webhook_url: "javascript:alert('xss')",
          },
        },
      );

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);
    });

    /**
     * SEC-004: XSS - iframe tag in config rejected
     */
    test("POSUPD-API-022: [P0-SEC] PUT /api/stores/:storeId rejects iframe tag in config", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store
      const company = await createCompany(prismaClient, {
        name: "XSS Iframe Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "XSS Iframe Store",
        status: "ACTIVE",
      });

      // WHEN: Updating with iframe in config
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        {
          pos_connection_config: {
            description: "<iframe src='evil.com'></iframe>",
          },
        },
      );

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);
    });

    /**
     * SEC-004: XSS - onerror handler in config rejected
     */
    test("POSUPD-API-023: [P0-SEC] PUT /api/stores/:storeId rejects onerror handler in config", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store
      const company = await createCompany(prismaClient, {
        name: "XSS Onerror Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "XSS Onerror Store",
        status: "ACTIVE",
      });

      // WHEN: Updating with onerror handler
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        {
          pos_connection_config: {
            path: 'image.png" onerror="alert(1)"',
          },
        },
      );

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);
    });
  });

  // =============================================================================
  // SECURITY: Company Isolation
  // =============================================================================

  test.describe("Security - Company Isolation", () => {
    /**
     * BR-POSUPD-009: Company isolation enforced
     * DB-006: TENANT_ISOLATION
     */
    test("POSUPD-API-030: [P0-SEC] PUT /api/stores/:storeId enforces company isolation", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      // GIVEN: A different company and store that corporate admin should NOT access
      const otherOwner = await createUser(prismaClient);
      const otherCompany = await createCompany(prismaClient, {
        name: "Other Company",
        owner_user_id: otherOwner.user_id,
      });
      const otherStore = await createStore(prismaClient, {
        company_id: otherCompany.company_id,
        name: "Other Company Store",
        status: "ACTIVE",
      });

      // WHEN: Corporate admin tries to update store from other company
      const response = await corporateAdminApiRequest.put(
        `/api/stores/${otherStore.store_id}`,
        {
          pos_type: "GILBARCO_NAXML",
          pos_connection_type: "FILE",
        },
      );

      // THEN: Request is rejected with 403
      expect(response.status()).toBe(403);

      // AND: Store is unchanged
      const dbStore = await prismaClient.store.findUnique({
        where: { store_id: otherStore.store_id },
      });
      expect(dbStore?.pos_type).toBe("MANUAL_ENTRY"); // Default unchanged
    });

    /**
     * System admin CAN update any store (cross-company)
     */
    test("POSUPD-API-031: [P0] System admin can update POS config for any company", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A store from any company
      const owner = await createUser(prismaClient);
      const company = await createCompany(prismaClient, {
        name: "Any Company",
        owner_user_id: owner.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Any Company Store",
        status: "ACTIVE",
      });

      // WHEN: System admin updates POS config
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        {
          pos_type: "SQUARE_REST",
          pos_connection_type: "API",
          pos_connection_config: {
            base_url: "https://connect.squareup.com",
            api_key: "test-key",
          },
        },
      );

      // THEN: Request succeeds
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.pos_type).toBe("SQUARE_REST");
      expect(body.pos_connection_type).toBe("API");
    });
  });

  // =============================================================================
  // AUTHORIZATION: Permission Enforcement
  // =============================================================================

  test.describe("Authorization - Permission Enforcement", () => {
    /**
     * Unauthenticated request rejected
     */
    test("POSUPD-API-040: [P0-SEC] PUT /api/stores/:storeId requires authentication", async ({
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
      });

      // WHEN: Making unauthenticated request
      const response = await request.put(
        `http://localhost:3001/api/stores/${store.store_id}`,
        {
          data: { pos_type: "GILBARCO_NAXML" },
        },
      );

      // THEN: Request is rejected with 401
      expect(response.status()).toBe(401);
    });

    /**
     * Regular user without STORE_UPDATE permission rejected
     */
    test("POSUPD-API-041: [P0-SEC] PUT /api/stores/:storeId requires STORE_UPDATE permission", async ({
      regularUserApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A store
      const owner = await createUser(prismaClient);
      const company = await createCompany(prismaClient, {
        name: "Permission Test Company",
        owner_user_id: owner.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Permission Test Store",
        status: "ACTIVE",
      });

      // WHEN: Regular user (no STORE_UPDATE permission) tries to update
      const response = await regularUserApiRequest.put(
        `/api/stores/${store.store_id}`,
        { pos_type: "GILBARCO_NAXML" },
      );

      // THEN: Request is rejected with 403
      expect(response.status()).toBe(403);
    });
  });

  // =============================================================================
  // EDGE CASES: Boundary Conditions
  // =============================================================================

  test.describe("Edge Cases", () => {
    /**
     * Config size limit enforcement (10KB max)
     */
    test("POSUPD-API-050: [P1] PUT /api/stores/:storeId rejects config exceeding 10KB", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store
      const company = await createCompany(prismaClient, {
        name: "Large Config Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Large Config Store",
        status: "ACTIVE",
      });

      // WHEN: Updating with config > 10KB
      const largeData = "a".repeat(11000);
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        {
          pos_connection_config: { data: largeData },
        },
      );

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);
    });

    /**
     * Non-existent store returns 404
     */
    test("POSUPD-API-051: [P1] PUT /api/stores/:storeId returns 404 for non-existent store", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: A non-existent store ID
      const fakeStoreId = "00000000-0000-0000-0000-000000000000";

      // WHEN: Updating non-existent store
      const response = await superadminApiRequest.put(
        `/api/stores/${fakeStoreId}`,
        { pos_type: "GILBARCO_NAXML" },
      );

      // THEN: Returns 404
      expect(response.status()).toBe(404);
    });

    /**
     * Invalid UUID format returns 400
     */
    test("POSUPD-API-052: [P1] PUT /api/stores/:storeId returns 400 for invalid UUID", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: Invalid UUID format
      const invalidId = "not-a-valid-uuid";

      // WHEN: Updating with invalid store ID
      const response = await superadminApiRequest.put(
        `/api/stores/${invalidId}`,
        { pos_type: "GILBARCO_NAXML" },
      );

      // THEN: Returns 400
      expect(response.status()).toBe(400);
    });

    /**
     * Partial update: Only pos_type without affecting other fields
     */
    test("POSUPD-API-053: [P1] PUT /api/stores/:storeId supports partial update of POS fields", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store with existing config
      const company = await createCompany(prismaClient, {
        name: "Partial Update Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Partial Update Store",
        status: "ACTIVE",
        pos_type: "GILBARCO_NAXML",
        pos_connection_type: "FILE",
        pos_connection_config: { import_path: "c:\\original" },
      });

      // WHEN: Updating only pos_type
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        { pos_type: "SQUARE_REST" },
      );

      // THEN: Request succeeds
      expect(response.status()).toBe(200);

      // AND: Only pos_type changed, other fields preserved
      const dbStore = await prismaClient.store.findUnique({
        where: { store_id: store.store_id },
      });
      expect(dbStore?.pos_type).toBe("SQUARE_REST");
      expect(dbStore?.pos_connection_type).toBe("FILE"); // Preserved
      expect(dbStore?.pos_connection_config).toMatchObject({
        import_path: "c:\\original",
      }); // Preserved
    });

    /**
     * Snake_case keys preserved in config
     */
    test("POSUPD-API-054: [P0] PUT /api/stores/:storeId preserves snake_case keys in config", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A store
      const company = await createCompany(prismaClient, {
        name: "Snake Case Company",
        owner_user_id: superadminUser.user_id,
      });
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Snake Case Store",
        status: "ACTIVE",
      });

      // WHEN: Updating with snake_case config keys
      const response = await superadminApiRequest.put(
        `/api/stores/${store.store_id}`,
        {
          pos_connection_config: {
            import_path: "c:\\XMLGateway",
            poll_interval_seconds: 60,
            file_pattern: "*.xml",
          },
        },
      );

      // THEN: Request succeeds
      expect(response.status()).toBe(200);

      // AND: Snake_case keys are preserved (not converted to camelCase)
      const dbStore = await prismaClient.store.findUnique({
        where: { store_id: store.store_id },
      });
      const config = dbStore?.pos_connection_config as Record<string, unknown>;
      expect(config).toHaveProperty("import_path");
      expect(config).toHaveProperty("poll_interval_seconds");
      expect(config).toHaveProperty("file_pattern");
      expect(config).not.toHaveProperty("importPath");
      expect(config).not.toHaveProperty("pollIntervalSeconds");
    });
  });
});
