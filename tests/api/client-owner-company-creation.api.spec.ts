/**
 * CLIENT_OWNER Company Creation API Tests
 *
 * @test-level API Integration
 * @justification Comprehensive API-level tests for CLIENT_OWNER creation with company auto-creation
 * @feature User Management - CLIENT_OWNER Role with Company Creation
 * @created 2025-12-01
 *
 * BUSINESS CONTEXT:
 * CLIENT_OWNER is the role for Company Owners who:
 * - Create and own a company
 * - Access the client dashboard at /client
 * - Can manage their company's stores and users
 * - Company is created atomically with the user
 *
 * BUSINESS RULES TESTED:
 * - BR-CO-001: CLIENT_OWNER role creates a new company automatically
 * - BR-CO-002: companyName and companyAddress are required for CLIENT_OWNER
 * - BR-CO-003: company_id should NOT be provided (company doesn't exist yet)
 * - BR-CO-004: scope_type should be COMPANY for CLIENT_OWNER
 * - BR-CO-005: Created company is owned by the new user
 * - BR-CO-006: Created company has ACTIVE status
 * - BR-CO-007: is_client_user flag is set to true
 * - BR-CO-008: Company fields validation (length, whitespace)
 *
 * SECURITY FOCUS:
 * - Input validation and sanitization
 * - Authorization checks (SUPERADMIN only)
 * - Atomic transaction for user + company creation
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on critical paths and business logic
 * - Validate security boundaries
 * - Test edge cases and error conditions
 * - Industry best practices for API testing
 */

import { test, expect } from "../support/fixtures/rbac.fixture";

