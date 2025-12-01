/**
 * CLIENT_USER Creation API Tests
 *
 * @test-level API Integration
 * @justification Comprehensive API-level tests for CLIENT_USER creation with company and store assignment
 * @feature User Management - CLIENT_USER Role Assignment
 * @created 2025-11-30
 *
 * BUSINESS RULES TESTED:
 * - BR-CU-001: CLIENT_USER must be assigned to an existing company
 * - BR-CU-002: CLIENT_USER must be assigned to an existing store
 * - BR-CU-003: Store must belong to the specified company (security)
 * - BR-CU-004: Company must be ACTIVE
 * - BR-CU-005: Store must be ACTIVE
 * - BR-CU-006: is_client_user flag must be set to true
 * - BR-CU-007: user_role must have both company_id and store_id
 *
 * SECURITY FOCUS:
 * - Company isolation enforcement
 * - Store-company relationship validation
 * - Input validation and sanitization
 * - SQL injection prevention (via Prisma ORM)
 * - Authorization checks (SUPERADMIN only)
 * - Active status validation
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on critical paths and business logic
 * - Validate security boundaries
 * - Test edge cases and error conditions
 * - Industry best practices for API testing
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createUser, createCompany, createStore } from "../support/factories";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

test.describe("CLIENT_USER Creation API", () => {
  test("[P0-BR-CU-001] should create CLIENT_USER with company and store assignment", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const companyOwner = await prismaClient.user.create({
      data: createUser(),
    });

    const company = await prismaClient.company.create({
      data: createCompany({
        owner_user_id: companyOwner.user_id,
      }),
    });

    const store = await prismaClient.store.create({
      data: createStore({
        company_id: company.company_id,
      }),
    });

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    if (!clientUserRole) {
      test.skip();
      return;
    }

    // WHEN: System Admin creates CLIENT_USER with company and store
    const userData = {
      name: "Test Client User",
      email: `clientuser-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "COMPANY",
          company_id: company.company_id,
          store_id: store.store_id,
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
    expect(body.data.user_id).toBeDefined();
    expect(body.data.email).toBe(userData.email.toLowerCase());

    // AND: User has CLIENT_USER role with company and store
    const userRole = body.data.roles.find(
      (r: any) => r.role.code === "CLIENT_USER",
    );
    expect(userRole).toBeDefined();
    expect(userRole.company_id).toBe(company.company_id);
    expect(userRole.store_id).toBe(store.store_id);

    // AND: is_client_user flag is set
    const createdUser = await prismaClient.user.findUnique({
      where: { user_id: body.data.user_id },
    });
    expect(createdUser?.is_client_user).toBe(true);

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: { user_id: body.data.user_id },
    });
    await prismaClient.user.delete({ where: { user_id: body.data.user_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.user.delete({
      where: { user_id: companyOwner.user_id },
    });
  });

  test("[P0-BR-CU-002] should reject CLIENT_USER creation without company_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    if (!clientUserRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Client User",
      email: `clientuser-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "COMPANY",
          // Missing company_id
          store_id: "00000000-0000-0000-0000-000000000000",
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
    expect(body.message).toContain("Company ID is required");
  });

  test("[P0-BR-CU-003] should reject CLIENT_USER creation without store_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const companyOwner = await prismaClient.user.create({
      data: createUser(),
    });

    const company = await prismaClient.company.create({
      data: createCompany({
        owner_user_id: companyOwner.user_id,
      }),
    });

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    if (!clientUserRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Client User",
      email: `clientuser-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "COMPANY",
          company_id: company.company_id,
          // Missing store_id
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
    expect(body.message).toContain("Store ID is required");

    // Cleanup
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.user.delete({
      where: { user_id: companyOwner.user_id },
    });
  });

  test("[P0-BR-CU-004] should reject CLIENT_USER when store does not belong to company (security)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Two companies with stores
    const owner1 = await prismaClient.user.create({
      data: createUser(),
    });
    const company1 = await prismaClient.company.create({
      data: createCompany({
        owner_user_id: owner1.user_id,
      }),
    });
    const store1 = await prismaClient.store.create({
      data: createStore({
        company_id: company1.company_id,
      }),
    });

    const owner2 = await prismaClient.user.create({
      data: createUser(),
    });
    const company2 = await prismaClient.company.create({
      data: createCompany({
        owner_user_id: owner2.user_id,
      }),
    });
    const store2 = await prismaClient.store.create({
      data: createStore({
        company_id: company2.company_id,
      }),
    });

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    if (!clientUserRole) {
      test.skip();
      return;
    }

    // WHEN: Attempting to assign store from company2 to company1
    const userData = {
      name: "Test Client User",
      email: `clientuser-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "COMPANY",
          company_id: company1.company_id, // Company 1
          store_id: store2.store_id, // Store from Company 2
        },
      ],
    };

    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: Request is rejected with security error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain(
      "Store does not belong to the specified company",
    );

    // Cleanup
    await prismaClient.store.delete({ where: { store_id: store1.store_id } });
    await prismaClient.store.delete({ where: { store_id: store2.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company1.company_id },
    });
    await prismaClient.company.delete({
      where: { company_id: company2.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner1.user_id } });
    await prismaClient.user.delete({ where: { user_id: owner2.user_id } });
  });

  test("[P0-BR-CU-005] should reject CLIENT_USER when company is INACTIVE", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const companyOwner = await prismaClient.user.create({
      data: createUser(),
    });

    const company = await prismaClient.company.create({
      data: createCompany({
        owner_user_id: companyOwner.user_id,
        status: "INACTIVE",
      }),
    });

    const store = await prismaClient.store.create({
      data: createStore({
        company_id: company.company_id,
      }),
    });

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    if (!clientUserRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Client User",
      email: `clientuser-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "COMPANY",
          company_id: company.company_id,
          store_id: store.store_id,
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
    expect(body.message).toContain(
      "Cannot assign CLIENT_USER to an inactive company",
    );

    // Cleanup
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.user.delete({
      where: { user_id: companyOwner.user_id },
    });
  });

  test("[P0-BR-CU-006] should reject CLIENT_USER when store is INACTIVE", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const companyOwner = await prismaClient.user.create({
      data: createUser(),
    });

    const company = await prismaClient.company.create({
      data: createCompany({
        owner_user_id: companyOwner.user_id,
      }),
    });

    const store = await prismaClient.store.create({
      data: createStore({
        company_id: company.company_id,
        status: "INACTIVE",
      }),
    });

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    if (!clientUserRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Client User",
      email: `clientuser-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "COMPANY",
          company_id: company.company_id,
          store_id: store.store_id,
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
    expect(body.message).toContain(
      "Cannot assign CLIENT_USER to an inactive store",
    );

    // Cleanup
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.user.delete({
      where: { user_id: companyOwner.user_id },
    });
  });

  test("[P0-BR-CU-007] should reject CLIENT_USER when company does not exist", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const fakeCompanyId = "00000000-0000-0000-0000-000000000000";
    const fakeStoreId = "11111111-1111-1111-1111-111111111111";

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    if (!clientUserRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Client User",
      email: `clientuser-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "COMPANY",
          company_id: fakeCompanyId,
          store_id: fakeStoreId,
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
    expect(body.message).toContain("Company with ID");
    expect(body.message).toContain("not found");
  });

  test("[P0-BR-CU-008] should reject CLIENT_USER when store does not exist", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const companyOwner = await prismaClient.user.create({
      data: createUser(),
    });

    const company = await prismaClient.company.create({
      data: createCompany({
        owner_user_id: companyOwner.user_id,
      }),
    });

    const fakeStoreId = "00000000-0000-0000-0000-000000000000";

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    if (!clientUserRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Client User",
      email: `clientuser-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "COMPANY",
          company_id: company.company_id,
          store_id: fakeStoreId,
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
    expect(body.message).toContain("Store with ID");
    expect(body.message).toContain("not found");

    // Cleanup
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.user.delete({
      where: { user_id: companyOwner.user_id },
    });
  });

  test("[P0-SEC] should require SUPERADMIN permission to create CLIENT_USER", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    const companyOwner = await prismaClient.user.create({
      data: createUser(),
    });

    const company = await prismaClient.company.create({
      data: createCompany({
        owner_user_id: companyOwner.user_id,
      }),
    });

    const store = await prismaClient.store.create({
      data: createStore({
        company_id: company.company_id,
      }),
    });

    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    if (!clientUserRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Client User",
      email: `clientuser-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "COMPANY",
          company_id: company.company_id,
          store_id: store.store_id,
        },
      ],
    };

    // WHEN: CLIENT_USER (not SUPERADMIN) attempts to create user
    const response = await clientUserApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: Request is rejected with 403
    expect(response.status()).toBe(403);

    // Cleanup
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.user.delete({
      where: { user_id: companyOwner.user_id },
    });
  });

  test("[P0-SEC] should validate UUID format for company_id and store_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    if (!clientUserRole) {
      test.skip();
      return;
    }

    const userData = {
      name: "Test Client User",
      email: `clientuser-${Date.now()}@test.com`,
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "COMPANY",
          company_id: "invalid-uuid",
          store_id: "invalid-uuid",
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
    expect(body.message).toContain("Invalid");
  });
});
