/**
 * CLIENT_OWNER Structured Address API Tests
 *
 * Phase 3: Testing Implementation for Structured Address
 * Implements: ADDR-API-001 through ADDR-API-003
 *
 * @test-level API Integration
 * @justification Comprehensive API-level tests for CLIENT_OWNER creation with structured address
 * @feature User Management - Structured Address for Company Creation
 * @created 2025-01-18
 *
 * BUSINESS CONTEXT:
 * CLIENT_OWNER role users now receive a structured company address instead of a simple string.
 * This enables:
 * - Tax jurisdiction calculations (require state_id, county_id)
 * - Geographic filtering and reporting
 * - Address validation against geographic reference data
 *
 * TEST IDS:
 * - ADDR-API-001: Full structured address flow
 * - ADDR-API-002: Invalid state rejection
 * - ADDR-API-003: County-state mismatch rejection
 *
 * @enterprise-standards
 * - SEC-006: SQL_INJECTION - Uses Prisma ORM, no raw SQL
 * - SEC-014: INPUT_VALIDATION - UUID format validation
 * - DB-006: TENANT_ISOLATION - Company isolation verified
 */

import { test, expect } from "../support/fixtures/rbac.fixture";

test.describe("ADDR-API: CLIENT_OWNER Structured Address", () => {
  // ADDR-API-001: Full structured address flow
  test("[P0] ADDR-API-001: should create company with structured address fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: CLIENT_OWNER role exists and geographic data is available
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    // Get valid geographic test data
    const georgiaState = await prismaClient.uSState.findFirst({
      where: { code: "GA", is_active: true },
    });

    if (!georgiaState) {
      test.skip();
      return;
    }

    const fultonCounty = await prismaClient.uSCounty.findFirst({
      where: {
        state_id: georgiaState.state_id,
        name: { contains: "Fulton" },
        is_active: true,
      },
    });

    if (!fultonCounty) {
      test.skip();
      return;
    }

    const timestamp = Date.now();

    // WHEN: System Admin creates CLIENT_OWNER with structured address
    const userData = {
      name: "Structured Address Owner",
      email: `structaddr-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `Structured Address Company ${timestamp}`,
      companyAddress: {
        address_line1: "123 Peachtree Street NE",
        address_line2: "Suite 500",
        city: "Atlanta",
        state_id: georgiaState.state_id,
        county_id: fultonCounty.county_id,
        zip_code: "30301",
      },
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: User and company are created successfully
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.user_id).toBeDefined();
    expect(body.data.email).toBe(userData.email.toLowerCase());

    // AND: User has CLIENT_OWNER role with company assigned
    const ownerRole = body.data.roles.find(
      (r: any) => r.role.code === "CLIENT_OWNER",
    );
    expect(ownerRole).toBeDefined();
    expect(ownerRole.company_id).toBeDefined();
    expect(ownerRole.company_name).toBe(userData.companyName);

    // AND: Company was created with structured address fields
    const createdCompany = await prismaClient.company.findUnique({
      where: { company_id: ownerRole.company_id },
    });

    expect(createdCompany).toBeDefined();
    expect(createdCompany?.name).toBe(userData.companyName);

    // Verify structured address fields are stored
    expect(createdCompany?.address_line1).toBe(
      userData.companyAddress.address_line1,
    );
    expect(createdCompany?.address_line2).toBe(
      userData.companyAddress.address_line2,
    );
    expect(createdCompany?.city).toBe(userData.companyAddress.city);
    expect(createdCompany?.state_id).toBe(georgiaState.state_id);
    expect(createdCompany?.county_id).toBe(fultonCounty.county_id);
    expect(createdCompany?.zip_code).toBe(userData.companyAddress.zip_code);

    // AND: Legacy address field is populated for backward compatibility
    expect(createdCompany?.address).toBeDefined();
    expect(createdCompany?.address).toContain("123 Peachtree Street NE");

    // AND: Company is owned by the new user
    expect(createdCompany?.owner_user_id).toBe(body.data.user_id);
    expect(createdCompany?.status).toBe("ACTIVE");

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: { user_id: body.data.user_id },
    });
    await prismaClient.company.delete({
      where: { company_id: ownerRole.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: body.data.user_id } });
  });

  // ADDR-API-002: Invalid state rejection
  test("[P0] ADDR-API-002: should return 400 for invalid state_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: CLIENT_OWNER role exists
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    // Get a valid county for testing (we'll use invalid state with valid county format)
    const anyCounty = await prismaClient.uSCounty.findFirst({
      where: { is_active: true },
    });

    if (!anyCounty) {
      test.skip();
      return;
    }

    const timestamp = Date.now();

    // WHEN: Creating CLIENT_OWNER with invalid (non-existent) state_id
    const userData = {
      name: "Invalid State Owner",
      email: `invalidstate-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `Invalid State Corp ${timestamp}`,
      companyAddress: {
        address_line1: "123 Main Street",
        city: "Some City",
        state_id: "00000000-0000-0000-0000-000000000000", // Invalid state UUID
        county_id: anyCounty.county_id,
        zip_code: "12345",
      },
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: Request is rejected with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/state.*not found|invalid.*state/i);
  });

  // ADDR-API-003: County-state mismatch rejection
  test("[P0] ADDR-API-003: should return 400 when county does not belong to state", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: CLIENT_OWNER role exists
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    // Get Georgia state
    const georgiaState = await prismaClient.uSState.findFirst({
      where: { code: "GA", is_active: true },
    });

    // Get a Florida county (will not match Georgia)
    const floridaState = await prismaClient.uSState.findFirst({
      where: { code: "FL", is_active: true },
    });

    if (!georgiaState || !floridaState) {
      test.skip();
      return;
    }

    const floridaCounty = await prismaClient.uSCounty.findFirst({
      where: {
        state_id: floridaState.state_id,
        is_active: true,
      },
    });

    if (!floridaCounty) {
      test.skip();
      return;
    }

    const timestamp = Date.now();

    // WHEN: Creating CLIENT_OWNER with county that doesn't belong to selected state
    const userData = {
      name: "Mismatched County Owner",
      email: `mismatch-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `Mismatch Corp ${timestamp}`,
      companyAddress: {
        address_line1: "456 Oak Street",
        city: "Atlanta",
        state_id: georgiaState.state_id, // Georgia
        county_id: floridaCounty.county_id, // Florida county - MISMATCH!
        zip_code: "30301",
      },
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: Request is rejected with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(
      /county.*not.*belong|county.*state.*mismatch|invalid.*county/i,
    );
  });

  // Additional test: Missing required address fields
  test("[P0] ADDR-API-EXTRA-001: should reject structured address missing required fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: CLIENT_OWNER role exists
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const georgiaState = await prismaClient.uSState.findFirst({
      where: { code: "GA", is_active: true },
    });

    if (!georgiaState) {
      test.skip();
      return;
    }

    const timestamp = Date.now();

    // WHEN: Creating CLIENT_OWNER with incomplete structured address (missing city)
    const userData = {
      name: "Missing City Owner",
      email: `missingcity-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `Missing City Corp ${timestamp}`,
      companyAddress: {
        address_line1: "123 Main Street",
        // city: missing
        state_id: georgiaState.state_id,
        // county_id: missing
        zip_code: "30301",
      },
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: Request is rejected with 400 for missing required fields
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // Additional test: Invalid ZIP code format
  test("[P0] ADDR-API-EXTRA-002: should reject invalid ZIP code format", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: CLIENT_OWNER role exists
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const georgiaState = await prismaClient.uSState.findFirst({
      where: { code: "GA", is_active: true },
    });

    const fultonCounty = await prismaClient.uSCounty.findFirst({
      where: {
        state_id: georgiaState?.state_id,
        name: { contains: "Fulton" },
        is_active: true,
      },
    });

    if (!georgiaState || !fultonCounty) {
      test.skip();
      return;
    }

    const timestamp = Date.now();

    // WHEN: Creating CLIENT_OWNER with invalid ZIP code format
    const userData = {
      name: "Invalid ZIP Owner",
      email: `invalidzip-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `Invalid ZIP Corp ${timestamp}`,
      companyAddress: {
        address_line1: "123 Main Street",
        city: "Atlanta",
        state_id: georgiaState.state_id,
        county_id: fultonCounty.county_id,
        zip_code: "ABCDE", // Invalid format
      },
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: Request is rejected with 400 for invalid ZIP format
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/zip.*code|format/i);
  });

  // Additional test: Valid ZIP+4 format accepted
  test("[P0] ADDR-API-EXTRA-003: should accept valid ZIP+4 format", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: CLIENT_OWNER role exists and geographic data available
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const georgiaState = await prismaClient.uSState.findFirst({
      where: { code: "GA", is_active: true },
    });

    const fultonCounty = await prismaClient.uSCounty.findFirst({
      where: {
        state_id: georgiaState?.state_id,
        name: { contains: "Fulton" },
        is_active: true,
      },
    });

    if (!georgiaState || !fultonCounty) {
      test.skip();
      return;
    }

    const timestamp = Date.now();

    // WHEN: Creating CLIENT_OWNER with ZIP+4 format
    const userData = {
      name: "ZIP4 Owner",
      email: `zip4-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `ZIP4 Corp ${timestamp}`,
      companyAddress: {
        address_line1: "123 Main Street",
        city: "Atlanta",
        state_id: georgiaState.state_id,
        county_id: fultonCounty.county_id,
        zip_code: "30301-1234", // Valid ZIP+4 format
      },
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: User and company are created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);

    const ownerRole = body.data.roles.find(
      (r: any) => r.role.code === "CLIENT_OWNER",
    );

    // Verify ZIP+4 is stored correctly
    const createdCompany = await prismaClient.company.findUnique({
      where: { company_id: ownerRole.company_id },
    });
    expect(createdCompany?.zip_code).toBe("30301-1234");

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: { user_id: body.data.user_id },
    });
    await prismaClient.company.delete({
      where: { company_id: ownerRole.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: body.data.user_id } });
  });

  // Additional test: Transaction rollback on validation failure
  test("[P0] ADDR-API-EXTRA-004: should rollback all changes if address validation fails", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: CLIENT_OWNER role exists
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const timestamp = Date.now();
    const companyName = `Rollback Test Corp ${timestamp}`;
    const userEmail = `rollback-${timestamp}@test.com`;

    // WHEN: Creating CLIENT_OWNER with invalid state_id
    const userData = {
      name: "Rollback Test Owner",
      email: userEmail,
      password: "SecurePassword123!",
      companyName: companyName,
      companyAddress: {
        address_line1: "123 Main Street",
        city: "Atlanta",
        state_id: "00000000-0000-0000-0000-000000000000", // Invalid
        county_id: "00000000-0000-0000-0000-000000000001", // Invalid
        zip_code: "30301",
      },
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: Request fails
    expect(response.status()).toBe(400);

    // AND: No orphan user was created
    const orphanUser = await prismaClient.user.findFirst({
      where: { email: userEmail.toLowerCase() },
    });
    expect(orphanUser).toBeNull();

    // AND: No orphan company was created
    const orphanCompany = await prismaClient.company.findFirst({
      where: { name: companyName },
    });
    expect(orphanCompany).toBeNull();
  });
});

