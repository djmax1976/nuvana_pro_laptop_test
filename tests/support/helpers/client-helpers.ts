/**
 * Client Helper Functions
 *
 * Helper functions for creating and managing client test data via API.
 * These functions ensure complete client creation (User + Client + UserRole)
 * which is required for PUT/UPDATE operations.
 */

import { createClient, type ClientData } from "../factories";

/**
 * Creates a complete client via API (User + Client + UserRole)
 *
 * This helper should be used when tests need to perform UPDATE operations
 * on clients, as the backend requires the User/UserRole associations.
 *
 * @param apiRequest - API request helper with authentication
 * @param overrides - Optional fields to override default client data
 * @returns Promise resolving to created client data with client_id
 *
 * @example
 * const client = await createClientViaAPI(superadminApiRequest, {
 *   name: "Test Client",
 *   status: "ACTIVE"
 * });
 *
 * // Now safe to use in PUT operations
 * await superadminApiRequest.put(`/api/clients/${client.client_id}`, {...});
 */
export async function createClientViaAPI(
  apiRequest: any,
  overrides: Partial<ClientData> = {},
): Promise<any> {
  // Generate client data using factory
  const clientData = createClient(overrides);

  // Create client via API with required password field
  const response = await apiRequest.post("/api/clients", {
    name: clientData.name,
    email: clientData.email,
    password: "TestPassword123!", // Required for User creation
    status: clientData.status,
    metadata: clientData.metadata,
  });

  if (response.status() !== 201) {
    const error = await response.text();
    throw new Error(
      `Failed to create client via API: ${response.status()} - ${error}`,
    );
  }

  const body = await response.json();
  return body.data;
}

/**
 * Creates multiple clients via API
 *
 * @param apiRequest - API request helper with authentication
 * @param count - Number of clients to create
 * @returns Promise resolving to array of created client data
 *
 * @example
 * const clients = await createClientsViaAPI(superadminApiRequest, 3);
 */
export async function createClientsViaAPI(
  apiRequest: any,
  count: number,
): Promise<any[]> {
  const promises = Array.from({ length: count }, () =>
    createClientViaAPI(apiRequest),
  );
  return Promise.all(promises);
}

/**
 * Creates a client with specific status via API
 *
 * @param apiRequest - API request helper with authentication
 * @param status - Client status (ACTIVE or INACTIVE)
 * @returns Promise resolving to created client data
 *
 * @example
 * const inactiveClient = await createClientWithStatusViaAPI(
 *   superadminApiRequest,
 *   "INACTIVE"
 * );
 */
export async function createClientWithStatusViaAPI(
  apiRequest: any,
  status: "ACTIVE" | "INACTIVE",
): Promise<any> {
  return createClientViaAPI(apiRequest, { status });
}
