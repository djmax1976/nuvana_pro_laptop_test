import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Client Factory with Test Mode Support
 *
 * Provides a centralized way to create Supabase clients with support for
 * test mode mocking. When NODE_ENV=test and USE_SUPABASE_MOCK=true, returns
 * mock clients that simulate Supabase API responses based on OAuth code patterns.
 *
 * This allows API tests to run without external dependencies while testing the
 * full authentication flow through the backend.
 *
 * Usage in Production:
 *   const supabase = getSupabaseClient(url, key); // Real client
 *
 * Usage in Tests:
 *   NODE_ENV=test USE_SUPABASE_MOCK=true
 *   const supabase = getSupabaseClient(url, key); // Mock client
 */

/**
 * Create mock Supabase client for testing
 * Returns controlled responses based on OAuth code patterns
 */
function createMockSupabaseClient(): SupabaseClient {
  return {
    auth: {
      exchangeCodeForSession: async (code: string) => {
        // Invalid code pattern
        if (code.startsWith("invalid_")) {
          return {
            data: {
              session: null,
              user: null,
            },
            error: {
              message: "Invalid OAuth code",
              status: 401,
            },
          };
        }

        // Valid code for user with no name
        if (code === "valid_oauth_code_no_name") {
          return {
            data: {
              session: {
                access_token: "mock_access_token_no_name",
                token_type: "bearer",
                expires_in: 3600,
                refresh_token: "mock_refresh_token_no_name",
              },
              user: {
                id: "supabase_user_id_no_name",
                email: "noname@example.com",
                user_metadata: {},
                aud: "authenticated",
                role: "authenticated",
                created_at: new Date().toISOString(),
              },
            },
            error: null,
          };
        }

        // Valid code for concurrent requests
        if (code === "valid_oauth_code_concurrent") {
          return {
            data: {
              session: {
                access_token: "mock_access_token_concurrent",
                token_type: "bearer",
                expires_in: 3600,
                refresh_token: "mock_refresh_token_concurrent",
              },
              user: {
                id: "supabase_user_id_concurrent",
                email: "concurrent@example.com",
                user_metadata: {
                  name: "Concurrent User",
                  full_name: "Concurrent Test User",
                },
                aud: "authenticated",
                role: "authenticated",
                created_at: new Date().toISOString(),
              },
            },
            error: null,
          };
        }

        // Valid code for new user
        if (code === "valid_oauth_code_new_user") {
          return {
            data: {
              session: {
                access_token: "mock_access_token_new",
                token_type: "bearer",
                expires_in: 3600,
                refresh_token: "mock_refresh_token_new",
              },
              user: {
                id: "supabase_user_id_new",
                email: "newuser@example.com",
                user_metadata: {
                  name: "New User",
                  full_name: "New Test User",
                },
                aud: "authenticated",
                role: "authenticated",
                created_at: new Date().toISOString(),
              },
            },
            error: null,
          };
        }

        // Valid code for existing user
        if (code === "valid_oauth_code_existing") {
          return {
            data: {
              session: {
                access_token: "mock_access_token_existing",
                token_type: "bearer",
                expires_in: 3600,
                refresh_token: "mock_refresh_token_existing",
              },
              user: {
                id: "supabase_user_id_existing",
                email: "existing@example.com",
                user_metadata: {
                  name: "Existing User",
                  full_name: "Existing Test User",
                },
                aud: "authenticated",
                role: "authenticated",
                created_at: new Date().toISOString(),
              },
            },
            error: null,
          };
        }

        // Default valid code
        return {
          data: {
            session: {
              access_token: "mock_access_token_123",
              token_type: "bearer",
              expires_in: 3600,
              refresh_token: "mock_refresh_token_123",
            },
            user: {
              id: "supabase_user_id_123",
              email: "user@example.com",
              user_metadata: {
                name: "Test User",
                full_name: "Test User Full Name",
              },
              aud: "authenticated",
              role: "authenticated",
              created_at: new Date().toISOString(),
            },
          },
          error: null,
        };
      },

      getUser: async (token: string) => {
        // Invalid or expired token
        if (
          token.startsWith("invalid_") ||
          token.startsWith("expired_") ||
          token === "malformed_token"
        ) {
          return {
            data: {
              user: null,
            },
            error: {
              message: "Invalid or expired token",
              status: 401,
            },
          };
        }

        // Valid token
        return {
          data: {
            user: {
              id: "supabase_user_id_123",
              email: "user@example.com",
              user_metadata: {
                name: "Test User",
                full_name: "Test User Full Name",
              },
              aud: "authenticated",
              role: "authenticated",
              created_at: new Date().toISOString(),
            },
          },
          error: null,
        };
      },
    },
  } as any;
}

/**
 * Get Supabase client instance
 * Returns mock client in test environment, real client in production
 *
 * @param url - Supabase project URL
 * @param serviceKey - Supabase service role key
 * @returns SupabaseClient instance
 */
export function getSupabaseClient(
  url: string,
  serviceKey: string,
): SupabaseClient {
  // Use mock client in test mode
  if (
    process.env.NODE_ENV === "test" &&
    process.env.USE_SUPABASE_MOCK === "true"
  ) {
    console.log("Using mock Supabase client for testing");
    return createMockSupabaseClient();
  }

  // Return real Supabase client (production environment)
  return createClient(url, serviceKey);
}
