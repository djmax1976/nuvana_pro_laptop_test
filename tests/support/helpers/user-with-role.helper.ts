/**
 * Test Helper: Create User with Role
 *
 * Helper function to create a user with password and assigned role for authentication tests.
 * Ensures users can login successfully by having proper role assignments.
 * Also populates the Redis cache for RBAC to bypass RLS issues in tests.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { faker } from "@faker-js/faker";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";
import {
  populateUserRolesCache,
  CachedUserRole,
} from "../fixtures/rbac.fixture";

export interface CreateUserWithRoleInput {
  email?: string;
  name?: string;
  password?: string;
  roleCode?: string; // Default: "CASHIER" (least privileged role)
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  storeId?: string; // Optional: Scope user role to specific store
  companyId?: string; // Optional: Scope user role to specific company
}

export interface UserWithRoleResult {
  user: {
    user_id: string;
    public_id: string;
    email: string;
    name: string;
    password_hash: string;
    status: string;
  };
  userRole: {
    user_role_id: string;
    user_id: string;
    role_id: string;
  };
  password: string; // Return plain password for login tests
}

/**
 * Create a user with password and role assignment for authentication tests
 *
 * @param prisma - Prisma client instance
 * @param input - Optional overrides for user data
 * @returns User with role and plain password
 *
 * @example
 * // Create user with default CASHIER role
 * const { user, password } = await createUserWithRole(prisma);
 * // Login with user.email and password
 *
 * // Create user with specific role
 * const { user, password } = await createUserWithRole(prisma, {
 *   roleCode: "STORE_MANAGER"
 * });
 */
export async function createUserWithRole(
  prisma: PrismaClient,
  input: CreateUserWithRoleInput = {},
): Promise<UserWithRoleResult> {
  const email =
    input.email ||
    `test_${Date.now()}-${Math.random().toString(36).substring(2, 9)}@test.nuvana.local`;
  const name = input.name || faker.person.fullName();
  const password = input.password || "TestPassword123!";
  const status = input.status || "ACTIVE";
  const roleCode = input.roleCode || "CASHIER"; // Default to least privileged role

  // Hash password
  const saltRounds = 10;
  const password_hash = await bcrypt.hash(password, saltRounds);

  // Get the role with permissions
  const role = await prisma.role.findUnique({
    where: { code: roleCode },
    include: {
      role_permissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  if (!role) {
    throw new Error(`Role ${roleCode} not found. Please run RBAC seed script.`);
  }

  // Create user
  const user = await prisma.user.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password_hash,
      status,
    },
  });

  // Assign role to user with optional store/company scoping
  const userRole = await prisma.userRole.create({
    data: {
      user_id: user.user_id,
      role_id: role.role_id,
      store_id: input.storeId || null,
      company_id: input.companyId || null,
    },
  });

  // Ensure password_hash is not null (we always create it)
  if (!user.password_hash) {
    throw new Error("Password hash should not be null");
  }

  // Populate Redis cache for RBAC to bypass RLS issues
  // This is necessary because the rbacService.getUserRoles() queries user_roles
  // table which has RLS policies that block access in test contexts
  const permissions = role.role_permissions.map((rp) => rp.permission.code);
  const cachedRole: CachedUserRole = {
    user_role_id: userRole.user_role_id,
    user_id: user.user_id,
    role_id: role.role_id,
    role_code: role.code,
    scope: role.scope as "SYSTEM" | "COMPANY" | "STORE" | "CLIENT",
    client_id: null,
    company_id: input.companyId || null,
    store_id: input.storeId || null,
    permissions,
  };
  await populateUserRolesCache(user.user_id, [cachedRole]);

  return {
    user: {
      ...user,
      password_hash: user.password_hash,
    },
    userRole,
    password, // Return plain password for login tests
  };
}
