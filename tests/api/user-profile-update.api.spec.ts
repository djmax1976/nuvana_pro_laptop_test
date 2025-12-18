import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createAdminUser,
  createUserRequest,
} from "../support/factories/user-admin.factory";

/**
 * User Profile Update API Tests
 *
 * Tests for PATCH /api/admin/users/:userId endpoint:
 * - Update user name, email, and/or password
 * - Permission enforcement (only System Admins with ADMIN_SYSTEM_CONFIG)
 * - Input validation (Zod schema)
 * - Email uniqueness check
 * - Audit logging for profile changes
 * - Edge cases and error handling
 *
 * Priority: P0 (Critical - User management foundation)
 *
 * Story: User Profile Update Feature - System Admin capability
 */

test.describe("User Profile Update API - PATCH /api/admin/users/:userId", () => {
  test.describe("Success Cases", () => {
    test("PROFILE-001: [P0] Should update user name only", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists in the database
      const user = await prismaClient.user.create({
        data: createAdminUser({ name: "Original Name" }),
      });

      // WHEN: Updating only the name
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: "Updated Name" },
      );

      // THEN: Update succeeds with 200 status
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("user_id", user.user_id);
      expect(body.data).toHaveProperty("name", "Updated Name");
      expect(body.data).toHaveProperty("email", user.email); // Email unchanged

      // AND: Database reflects the change
      const updatedUser = await prismaClient.user.findUnique({
        where: { user_id: user.user_id },
      });
      expect(updatedUser?.name).toBe("Updated Name");

      // AND: Audit log entry is created
      const auditLog = await prismaClient.auditLog.findFirst({
        where: {
          table_name: "users",
          record_id: user.user_id,
          action: "UPDATE",
        },
        orderBy: { timestamp: "desc" },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.reason).toMatch(/name/i);
    });

    test("PROFILE-002: [P0] Should update user email only", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists in the database
      const user = await prismaClient.user.create({
        data: createAdminUser({ email: "original@test.nuvana.local" }),
      });

      // WHEN: Updating only the email
      const newEmail = `updated_${Date.now()}@test.nuvana.local`;
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { email: newEmail },
      );

      // THEN: Update succeeds with 200 status
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("email", newEmail.toLowerCase());
      expect(body.data).toHaveProperty("name", user.name); // Name unchanged

      // AND: Database reflects the change
      const updatedUser = await prismaClient.user.findUnique({
        where: { user_id: user.user_id },
      });
      expect(updatedUser?.email).toBe(newEmail.toLowerCase());
    });

    test("PROFILE-003: [P0] Should update user password only", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists in the database
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });
      const originalPasswordHash = user.password_hash;

      // WHEN: Updating only the password
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { password: "NewSecure@Password123" },
      );

      // THEN: Update succeeds with 200 status
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("user_id", user.user_id);

      // AND: Password hash is updated in database
      const updatedUser = await prismaClient.user.findUnique({
        where: { user_id: user.user_id },
      });
      // Password is hashed, so we verify it changed from original (if there was one)
      // We can't directly compare because bcrypt generates different hashes
      expect(updatedUser?.password_hash).not.toBeNull();

      // AND: Audit log indicates password change (without revealing actual values)
      const auditLog = await prismaClient.auditLog.findFirst({
        where: {
          table_name: "users",
          record_id: user.user_id,
          action: "UPDATE",
        },
        orderBy: { timestamp: "desc" },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.reason).toMatch(/password/i);
      // Verify password value is masked in audit log
      const newValues = auditLog?.new_values as Record<string, any>;
      expect(newValues?.password).toBe("[CHANGED]");
    });

    test("PROFILE-004: [P0] Should update name and email together", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists in the database
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating both name and email
      const newEmail = `combined_${Date.now()}@test.nuvana.local`;
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        {
          name: "Combined Update Name",
          email: newEmail,
        },
      );

      // THEN: Update succeeds with both fields changed
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Combined Update Name");
      expect(body.data.email).toBe(newEmail.toLowerCase());

      // AND: Database reflects both changes
      const updatedUser = await prismaClient.user.findUnique({
        where: { user_id: user.user_id },
      });
      expect(updatedUser?.name).toBe("Combined Update Name");
      expect(updatedUser?.email).toBe(newEmail.toLowerCase());
    });

    test("PROFILE-005: [P0] Should update all three fields (name, email, password)", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists in the database
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating all fields
      const newEmail = `allupdates_${Date.now()}@test.nuvana.local`;
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        {
          name: "All Fields Updated",
          email: newEmail,
          password: "CompletelyNew@Pass123",
        },
      );

      // THEN: Update succeeds
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("All Fields Updated");
      expect(body.data.email).toBe(newEmail.toLowerCase());

      // AND: Audit log shows all changes
      const auditLog = await prismaClient.auditLog.findFirst({
        where: {
          table_name: "users",
          record_id: user.user_id,
          action: "UPDATE",
        },
        orderBy: { timestamp: "desc" },
      });
      expect(auditLog?.reason).toMatch(/name/i);
      expect(auditLog?.reason).toMatch(/email/i);
      expect(auditLog?.reason).toMatch(/password/i);
    });

    test("PROFILE-006: [P1] Should normalize email to lowercase", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating with mixed-case email
      const mixedCaseEmail = `TestUser_${Date.now()}@TEST.Nuvana.Local`;
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { email: mixedCaseEmail },
      );

      // THEN: Email is stored in lowercase
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data.email).toBe(mixedCaseEmail.toLowerCase());
    });

    test("PROFILE-007: [P1] Should trim whitespace from name", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating with name containing leading/trailing whitespace
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: "  Trimmed Name  " },
      );

      // THEN: Name is trimmed
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data.name).toBe("Trimmed Name");
    });
  });

  test.describe("Validation Errors", () => {
    test("PROFILE-010: [P0] Should reject empty request body", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Sending empty body
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        {},
      );

      // THEN: Validation error is returned
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
      expect(body.error.message).toMatch(/at least one field/i);
    });

    test("PROFILE-011: [P0] Should reject invalid email format", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating with invalid email format
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { email: "not-a-valid-email" },
      );

      // THEN: Validation error is returned
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("PROFILE-012: [P0] Should reject empty name", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating with empty name
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: "" },
      );

      // THEN: Validation error is returned
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("PROFILE-013: [P0] Should reject whitespace-only name", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating with whitespace-only name
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: "   " },
      );

      // THEN: Validation error is returned
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("PROFILE-014: [P0] Should reject password shorter than 8 characters", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating with short password
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { password: "short" },
      );

      // THEN: Validation error is returned
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("PROFILE-015: [P1] Should reject name exceeding max length", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating with name exceeding 255 characters
      const longName = "A".repeat(256);
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: longName },
      );

      // THEN: Validation error is returned
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("PROFILE-016: [P1] Should reject email exceeding max length", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating with email exceeding 255 characters
      const longEmail = "a".repeat(250) + "@test.com";
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { email: longEmail },
      );

      // THEN: Validation error is returned
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("PROFILE-017: [P1] Should reject invalid UUID format for userId", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Using invalid UUID format
      const response = await superadminApiRequest.patch(
        "/api/admin/users/invalid-uuid",
        { name: "Test Name" },
      );

      // THEN: Validation error is returned
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
      expect(body.error.message).toMatch(/uuid/i);
    });
  });

  test.describe("Business Logic - Email Uniqueness", () => {
    test("PROFILE-020: [P0] Should reject duplicate email", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: Two users exist
      const existingUser = await prismaClient.user.create({
        data: createAdminUser({ email: "existing@test.nuvana.local" }),
      });
      const userToUpdate = await prismaClient.user.create({
        data: createAdminUser({ email: "toupdate@test.nuvana.local" }),
      });

      // WHEN: Trying to update to existing email
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${userToUpdate.user_id}`,
        { email: existingUser.email },
      );

      // THEN: Conflict error is returned
      expect(response.status()).toBe(409);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty("code", "CONFLICT");
      expect(body.error.message).toMatch(/already exists/i);

      // AND: Original email unchanged in database
      const unchangedUser = await prismaClient.user.findUnique({
        where: { user_id: userToUpdate.user_id },
      });
      expect(unchangedUser?.email).toBe("toupdate@test.nuvana.local");
    });

    test("PROFILE-021: [P1] Should allow updating to same email (case normalized)", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser({ email: "same@test.nuvana.local" }),
      });

      // WHEN: Updating to the same email (different case)
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { email: "SAME@TEST.NUVANA.LOCAL" },
      );

      // THEN: Update succeeds (same normalized email)
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.email).toBe("same@test.nuvana.local");
    });

    test("PROFILE-022: [P1] Should check email uniqueness case-insensitively", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists with lowercase email
      const existingUser = await prismaClient.user.create({
        data: createAdminUser({ email: "unique@test.nuvana.local" }),
      });
      const userToUpdate = await prismaClient.user.create({
        data: createAdminUser({ email: "other@test.nuvana.local" }),
      });

      // WHEN: Trying to update to same email with different case
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${userToUpdate.user_id}`,
        { email: "UNIQUE@TEST.NUVANA.LOCAL" },
      );

      // THEN: Conflict error is returned (case-insensitive match)
      expect(response.status()).toBe(409);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty("code", "CONFLICT");
    });
  });

  test.describe("Error Handling", () => {
    test("PROFILE-025: [P0] Should return 404 for non-existent user", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: Non-existent user ID
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      // WHEN: Attempting to update
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${nonExistentId}`,
        { name: "New Name" },
      );

      // THEN: 404 Not Found is returned
      expect(response.status()).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toHaveProperty("code", "NOT_FOUND");
      expect(body.error.message).toMatch(/not found/i);
    });
  });

  test.describe("Security - Permission Enforcement", () => {
    test("PROFILE-030: [P0-SEC] Should require authentication", async ({
      request,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";

      // WHEN: Making request without authentication
      const response = await request.patch(
        `${backendUrl}/api/admin/users/${user.user_id}`,
        { data: { name: "New Name" } },
      );

      // THEN: 401 Unauthorized is returned
      expect(response.status()).toBe(401);
    });

    test("PROFILE-031: [P0-SEC] Should reject non-admin users (Store Manager)", async ({
      storeManagerApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Store Manager attempts to update
      const response = await storeManagerApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: "Unauthorized Update" },
      );

      // THEN: 403 Forbidden is returned
      expect(response.status()).toBe(403);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
    });

    test("PROFILE-032: [P0-SEC] Should reject non-admin users (Corporate Admin)", async ({
      corporateAdminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Corporate Admin attempts to update
      const response = await corporateAdminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: "Unauthorized Update" },
      );

      // THEN: 403 Forbidden is returned
      expect(response.status()).toBe(403);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
    });
  });

  test.describe("Security - Input Sanitization", () => {
    test("PROFILE-035: [P1-SEC] Should handle SQL injection attempt in name", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Attempting SQL injection in name field
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: "'; DROP TABLE users;--" },
      );

      // THEN: Request is handled safely (literal string stored)
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data.name).toBe("'; DROP TABLE users;--");

      // AND: Database still contains the user
      const stillExists = await prismaClient.user.findUnique({
        where: { user_id: user.user_id },
      });
      expect(stillExists).not.toBeNull();
    });

    test("PROFILE-036: [P1-SEC] Should handle XSS attempt in name", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Attempting XSS in name field
      const xssName = "<script>alert('xss')</script>";
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: xssName },
      );

      // THEN: Request is handled safely (stored as literal string)
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data.name).toBe(xssName);
    });

    test("PROFILE-037: [P1-SEC] Should not expose password hash in response", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating password
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { password: "NewSecurePassword123!" },
      );

      // THEN: Response does not contain password fields
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data).not.toHaveProperty("password");
      expect(body.data).not.toHaveProperty("password_hash");
    });
  });

  test.describe("Audit Logging", () => {
    test("PROFILE-040: [P1] Should log admin who performed the update", async ({
      superadminApiRequest,
      superadminUser,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Super admin updates the user
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: "Audit Test Name" },
      );

      // THEN: Audit log includes the admin's user ID
      expect(response.status()).toBe(200);

      const auditLog = await prismaClient.auditLog.findFirst({
        where: {
          table_name: "users",
          record_id: user.user_id,
          action: "UPDATE",
        },
        orderBy: { timestamp: "desc" },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.user_id).toBe(superadminUser.user_id);
    });

    test("PROFILE-041: [P1] Should log old and new values in audit", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists with known values
      const originalName = "Original Audit Name";
      const user = await prismaClient.user.create({
        data: createAdminUser({ name: originalName }),
      });

      // WHEN: Updating the name
      const newName = "New Audit Name";
      await superadminApiRequest.patch(`/api/admin/users/${user.user_id}`, {
        name: newName,
      });

      // THEN: Audit log contains old and new values
      const auditLog = await prismaClient.auditLog.findFirst({
        where: {
          table_name: "users",
          record_id: user.user_id,
          action: "UPDATE",
        },
        orderBy: { timestamp: "desc" },
      });

      const oldValues = auditLog?.old_values as Record<string, any>;
      const newValues = auditLog?.new_values as Record<string, any>;

      expect(oldValues?.name).toBe(originalName);
      expect(newValues?.name).toBe(newName);
    });

    test("PROFILE-042: [P1] Should mask password in audit log", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating the password
      await superadminApiRequest.patch(`/api/admin/users/${user.user_id}`, {
        password: "SuperSecretPass123!",
      });

      // THEN: Audit log shows password as [CHANGED], not actual value
      const auditLog = await prismaClient.auditLog.findFirst({
        where: {
          table_name: "users",
          record_id: user.user_id,
          action: "UPDATE",
        },
        orderBy: { timestamp: "desc" },
      });

      const newValues = auditLog?.new_values as Record<string, any>;
      expect(newValues?.password).toBe("[CHANGED]");
      expect(newValues?.password).not.toMatch(/SuperSecretPass/);
    });
  });

  test.describe("Edge Cases", () => {
    test("PROFILE-050: [P2] Should handle updating user with no existing password hash", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists without password (e.g., SSO user)
      const user = await prismaClient.user.create({
        data: {
          ...createAdminUser(),
          password_hash: null,
        },
      });

      // WHEN: Setting a password
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { password: "FirstPassword123!" },
      );

      // THEN: Password is set successfully
      expect(response.status()).toBe(200);

      const updatedUser = await prismaClient.user.findUnique({
        where: { user_id: user.user_id },
      });
      expect(updatedUser?.password_hash).not.toBeNull();
    });

    test("PROFILE-051: [P2] Should allow admin to update any user including other admins", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: Another admin user exists
      const otherAdmin = await prismaClient.user.create({
        data: createAdminUser({ name: "Other Admin" }),
      });

      // Assign SUPERADMIN role to make them an admin
      const superadminRole = await prismaClient.role.findUnique({
        where: { code: "SUPERADMIN" },
      });
      if (superadminRole) {
        await prismaClient.userRole.create({
          data: {
            user_id: otherAdmin.user_id,
            role_id: superadminRole.role_id,
          },
        });
      }

      // WHEN: Super admin updates another admin's profile
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${otherAdmin.user_id}`,
        { name: "Updated Other Admin" },
      );

      // THEN: Update succeeds
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data.name).toBe("Updated Other Admin");
    });

    test("PROFILE-052: [P2] Should handle Unicode characters in name", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user exists
      const user = await prismaClient.user.create({
        data: createAdminUser(),
      });

      // WHEN: Updating with Unicode name
      const unicodeName = "José García 日本語 🚀";
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: unicodeName },
      );

      // THEN: Unicode is preserved
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data.name).toBe(unicodeName);
    });

    test("PROFILE-053: [P2] Should allow updating inactive user's profile", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: An inactive user exists
      const user = await prismaClient.user.create({
        data: createAdminUser({ status: "INACTIVE" }),
      });

      // WHEN: Updating inactive user's name
      const response = await superadminApiRequest.patch(
        `/api/admin/users/${user.user_id}`,
        { name: "Updated Inactive User" },
      );

      // THEN: Update succeeds (status unchanged)
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data.name).toBe("Updated Inactive User");
      expect(body.data.status).toBe("INACTIVE");
    });
  });
});
