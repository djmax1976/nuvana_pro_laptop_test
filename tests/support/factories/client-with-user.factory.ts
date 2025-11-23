/**
 * Client With User Test Data Factory
 *
 * Creates complete Client+User+UserRole records for testing the unified authentication architecture.
 * This factory handles the new pattern where clients require an associated User account.
 *
 * Story: 2.6 - Client Management API with Unified Authentication
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { faker } from "@faker-js/faker";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";

/**
 * Client status enum values
 */
export type ClientStatus = "ACTIVE" | "INACTIVE";

/**
 * Input data for creating a client with user
 */
export interface CreateClientWithUserInput {
  name?: string;
  email?: string;
  password?: string;
  status?: ClientStatus;
  metadata?: Record<string, any> | null;
}

/**
 * Result of creating a client with user
 */
export interface ClientWithUserResult {
  user: {
    user_id: string;
    public_id: string;
    email: string;
    name: string;
    password_hash: string;
    status: string;
  };
  client: {
    client_id: string;
    public_id: string;
    name: string;
    email: string;
    status: string;
    metadata: any;
  };
  userRole: {
    user_role_id: string;
    user_id: string;
    role_id: string;
    client_id: string;
  };
}

/**
 * Create a complete Client+User+UserRole record set in the database
 *
 * This function mirrors the production client creation flow, creating:
 * 1. User record (for authentication)
 * 2. Client record (for business data)
 * 3. UserRole linking them with CLIENT_OWNER role
 *
 * @param prisma - Prisma client instance
 * @param input - Optional overrides for client/user data
 * @returns Complete client with user and role records
 *
 * @example
 * // Create with defaults
 * const result = await createClientWithUser(prisma);
 *
 * // Create with specific data
 * const result = await createClientWithUser(prisma, {
 *   name: 'Test Client',
 *   email: 'test@example.com',
 *   status: 'INACTIVE'
 * });
 *
 * // Access the created records
 * console.log(result.client.client_id);
 * console.log(result.user.user_id);
 */
export async function createClientWithUser(
  prisma: PrismaClient,
  input: CreateClientWithUserInput = {},
): Promise<ClientWithUserResult> {
  // Generate defaults
  const name = input.name || faker.company.name();
  const email =
    input.email ||
    `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@example.com`;
  const password = input.password || "testPassword123";
  const status = input.status || "ACTIVE";
  const metadata =
    input.metadata !== undefined
      ? input.metadata
      : {
          industry: faker.company.buzzNoun(),
          region: faker.location.state(),
          tier: faker.helpers.arrayElement([
            "enterprise",
            "standard",
            "starter",
          ]),
        };

  // Get CLIENT_OWNER role
  const clientOwnerRole = await prisma.role.findUnique({
    where: { code: "CLIENT_OWNER" },
  });

  if (!clientOwnerRole) {
    throw new Error(
      "CLIENT_OWNER role not found. Please run RBAC seed script.",
    );
  }

  // Hash password
  const saltRounds = 10;
  const password_hash = await bcrypt.hash(password, saltRounds);

  // Create User + Client + UserRole atomically
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create User record (for authentication)
    const user = await tx.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: email.trim().toLowerCase(),
        name: name.trim(),
        password_hash,
        status,
      },
    });

    // 2. Create Client record (for business data)
    const client = await tx.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        status,
        metadata: metadata ?? undefined,
      },
    });

    // 3. Link User to Client with CLIENT_OWNER role
    const userRole = await tx.userRole.create({
      data: {
        user_id: user.user_id,
        role_id: clientOwnerRole.role_id,
        client_id: client.client_id,
      },
    });

    return { user, client, userRole };
  });

  // Ensure password_hash is not null (we always create it)
  if (!result.user.password_hash) {
    throw new Error("Password hash should not be null");
  }

  // Ensure client_id is not null (we always create it)
  if (!result.userRole.client_id) {
    throw new Error("Client ID should not be null");
  }

  return {
    user: {
      ...result.user,
      password_hash: result.user.password_hash,
    },
    client: result.client,
    userRole: {
      ...result.userRole,
      client_id: result.userRole.client_id,
    },
  };
}

/**
 * Create multiple clients with users
 *
 * @param prisma - Prisma client instance
 * @param count - Number of clients to create
 * @returns Array of ClientWithUserResult objects
 *
 * @example
 * const clients = await createClientsWithUsers(prisma, 5);
 */
export async function createClientsWithUsers(
  prisma: PrismaClient,
  count: number,
): Promise<ClientWithUserResult[]> {
  const results: ClientWithUserResult[] = [];
  for (let i = 0; i < count; i++) {
    results.push(await createClientWithUser(prisma));
  }
  return results;
}

/**
 * Create a client with user with specific status
 *
 * @param prisma - Prisma client instance
 * @param status - Client status (ACTIVE or INACTIVE)
 * @returns ClientWithUserResult with specified status
 *
 * @example
 * const inactive = await createClientWithUserByStatus(prisma, 'INACTIVE');
 */
export async function createClientWithUserByStatus(
  prisma: PrismaClient,
  status: ClientStatus,
): Promise<ClientWithUserResult> {
  return createClientWithUser(prisma, { status });
}
