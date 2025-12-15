/**
 * Test Helper: Create User with Role
 *
 * Helper function to create a user with password and assigned role for authentication tests.
 * Ensures users can login successfully by having proper role assignments.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { faker } from "@faker-js/faker";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";

export interface CreateUserWithRoleInput {
  email?: string;
  name?: string;
  password?: string;
  roleCode?: string; // Default: "CASHIER" (least privileged role)
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
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

  // Get the role
  const role = await prisma.role.findUnique({
    where: { code: roleCode },
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

  // Assign role to user
  const userRole = await prisma.userRole.create({
    data: {
      user_id: user.user_id,
      role_id: role.role_id,
    },
  });

  // Ensure password_hash is not null (we always create it)
  if (!user.password_hash) {
    throw new Error("Password hash should not be null");
  }

  return {
    user: {
      ...user,
      password_hash: user.password_hash,
    },
    userRole,
    password, // Return plain password for login tests
  };
}
