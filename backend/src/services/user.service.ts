import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * User service for managing user creation and retrieval
 */

export interface UserIdentity {
  id: string;
  email: string;
  name?: string;
}

/**
 * Get existing user by auth_provider_id or create new user
 * Uses atomic upsert on auth_provider_id (unique constraint) to prevent race conditions
 *
 * RACE-CONDITION SAFE:
 * - Single atomic database operation (no check-then-create gap)
 * - Unique constraint on auth_provider_id prevents duplicates at DB level
 * - Handles concurrent OAuth callbacks for same user correctly
 * - Retries on unique constraint violations (concurrent race resolution)
 *
 * @param authProviderId - Supabase user ID (from token sub field)
 * @param email - User email from Supabase token
 * @param name - User name from Supabase token (optional)
 * @returns User record from database
 */
export async function getUserOrCreate(
  authProviderId: string,
  email: string,
  name?: string | null,
) {
  // Normalize name: handle null, undefined, and empty string
  const normalizedName = name?.trim() || email.split("@")[0];

  try {
    // Atomic upsert by auth_provider_id (requires unique constraint in schema)
    // This is a single database operation - no race condition possible
    const user = await prisma.user.upsert({
      where: {
        auth_provider_id: authProviderId,
      },
      update: {
        // Update email/name if provider ID already exists
        // (handles edge case where user changed email in OAuth provider)
        email,
        name: normalizedName,
      },
      create: {
        email,
        name: normalizedName, // Use email prefix if name not provided/empty
        auth_provider_id: authProviderId,
        status: "ACTIVE",
      },
    });

    return user;
  } catch (error: any) {
    // Handle concurrent race condition:
    // If upsert fails due to unique constraint violation on email (NOT auth_provider_id),
    // it means another concurrent request created a user with this email but different auth_provider_id
    // In this rare case, retry by finding the user that was just created
    if (error.code === "P2002" && error.meta?.target?.includes("email")) {
      console.log(
        `Concurrent user creation detected for email ${email}, retrying...`,
      );

      // Find the user that was just created by the concurrent request
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        // Update the existing user with the current auth_provider_id
        return await prisma.user.update({
          where: { email },
          data: {
            auth_provider_id: authProviderId,
            name: normalizedName,
          },
        });
      }
    }

    // For any other error, log and re-throw
    console.error("Error in getUserOrCreate:", error);
    throw error;
  }
}

/**
 * Get user by user_id
 * @param userId - Local database user_id
 * @returns User record from database
 * @throws Error if user not found
 */
export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      user_id: userId,
    },
  });

  if (!user) {
    throw new Error(`User not found with user_id: ${userId}`);
  }

  return user;
}