test.describe("CLIENT_OWNER Company Creation API", () => {
  test("[P0-BR-CO-001] should create CLIENT_OWNER with new company", async ({
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

    // WHEN: System Admin creates CLIENT_OWNER with company details
    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `Test Company ${timestamp}`,
      companyAddress: "123 Test Street, Test City, TC 12345",
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY", // CLIENT_OWNER uses COMPANY scope
          // No company_id - company will be created automatically
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

    // AND: User has CLIENT_OWNER role
    const ownerRole = body.data.roles.find(
      (r: any) => r.role.code === "CLIENT_OWNER",
    );
    expect(ownerRole).toBeDefined();
    expect(ownerRole.company_id).toBeDefined();
    expect(ownerRole.company_name).toBe(userData.companyName);
    // Note: scope_type is not returned in API response, only used during assignment

    // AND: is_client_user flag is set
    const createdUser = await prismaClient.user.findUnique({
      where: { user_id: body.data.user_id },
    });
    expect(createdUser?.is_client_user).toBe(true);

    // AND: Company was created with correct details
    const createdCompany = await prismaClient.company.findUnique({
      where: { company_id: ownerRole.company_id },
    });
    expect(createdCompany).toBeDefined();
    expect(createdCompany?.name).toBe(userData.companyName);
    expect(createdCompany?.address).toBe(userData.companyAddress);
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

  test("[P0-BR-CO-002a] should reject CLIENT_OWNER creation without companyName", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      // Missing companyName
      companyAddress: "123 Test Street",
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

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(
      /company name.*required|required.*company name/i,
    );
  });

  test("[P0-BR-CO-002b] should reject CLIENT_OWNER creation without companyAddress", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      companyName: "Test Company",
      // Missing companyAddress
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

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(
      /company address.*required|required.*company address/i,
    );
  });

  test("[P0-BR-CO-004] should reject empty companyName", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      companyName: "", // Empty
      companyAddress: "123 Test Street",
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

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  test("[P0-BR-CO-005] should reject whitespace-only companyName", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      companyName: "   ", // Whitespace only
      companyAddress: "123 Test Street",
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

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("[P0-BR-CO-005a] should reject empty companyAddress", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      companyName: "Test Company",
      companyAddress: "", // Empty
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

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("[P0-BR-CO-005b] should reject whitespace-only companyAddress", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      companyName: "Test Company",
      companyAddress: "   ", // Whitespace only
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

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  test("[P0-BR-CO-006] should trim companyName and companyAddress", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const timestamp = Date.now();

    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `  Test Company ${timestamp}  `, // With leading/trailing whitespace
      companyAddress: "  123 Test Street  ", // With leading/trailing whitespace
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

    expect(response.status()).toBe(201);

    const body = await response.json();
    const ownerRole = body.data.roles.find(
      (r: any) => r.role.code === "CLIENT_OWNER",
    );

    const createdCompany = await prismaClient.company.findUnique({
      where: { company_id: ownerRole.company_id },
    });

    // Company name and address should be trimmed
    expect(createdCompany?.name).toBe(`Test Company ${timestamp}`);
    expect(createdCompany?.address).toBe("123 Test Street");

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: { user_id: body.data.user_id },
    });
    await prismaClient.company.delete({
      where: { company_id: ownerRole.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: body.data.user_id } });
  });

  test("[P0-BR-CO-007] should reject companyName exceeding 255 characters", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      companyName: "A".repeat(256), // Exceeds 255 character limit
      companyAddress: "123 Test Street",
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

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/255|characters|exceed/i);
  });

  test("[P0-BR-CO-008] should reject companyAddress exceeding 500 characters", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      companyName: "Test Company",
      companyAddress: "A".repeat(501), // Exceeds 500 character limit
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

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/500|characters|exceed/i);
  });

  test("[P0-BR-CO-003] should create new company even if company_id is provided in role", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    // Create a temporary user to own the dummy company
    const tempUser = await prismaClient.user.create({
      data: {
        public_id: `USR-${Date.now()}`,
        email: `temp-${Date.now()}@test.com`,
        name: "Temp User",
        status: "ACTIVE",
      },
    });

    // Create a dummy company to use as company_id
    const dummyCompany = await prismaClient.company.create({
      data: {
        public_id: `CMP-${Date.now()}`,
        name: "Dummy Company",
        address: "Dummy Address",
        status: "ACTIVE",
        owner_user_id: tempUser.user_id,
      },
    });

    const timestamp = Date.now();
    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${timestamp}@test.com`,
      password: "SecurePassword123!",
      companyName: `New Company ${timestamp}`,
      companyAddress: "123 Test Street",
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
          company_id: dummyCompany.company_id, // Provided but should be ignored
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: User is created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);

    const ownerRole = body.data.roles.find(
      (r: any) => r.role.code === "CLIENT_OWNER",
    );

    // AND: A NEW company was created (not the dummy one)
    expect(ownerRole.company_id).toBeDefined();
    expect(ownerRole.company_id).not.toBe(dummyCompany.company_id);
    expect(ownerRole.company_name).toBe(userData.companyName);

    // Verify the new company exists
    const newCompany = await prismaClient.company.findUnique({
      where: { company_id: ownerRole.company_id },
    });
    expect(newCompany).toBeDefined();
    expect(newCompany?.name).toBe(userData.companyName);
    expect(newCompany?.owner_user_id).toBe(body.data.user_id);

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: { user_id: body.data.user_id },
    });
    await prismaClient.company.delete({
      where: { company_id: ownerRole.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: body.data.user_id } });
    await prismaClient.company.delete({
      where: { company_id: dummyCompany.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: tempUser.user_id } });
  });

  test("[P0-SEC] should require SUPERADMIN permission to create CLIENT_OWNER", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Company Owner",
      email: `companyowner-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      companyName: "Test Company",
      companyAddress: "123 Test Street",
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "COMPANY",
        },
      ],
    };

    // WHEN: Non-SUPERADMIN attempts to create CLIENT_OWNER
    const response = await clientUserApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: Request is rejected with 403
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  test("[P0-TX] should rollback company creation if user creation fails", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      test.skip();
      return;
    }

    // Create a user with the email first to trigger duplicate error
    const existingEmail = `existing-${Date.now()}@test.com`;
    const existingUser = await prismaClient.user.create({
      data: {
        public_id: `USR-${Date.now()}`,
        email: existingEmail,
        name: "Existing User",
        status: "ACTIVE",
      },
    });

    const companyName = `Orphan Company ${Date.now()}`;

    const userData = {
      name: "Test Company Owner",
      email: existingEmail, // Duplicate email - will fail
      password: "SecurePassword123!",
      companyName: companyName,
      companyAddress: "123 Test Street",
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

    // THEN: Request fails with 409 (conflict/duplicate email)
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/already exists|email.*exists/i);

    // AND: No orphan company was created (transaction rollback)
    const orphanCompany = await prismaClient.company.findFirst({
      where: { name: companyName },
    });
    expect(orphanCompany).toBeNull();

    // Cleanup
    await prismaClient.user.delete({
      where: { user_id: existingUser.user_id },
    });
  });
});
