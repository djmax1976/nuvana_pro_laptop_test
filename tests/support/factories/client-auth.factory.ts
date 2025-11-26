/**
 * Client Authentication Test Data Factories
 *
 * Factories for Story 2.9: Client Dashboard Foundation and Authentication
 *
 * Provides test data for:
 * - Client users with is_client_user flag
 * - Client login credentials
 * - Client dashboard data structures
 *
 * NOTE: Adapted for User-Ownership model (no Client entity)
 * - Users with is_client_user=true can log in via /api/auth/client-login
 * - Client users own companies directly via Company.owner_user_id
 * - Dashboard shows companies owned by the logged-in user
 */

import { faker } from "@faker-js/faker";
import { createId } from "@paralleldrive/cuid2";
import bcrypt from "bcrypt";

/**
 * Client user data for database creation
 * Adapted for User-Ownership model (companies linked via owner_user_id, not client_id)
 */
export interface ClientUserData {
  user_id: string;
  email: string;
  name: string;
  status: string;
  password_hash: string | null;
  public_id: string;
  is_client_user: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Client login request payload
 */
export interface ClientLoginRequest {
  email: string;
  password: string;
}

/**
 * Client dashboard response data
 * Adapted for User-Ownership model - shows user info instead of client info
 */
export interface ClientDashboardData {
  user: {
    id: string;
    name: string;
    email: string;
  };
  companies: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  stores: Array<{
    id: string;
    name: string;
    status: string;
    companyName: string;
  }>;
  stats: {
    activeStores: number;
    totalEmployees: number;
  };
}

/**
 * Create a client user with is_client_user flag
 * @param overrides - Optional field overrides
 * @returns ClientUserData object
 */
export const createClientUser = (
  overrides: Partial<ClientUserData> = {},
): ClientUserData => {
  const defaultPassword = "ClientPassword123!";
  const passwordHash =
    overrides.password_hash !== null
      ? bcrypt.hashSync(defaultPassword, 10)
      : null;

  return {
    user_id: faker.string.uuid(),
    email: faker.internet.email().toLowerCase(),
    name: faker.person.fullName(),
    status: "ACTIVE",
    password_hash: passwordHash,
    public_id: createId(),
    is_client_user: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
};

/**
 * Create a client user with password for login testing
 * Returns both the user data and plain text password
 * @param overrides - Optional field overrides
 * @returns Object with user data and plain text password
 */
export const createClientUserWithPassword = (
  overrides: Partial<ClientUserData> = {},
): { user: ClientUserData; password: string } => {
  const password = overrides.password_hash
    ? "CustomPassword123!"
    : "ClientPassword123!";
  const passwordHash = bcrypt.hashSync(password, 10);

  const user = createClientUser({
    password_hash: passwordHash,
    ...overrides,
  });

  return { user, password };
};

/**
 * Create client login request payload
 * @param overrides - Optional field overrides
 * @returns ClientLoginRequest object
 */
export const createClientLoginRequest = (
  overrides: Partial<ClientLoginRequest> = {},
): ClientLoginRequest => ({
  email: faker.internet.email().toLowerCase(),
  password: "ClientPassword123!",
  ...overrides,
});

/**
 * Create mock client dashboard data
 * @param overrides - Optional field overrides
 * @returns ClientDashboardData object
 */
export const createClientDashboardData = (
  overrides: Partial<ClientDashboardData> = {},
): ClientDashboardData => ({
  user: {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email().toLowerCase(),
  },
  companies: [
    {
      id: faker.string.uuid(),
      name: faker.company.name(),
      status: "ACTIVE",
    },
  ],
  stores: [
    {
      id: faker.string.uuid(),
      name: `${faker.location.city()} Store`,
      status: "ACTIVE",
      companyName: faker.company.name(),
    },
  ],
  stats: {
    activeStores: faker.number.int({ min: 1, max: 10 }),
    totalEmployees: faker.number.int({ min: 5, max: 50 }),
  },
  ...overrides,
});

/**
 * Create multiple client users
 * @param count - Number of users to create
 * @returns Array of ClientUserData
 */
export const createClientUsers = (count: number): ClientUserData[] =>
  Array.from({ length: count }, () => createClientUser());

/**
 * Create a non-client user (regular admin user) for testing rejection
 * @param overrides - Optional field overrides
 * @returns ClientUserData object with is_client_user = false
 */
export const createNonClientUser = (
  overrides: Partial<ClientUserData> = {},
): ClientUserData => {
  return createClientUser({
    is_client_user: false,
    ...overrides,
  });
};

/**
 * Create a CLIENT_USER role assignment request
 * In User-Ownership model, client users have SYSTEM scope with limited permissions
 * @param roleId - Role ID for CLIENT_USER role
 * @param companyId - Optional company ID for scope
 * @returns Role assignment object
 */
export const createClientRoleAssignment = (
  roleId: string,
  companyId?: string,
) => ({
  role_id: roleId,
  scope_type: "SYSTEM" as const,
  company_id: companyId || null,
  store_id: null,
});
