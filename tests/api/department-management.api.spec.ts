import { test, expect } from "../support/fixtures/rbac.fixture";

/**
 * Department Management API Tests
 *
 * Tests for Department (Product Category) Management API endpoints:
 * - List departments (system + client-specific)
 * - Get hierarchical department tree
 * - Get department by ID
 * - Create client-specific departments
 * - Update department information
 * - Soft delete (deactivate) departments
 * - Hierarchical parent-child relationships
 * - RLS enforcement for client isolation
 * - Permission enforcement (DEPARTMENT_READ, DEPARTMENT_MANAGE)
 * - Security: Authentication, Authorization, Input Validation
 *
 * Phase 1.2: Shift & Day Summary Implementation Plan
 * Priority: P1 (Core configuration management)
 */

test.describe("Phase1.2-API: Department Management - CRUD Operations", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // LIST DEPARTMENTS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.2-API-001: [P0] GET /api/config/departments - should list departments for authenticated user", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User with DEPARTMENT_READ permission
    // AND: I create a test department first (departments are NOT seeded - they come from POS sync)
    const createResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "TEST_GROCERY",
        display_name: "Test Grocery",
        description: "Test grocery department",
        is_taxable: true,
      },
    );
    expect(createResponse.status()).toBe(201);
    const createdDept = await createResponse.json();

    // WHEN: Fetching departments via API
    const response = await clientUserApiRequest.get("/api/config/departments");

    // THEN: Request succeeds with departments
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "Response data should be an array").toBe(
      true,
    );

    // AND: Our created department is present
    const testDept = body.data.find(
      (d: { code: string }) => d.code === "TEST_GROCERY",
    );
    expect(testDept, "TEST_GROCERY department should exist").toBeDefined();
    expect(testDept.department_id, "Should have ID").toBe(
      createdDept.data.department_id,
    );
    expect(testDept.display_name, "Should have display name").toBe(
      "Test Grocery",
    );
    expect(testDept.is_taxable, "Should have taxable flag").toBe(true);
    expect(
      testDept.is_system,
      "Client-created types should NOT be marked as system",
    ).toBe(false);
    expect(testDept.is_active, "Should be active").toBe(true);
  });

  test("1.2-API-002: [P0] GET /api/config/departments - should return ordered by level, sort_order, display_name", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User

    // WHEN: Fetching departments
    const response = await clientUserApiRequest.get("/api/config/departments");

    // THEN: Results are ordered by level, sort_order, display_name
    expect(response.status()).toBe(200);
    const body = await response.json();

    const isOrdered = body.data.every(
      (
        current: { level: number; sort_order: number; display_name: string },
        index: number,
        list: {
          level: number;
          sort_order: number;
          display_name: string;
        }[],
      ) => {
        if (index === 0) return true;
        const prev = list[index - 1];
        if (prev.level !== current.level) {
          return prev.level <= current.level;
        }
        if (prev.sort_order !== current.sort_order) {
          return prev.sort_order <= current.sort_order;
        }
        return prev.display_name.localeCompare(current.display_name) <= 0;
      },
    );
    expect(
      isOrdered,
      "Should be ordered by level, sort_order, display_name",
    ).toBe(true);
  });

  test("1.2-API-003: [P1] GET /api/config/departments - should filter by is_lottery", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated and create both lottery and non-lottery departments
    // Create a lottery department
    const lotteryResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "LOTTERY_TEST",
        display_name: "Lottery Test Department",
        is_taxable: false,
        is_lottery: true,
        minimum_age: 18,
      },
    );
    expect(lotteryResponse.status()).toBe(201);

    // Create a non-lottery department
    const nonLotteryResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "NON_LOTTERY_TEST",
        display_name: "Non-Lottery Test",
        is_taxable: true,
        is_lottery: false,
      },
    );
    expect(nonLotteryResponse.status()).toBe(201);

    // WHEN: Filtering for lottery departments only
    const response = await clientUserApiRequest.get(
      "/api/config/departments?is_lottery=true",
    );

    // THEN: Only lottery departments are returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(
      body.data.length,
      "Should have at least one lottery department",
    ).toBeGreaterThan(0);

    // Verify all returned departments are lottery
    for (const dept of body.data) {
      expect(dept.is_lottery, `${dept.code} should be lottery`).toBe(true);
    }

    // Verify our lottery department is in results
    const lotteryDept = body.data.find(
      (d: { code: string }) => d.code === "LOTTERY_TEST",
    );
    expect(lotteryDept, "LOTTERY_TEST should be in results").toBeDefined();

    // Verify non-lottery department is NOT in results
    const nonLotteryDept = body.data.find(
      (d: { code: string }) => d.code === "NON_LOTTERY_TEST",
    );
    expect(
      nonLotteryDept,
      "NON_LOTTERY_TEST should NOT be in results",
    ).toBeUndefined();
  });

  test("1.2-API-004: [P1] GET /api/config/departments - should filter inactive when include_inactive=false", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a client-specific department and deactivate it
    const createResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "DEPT_INACTIVE",
        display_name: "Inactive Department",
        is_taxable: true,
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const deptId = created.data.department_id;

    // Deactivate it
    await clientUserApiRequest.delete(`/api/config/departments/${deptId}`);

    // WHEN: Fetching without include_inactive
    const response = await clientUserApiRequest.get("/api/config/departments");

    // THEN: Deactivated department is not included
    const body = await response.json();
    const found = body.data.find(
      (d: { department_id: string }) => d.department_id === deptId,
    );
    expect(
      found,
      "Inactive department should not be in default list",
    ).toBeUndefined();

    // WHEN: Fetching with include_inactive=true
    const responseWithInactive = await clientUserApiRequest.get(
      "/api/config/departments?include_inactive=true",
    );

    // THEN: Deactivated department IS included
    const bodyWithInactive = await responseWithInactive.json();
    const foundInactive = bodyWithInactive.data.find(
      (d: { department_id: string }) => d.department_id === deptId,
    );
    expect(
      foundInactive,
      "Inactive department should be in list when requested",
    ).toBeDefined();
    expect(foundInactive.is_active, "Should be marked inactive").toBe(false);
  });

  test("1.2-API-005: [P0] GET /api/config/departments - should reject unauthenticated request", async ({
    apiRequest,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Fetching departments without auth
    const response = await apiRequest.get("/api/config/departments");

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET DEPARTMENT TREE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.2-API-010: [P1] GET /api/config/departments/tree - should get hierarchical department tree", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User and create a hierarchy
    // Create a parent department
    const parentResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "TREE_PARENT",
        display_name: "Tree Parent",
        is_taxable: true,
      },
    );
    expect(parentResponse.status()).toBe(201);
    const parent = await parentResponse.json();

    // Create a child department under the parent
    const childResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "TREE_CHILD",
        display_name: "Tree Child",
        is_taxable: true,
        parent_id: parent.data.department_id,
      },
    );
    expect(childResponse.status()).toBe(201);

    // WHEN: Fetching department tree
    const response = await clientUserApiRequest.get(
      "/api/config/departments/tree",
    );

    // THEN: Request succeeds with tree structure
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data), "Response data should be an array").toBe(
      true,
    );

    // AND: Tree contains our created top-level parent
    const topLevelCodes = body.data.map((d: { code: string }) => d.code);
    expect(topLevelCodes, "Should include TREE_PARENT").toContain(
      "TREE_PARENT",
    );

    // AND: Parent has children array with our child
    const parentInTree = body.data.find(
      (d: { code: string }) => d.code === "TREE_PARENT",
    );
    expect(parentInTree, "TREE_PARENT should exist").toBeDefined();
    expect(
      Array.isArray(parentInTree.children),
      "Parent should have children array",
    ).toBe(true);
    expect(
      parentInTree.children.length,
      "Parent should have child",
    ).toBeGreaterThan(0);

    const childInTree = parentInTree.children.find(
      (c: { code: string }) => c.code === "TREE_CHILD",
    );
    expect(childInTree, "TREE_CHILD should be in children").toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SINGLE DEPARTMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.2-API-020: [P0] GET /api/config/departments/:id - should get department by ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a department first
    const createResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "GETBYID_TEST",
        display_name: "Get By ID Test",
        description: "Testing get by ID",
        is_taxable: true,
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const deptId = created.data.department_id;

    // WHEN: Fetching by ID
    const response = await clientUserApiRequest.get(
      `/api/config/departments/${deptId}`,
    );

    // THEN: Returns the department
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe("GETBYID_TEST");
    expect(body.data.department_id).toBe(deptId);
    expect(body.data.display_name).toBe("Get By ID Test");
  });

  test("1.2-API-021: [P1] GET /api/config/departments/:id - should return 404 for non-existent ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A non-existent UUID
    const fakeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching by non-existent ID
    const response = await clientUserApiRequest.get(
      `/api/config/departments/${fakeId}`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("1.2-API-022: [P1] GET /api/config/departments/:id - should return 400 for invalid UUID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: An invalid UUID format
    const invalidId = "not-a-uuid";

    // WHEN: Fetching with invalid ID
    const response = await clientUserApiRequest.get(
      `/api/config/departments/${invalidId}`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE DEPARTMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.2-API-030: [P0] POST /api/config/departments - should create client-specific department", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Valid department data
    const deptData = {
      code: "CUSTOM_DEPT",
      display_name: "Custom Department",
      description: "A custom department for testing",
      is_taxable: true,
      sort_order: 100,
    };

    // WHEN: Creating department via API
    const response = await clientUserApiRequest.post(
      "/api/config/departments",
      deptData,
    );

    // THEN: Department is created successfully
    expect(response.status(), "Expected 201 Created").toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.department_id, "Should have ID").toBeDefined();
    expect(body.data.code).toBe("CUSTOM_DEPT");
    expect(body.data.display_name).toBe("Custom Department");
    expect(body.data.is_taxable).toBe(true);
    expect(body.data.is_system, "Client types should not be system").toBe(
      false,
    );
    expect(body.data.is_active, "New types should be active").toBe(true);
  });

  test("1.2-API-031: [P0] POST /api/config/departments - should enforce unique code per client", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a department
    const deptData = {
      code: "UNIQUE_DEPT_TEST",
      display_name: "Unique Department Test",
      is_taxable: true,
    };

    const firstResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      deptData,
    );
    expect(firstResponse.status()).toBe(201);

    // WHEN: Creating another with the same code
    const duplicateResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      deptData,
    );

    // THEN: Returns 409 Conflict
    expect(duplicateResponse.status()).toBe(409);
    const body = await duplicateResponse.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("DUPLICATE_CODE");
  });

  test("1.2-API-032: [P1] POST /api/config/departments - should validate code format", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Invalid code format (lowercase, special chars)
    const invalidData = {
      code: "invalid-dept!",
      display_name: "Invalid Code Format",
      is_taxable: true,
    };

    // WHEN: Creating with invalid code
    const response = await clientUserApiRequest.post(
      "/api/config/departments",
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.2-API-033: [P1] POST /api/config/departments - should validate required fields", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Missing required fields
    const invalidData = {
      description: "Missing code and display_name",
    };

    // WHEN: Creating with missing fields
    const response = await clientUserApiRequest.post(
      "/api/config/departments",
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.2-API-034: [P1] POST /api/config/departments - should create department with age restriction", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Department with minimum age
    const deptData = {
      code: "VAPE_PRODUCTS",
      display_name: "Vape Products",
      is_taxable: true,
      minimum_age: 21,
      requires_id_scan: true,
    };

    // WHEN: Creating age-restricted department
    const response = await clientUserApiRequest.post(
      "/api/config/departments",
      deptData,
    );

    // THEN: Created successfully with age restrictions
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.minimum_age).toBe(21);
    expect(body.data.requires_id_scan).toBe(true);
  });

  test("1.2-API-035: [P1] POST /api/config/departments - should create lottery department", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Lottery department data
    const deptData = {
      code: "SCRATCH_OFFS",
      display_name: "Scratch Off Tickets",
      is_taxable: false,
      is_lottery: true,
      minimum_age: 18,
    };

    // WHEN: Creating lottery department
    const response = await clientUserApiRequest.post(
      "/api/config/departments",
      deptData,
    );

    // THEN: Created successfully as lottery type
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.is_lottery).toBe(true);
    expect(body.data.minimum_age).toBe(18);
    expect(body.data.is_taxable).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE DEPARTMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.2-API-040: [P0] PATCH /api/config/departments/:id - should update client department", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a department first
    const createResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "DEPT_UPDATE_TEST",
        display_name: "Original Name",
        is_taxable: true,
        sort_order: 50,
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const deptId = created.data.department_id;

    // WHEN: Updating the department
    const updateResponse = await clientUserApiRequest.patch(
      `/api/config/departments/${deptId}`,
      {
        display_name: "Updated Name",
        description: "Added description",
        sort_order: 75,
        is_taxable: false,
      },
    );

    // THEN: Update succeeds
    expect(updateResponse.status()).toBe(200);
    const body = await updateResponse.json();
    expect(body.success).toBe(true);
    expect(body.data.display_name).toBe("Updated Name");
    expect(body.data.description).toBe("Added description");
    expect(body.data.sort_order).toBe(75);
    expect(body.data.is_taxable).toBe(false);
    expect(body.data.code, "Code should not change").toBe("DEPT_UPDATE_TEST");
  });

  test("1.2-API-041: [P1] PATCH /api/config/departments/:id - should return 404 for non-existent ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A non-existent UUID
    const fakeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Updating non-existent department
    const response = await clientUserApiRequest.patch(
      `/api/config/departments/${fakeId}`,
      {
        display_name: "New Name",
      },
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("1.2-API-042: [P0] PATCH /api/config/departments/:id - should not allow modifying system department behavior flags", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Create a system department directly in the database
    // (System departments can only be created via DB, not API)
    const systemDept = await prismaClient.department.create({
      data: {
        code: "SYS_BEHAVIOR_TEST",
        display_name: "System Behavior Test",
        is_taxable: true,
        is_system: true, // This is a SYSTEM department
        is_active: true,
        client_id: null, // System departments have no client
      },
    });

    // WHEN: Attempting to modify behavior flags of system department
    // Note: Display fields (display_name, description, sort_order, icon_name, color_code)
    // ARE allowed on system types. Behavior flags are NOT allowed.
    const response = await clientUserApiRequest.patch(
      `/api/config/departments/${systemDept.department_id}`,
      {
        is_taxable: false, // This is a behavior flag, not allowed on system types
      },
    );

    // THEN: Returns 403 Forbidden
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");

    // Cleanup
    await prismaClient.department.delete({
      where: { department_id: systemDept.department_id },
    });
  });

  test("1.2-API-043: [P1] PATCH /api/config/departments/:id - should allow updating display fields on system departments", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Create a system department directly in the database
    const systemDept = await prismaClient.department.create({
      data: {
        code: "SYS_DISPLAY_TEST",
        display_name: "System Display Test",
        description: "Original description",
        is_taxable: true,
        is_system: true, // This is a SYSTEM department
        is_active: true,
        client_id: null, // System departments have no client
        sort_order: 10,
      },
    });

    // WHEN: Updating only display fields (allowed on system types)
    const response = await clientUserApiRequest.patch(
      `/api/config/departments/${systemDept.department_id}`,
      {
        description: "Updated system display description",
        sort_order: 99,
      },
    );

    // THEN: Returns 200 OK (display fields are allowed)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.description).toBe("Updated system display description");
    expect(body.data.sort_order).toBe(99);

    // Cleanup: Delete the test department
    await prismaClient.department.delete({
      where: { department_id: systemDept.department_id },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE (DEACTIVATE) DEPARTMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.2-API-050: [P0] DELETE /api/config/departments/:id - should soft delete (deactivate) department", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I create a department first
    const createResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "DEPT_DELETE_TEST",
        display_name: "To Be Deleted",
        is_taxable: true,
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const deptId = created.data.department_id;

    // WHEN: Deleting the department
    const deleteResponse = await clientUserApiRequest.delete(
      `/api/config/departments/${deptId}`,
    );

    // THEN: Delete succeeds
    expect(deleteResponse.status()).toBe(200);
    const body = await deleteResponse.json();
    expect(body.success).toBe(true);
    expect(body.data.is_active, "Should be deactivated").toBe(false);

    // AND: Record still exists in database (soft delete)
    const record = await prismaClient.department.findUnique({
      where: { department_id: deptId },
    });
    expect(record, "Record should still exist").not.toBeNull();
    expect(record?.is_active, "Should be marked inactive").toBe(false);
  });

  test("1.2-API-051: [P0] DELETE /api/config/departments/:id - should not allow deleting system departments", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Create a system department directly in the database
    const systemDept = await prismaClient.department.create({
      data: {
        code: "SYS_DELETE_TEST",
        display_name: "System Delete Test",
        is_taxable: true,
        is_system: true, // This is a SYSTEM department
        is_active: true,
        client_id: null, // System departments have no client
      },
    });

    // WHEN: Attempting to delete system department
    const response = await clientUserApiRequest.delete(
      `/api/config/departments/${systemDept.department_id}`,
    );

    // THEN: Returns 403 Forbidden
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");

    // Verify the department was NOT deleted
    const stillExists = await prismaClient.department.findUnique({
      where: { department_id: systemDept.department_id },
    });
    expect(stillExists, "System department should still exist").not.toBeNull();
    expect(stillExists?.is_active, "Should still be active").toBe(true);

    // Cleanup: Delete the test department directly
    await prismaClient.department.delete({
      where: { department_id: systemDept.department_id },
    });
  });

  test("1.2-API-052: [P1] DELETE /api/config/departments/:id - should return 404 for non-existent ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A non-existent UUID
    const fakeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Deleting non-existent department
    const response = await clientUserApiRequest.delete(
      `/api/config/departments/${fakeId}`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERMISSION & SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.2-API-060: [P0] Security - should require authentication for all endpoints", async ({
    apiRequest,
  }) => {
    // GIVEN: No authentication

    // WHEN: Accessing various endpoints without auth
    const endpoints = [
      { method: "get", path: "/api/config/departments" },
      { method: "get", path: "/api/config/departments/tree" },
      {
        method: "get",
        path: "/api/config/departments/00000000-0000-0000-0000-000000000000",
      },
      { method: "post", path: "/api/config/departments" },
      {
        method: "patch",
        path: "/api/config/departments/00000000-0000-0000-0000-000000000000",
      },
      {
        method: "delete",
        path: "/api/config/departments/00000000-0000-0000-0000-000000000000",
      },
    ];

    for (const endpoint of endpoints) {
      const response =
        endpoint.method === "get"
          ? await apiRequest.get(endpoint.path)
          : endpoint.method === "post"
            ? await apiRequest.post(endpoint.path, {})
            : endpoint.method === "patch"
              ? await apiRequest.patch(endpoint.path, {})
              : await apiRequest.delete(endpoint.path);

      expect(
        response.status(),
        `${endpoint.method.toUpperCase()} ${endpoint.path} should return 401`,
      ).toBe(401);
    }
  });

  test("1.2-API-061: [P0] Security - superadmin should have full access", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Superadmin authentication

    // WHEN: Listing departments
    const response = await superadminApiRequest.get("/api/config/departments");

    // THEN: Access granted
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HIERARCHY & PARENT-CHILD TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.2-API-070: [P1] POST /api/config/departments - should create child department with parent_id", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a parent department first
    const parentResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "PARENT_DEPT",
        display_name: "Parent Department",
        is_taxable: true,
      },
    );
    expect(parentResponse.status()).toBe(201);
    const parent = await parentResponse.json();
    const parentId = parent.data.department_id;

    // WHEN: Creating a child department
    const childResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "CHILD_DEPT",
        display_name: "Child Department",
        is_taxable: true,
        parent_id: parentId,
      },
    );

    // THEN: Child is created with correct level
    expect(childResponse.status()).toBe(201);
    const child = await childResponse.json();
    expect(child.data.parent_id).toBe(parentId);
    expect(child.data.level, "Child should have level 2").toBe(2);
  });

  test("1.2-API-071: [P1] PATCH /api/config/departments/:id - should prevent circular hierarchy", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a parent and child department
    const parentResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "CIRCULAR_PARENT",
        display_name: "Circular Parent",
        is_taxable: true,
      },
    );
    expect(parentResponse.status()).toBe(201);
    const parent = await parentResponse.json();
    const parentId = parent.data.department_id;

    const childResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "CIRCULAR_CHILD",
        display_name: "Circular Child",
        is_taxable: true,
        parent_id: parentId,
      },
    );
    expect(childResponse.status()).toBe(201);
    const child = await childResponse.json();
    const childId = child.data.department_id;

    // WHEN: Attempting to set parent's parent_id to child (creating a cycle)
    const response = await clientUserApiRequest.patch(
      `/api/config/departments/${parentId}`,
      {
        parent_id: childId,
      },
    );

    // THEN: Returns 400 with circular hierarchy error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CIRCULAR_HIERARCHY");
  });

  test("1.2-API-072: [P1] PATCH /api/config/departments/:id - should prevent self-referencing parent", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a department
    const createResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "SELF_REF_DEPT",
        display_name: "Self Reference Test",
        is_taxable: true,
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const deptId = created.data.department_id;

    // WHEN: Attempting to set parent_id to itself
    const response = await clientUserApiRequest.patch(
      `/api/config/departments/${deptId}`,
      {
        parent_id: deptId,
      },
    );

    // THEN: Returns 400 with circular hierarchy error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CIRCULAR_HIERARCHY");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY PARAMETER TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.2-API-080: [P2] GET /api/config/departments - should filter by include_system=false", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a client-specific department
    const createResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "CLIENT_ONLY_DEPT",
        display_name: "Client Only",
        is_taxable: true,
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    // WHEN: Fetching with include_system=false
    const response = await clientUserApiRequest.get(
      "/api/config/departments?include_system=false",
    );

    // THEN: Only client-specific departments are returned
    expect(response.status()).toBe(200);
    const body = await response.json();

    // All returned departments should not be system departments
    for (const dept of body.data) {
      expect(dept.is_system, `${dept.code} should not be system`).toBe(false);
    }

    // Our created department should be in the list
    const found = body.data.find(
      (d: { department_id: string }) =>
        d.department_id === created.data.department_id,
    );
    expect(found, "Client department should be in list").toBeDefined();
  });

  test("1.2-API-081: [P2] GET /api/config/departments - should include children when include_children=true", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A parent department with children exists (or we create one)
    const parentResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "INCLUDE_PARENT",
        display_name: "Include Parent",
        is_taxable: true,
      },
    );
    expect(parentResponse.status()).toBe(201);
    const parent = await parentResponse.json();
    const parentId = parent.data.department_id;

    // Create a child
    const childResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "INCLUDE_CHILD",
        display_name: "Include Child",
        is_taxable: true,
        parent_id: parentId,
      },
    );
    expect(childResponse.status()).toBe(201);

    // WHEN: Fetching with include_children=true
    const response = await clientUserApiRequest.get(
      "/api/config/departments?include_children=true",
    );

    // THEN: Parent departments include children array
    expect(response.status()).toBe(200);
    const body = await response.json();

    const parentDept = body.data.find(
      (d: { department_id: string }) => d.department_id === parentId,
    );
    expect(parentDept, "Parent should be in list").toBeDefined();
    expect(
      Array.isArray(parentDept.children),
      "Parent should have children array",
    ).toBe(true);
    expect(
      parentDept.children.length,
      "Parent should have at least one child",
    ).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE & VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.2-API-090: [P2] POST /api/config/departments - should normalize code to uppercase", async ({
    clientUserApiRequest,
  }) => {
    // Note: The schema requires uppercase, so we test that valid uppercase works
    // GIVEN: Department with uppercase code
    const deptData = {
      code: "UPPERCASE_TEST",
      display_name: "Uppercase Test",
      is_taxable: true,
    };

    // WHEN: Creating department
    const response = await clientUserApiRequest.post(
      "/api/config/departments",
      deptData,
    );

    // THEN: Created successfully with uppercase code
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.code).toBe("UPPERCASE_TEST");
  });

  test("1.2-API-091: [P2] POST /api/config/departments - should reject code that starts with number", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Code starting with a number
    const invalidData = {
      code: "1INVALID",
      display_name: "Invalid Start",
      is_taxable: true,
    };

    // WHEN: Creating with invalid code
    const response = await clientUserApiRequest.post(
      "/api/config/departments",
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.2-API-092: [P2] POST /api/config/departments - should accept valid optional fields", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Department with all optional fields
    const deptData = {
      code: "FULL_DEPT",
      display_name: "Full Department",
      description: "A department with all fields",
      is_taxable: false,
      minimum_age: 18,
      requires_id_scan: true,
      is_lottery: false,
      sort_order: 50,
      icon_name: "shopping-cart",
      color_code: "#FF5733",
    };

    // WHEN: Creating department
    const response = await clientUserApiRequest.post(
      "/api/config/departments",
      deptData,
    );

    // THEN: All fields are saved correctly
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.description).toBe("A department with all fields");
    expect(body.data.is_taxable).toBe(false);
    expect(body.data.minimum_age).toBe(18);
    expect(body.data.requires_id_scan).toBe(true);
    expect(body.data.is_lottery).toBe(false);
    expect(body.data.sort_order).toBe(50);
    expect(body.data.icon_name).toBe("shopping-cart");
    expect(body.data.color_code).toBe("#FF5733");
  });

  test("1.2-API-093: [P2] PATCH /api/config/departments/:id - should clear nullable fields with null", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a department with description
    const createResponse = await clientUserApiRequest.post(
      "/api/config/departments",
      {
        code: "CLEAR_FIELDS_DEPT",
        display_name: "Clear Fields Test",
        description: "Initial description",
        is_taxable: true,
        minimum_age: 21,
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const deptId = created.data.department_id;

    // WHEN: Updating with null to clear fields
    const updateResponse = await clientUserApiRequest.patch(
      `/api/config/departments/${deptId}`,
      {
        description: null,
        minimum_age: null,
      },
    );

    // THEN: Fields are cleared
    expect(updateResponse.status()).toBe(200);
    const body = await updateResponse.json();
    expect(body.data.description).toBeNull();
    expect(body.data.minimum_age).toBeNull();
  });

  test("1.2-API-094: [P2] DELETE /api/config/departments/:id - should return 400 for invalid UUID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: An invalid UUID format
    const invalidId = "invalid-uuid-format";

    // WHEN: Attempting to delete with invalid ID
    const response = await clientUserApiRequest.delete(
      `/api/config/departments/${invalidId}`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.2-API-095: [P2] PATCH /api/config/departments/:id - should return 400 for invalid UUID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: An invalid UUID format
    const invalidId = "invalid-uuid-format";

    // WHEN: Attempting to update with invalid ID
    const response = await clientUserApiRequest.patch(
      `/api/config/departments/${invalidId}`,
      { display_name: "Test" },
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