// =============================================================================
// Phase 4: Backward Compatibility API Tests
// =============================================================================

test.describe("ADDR-P4-API: Backward Compatibility - Legacy String Address", () => {
  /**
   * Phase 4: TASK-4.6 - Union schema backward compatibility
   *
   * These tests verify that the API still accepts the deprecated string-based
   * companyAddress format for backward compatibility with existing integrations.
   *
   * IMPORTANT: String format is DEPRECATED and will be removed in v2.0.
   * New integrations MUST use structured format.
   */

  // ADDR-P4-API-001: Legacy string address acceptance
  test("[P0] ADDR-P4-API-001: should accept legacy string address format (deprecated)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: CLIENT_OWNER role exists
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const timestamp = Date.now();

    // WHEN: Creating CLIENT_OWNER with legacy string address
    const userData = {
      name: "Legacy String Address Owner",
      email: `legacy-str-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `Legacy String Company ${timestamp}`,
      // DEPRECATED: String format - will be removed in v2.0
      companyAddress: "789 Oak Street, Suite 300, Chicago, IL 60601",
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: User and company are created successfully
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.user_id).toBeDefined();

    // AND: User has CLIENT_OWNER role with company assigned
    const ownerRole = body.data.roles.find(
      (r: any) => r.role.code === "CLIENT_OWNER",
    );
    expect(ownerRole).toBeDefined();
    expect(ownerRole.company_id).toBeDefined();

    // AND: Company was created with legacy address in address field
    const createdCompany = await prismaClient.company.findUnique({
      where: { company_id: ownerRole.company_id },
    });

    expect(createdCompany).toBeDefined();
    expect(createdCompany?.name).toBe(userData.companyName);

    // Legacy address field should contain the string
    expect(createdCompany?.address).toBe(userData.companyAddress);

    // Structured fields should be null (legacy format doesn't provide these)
    expect(createdCompany?.address_line1).toBeNull();
    expect(createdCompany?.city).toBeNull();
    expect(createdCompany?.state_id).toBeNull();
    expect(createdCompany?.zip_code).toBeNull();

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: { user_id: body.data.user_id },
    });
    await prismaClient.company.delete({
      where: { company_id: ownerRole.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: body.data.user_id } });
  });

  // ADDR-P4-API-002: Legacy string validation - empty string rejected
  test("[P0] ADDR-P4-API-002: should reject empty legacy string address", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: CLIENT_OWNER role exists
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const timestamp = Date.now();

    // WHEN: Creating CLIENT_OWNER with empty string address
    const userData = {
      name: "Empty String Address Owner",
      email: `empty-str-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `Empty String Company ${timestamp}`,
      companyAddress: "", // Empty string - should be rejected
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: Request is rejected with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ADDR-P4-API-003: Legacy string max length validation
  test("[P0] ADDR-P4-API-003: should reject legacy string exceeding 500 characters", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: CLIENT_OWNER role exists
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const timestamp = Date.now();

    // WHEN: Creating CLIENT_OWNER with too-long string address
    const userData = {
      name: "Long String Address Owner",
      email: `long-str-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `Long String Company ${timestamp}`,
      companyAddress: "A".repeat(501), // 501 characters - exceeds max
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: Request is rejected with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ADDR-P4-API-004: Structured format still works
  test("[P0] ADDR-P4-API-004: should still accept structured format alongside legacy support", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: CLIENT_OWNER role exists and geographic data available
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const georgiaState = await prismaClient.uSState.findFirst({
      where: { code: "GA", is_active: true },
    });

    const fultonCounty = await prismaClient.uSCounty.findFirst({
      where: {
        state_id: georgiaState?.state_id,
        name: { contains: "Fulton" },
        is_active: true,
      },
    });

    if (!georgiaState || !fultonCounty) {
      test.skip();
      return;
    }

    const timestamp = Date.now();

    // WHEN: Creating CLIENT_OWNER with structured address (preferred)
    const userData = {
      name: "Structured Format Owner",
      email: `structured-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `Structured Format Company ${timestamp}`,
      companyAddress: {
        address_line1: "100 Preferred Way",
        address_line2: "Building A",
        city: "Atlanta",
        state_id: georgiaState.state_id,
        county_id: fultonCounty.county_id,
        zip_code: "30301",
      },
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: User and company are created successfully
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);

    const ownerRole = body.data.roles.find(
      (r: any) => r.role.code === "CLIENT_OWNER",
    );

    // Verify structured fields are populated
    const createdCompany = await prismaClient.company.findUnique({
      where: { company_id: ownerRole.company_id },
    });

    expect(createdCompany?.address_line1).toBe("100 Preferred Way");
    expect(createdCompany?.city).toBe("Atlanta");
    expect(createdCompany?.state_id).toBe(georgiaState.state_id);
    expect(createdCompany?.zip_code).toBe("30301");
    // Legacy field should also be populated for backward compat
    expect(createdCompany?.address).toBeDefined();

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: { user_id: body.data.user_id },
    });
    await prismaClient.company.delete({
      where: { company_id: ownerRole.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: body.data.user_id } });
  });
});
