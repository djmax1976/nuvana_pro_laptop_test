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
  // Helper function to avoid duplication
  // If name is null/undefined/empty, use email prefix as fallback
  const getNormalizedName = () => {
    if (!name || (typeof name === "string" && name.trim() === "")) {
      return email.split("@")[0];
    }
    return name.trim();
  };

  try {
    const normalizedName = getNormalizedName();

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
    // Handle duplicate email scenario:
    // If upsert fails due to unique constraint violation on email (NOT auth_provider_id),
    // it means a user with this email already exists but with a different auth_provider_id.
    // This can happen in two cases:
    // 1. Concurrent race condition (another request just created the user)
    // 2. User changed OAuth provider but kept same email (e.g., switched from Google to GitHub)
    if (error.code === "P2002" && error.meta?.target?.includes("email")) {
      console.log(
        `User with email ${email} already exists, attempting to update auth_provider_id...`,
      );

      // Find the existing user by email
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        // Check if the existing user already has this auth_provider_id
        if (existingUser.auth_provider_id === authProviderId) {
          console.log(
            `User already has auth_provider_id ${authProviderId}, returning existing user`,
          );
          return existingUser;
        }

        // Check if another user already has this auth_provider_id
        const userWithAuthId = await prisma.user.findUnique({
          where: { auth_provider_id: authProviderId },
        });

        if (userWithAuthId && userWithAuthId.user_id !== existingUser.user_id) {
          // Another user already has this auth_provider_id
          // This is a conflict - same auth_provider_id trying to claim different email
          console.error(
            `Conflict: auth_provider_id ${authProviderId} already belongs to different user ${userWithAuthId.user_id}`,
          );
          throw new Error(
            `Authentication provider ID already associated with different account`,
          );
        }

        // Safe to update the existing user's auth_provider_id
        return await prisma.user.update({
          where: { email },
          data: {
            auth_provider_id: authProviderId,
            name: getNormalizedName(),
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
