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
 * Uses upsert to prevent race conditions in concurrent scenarios
 * @param authProviderId - Supabase user ID (from token sub field)
 * @param email - User email from Supabase token
 * @param name - User name from Supabase token (optional)
 * @returns User record from database
 */
export async function getUserOrCreate(
  authProviderId: string,
  email: string,
  name?: string,
) {
  try {
    // Use upsert to atomically get or create user
    // This prevents race conditions where multiple concurrent requests
    // try to create the same user simultaneously
    const user = await prisma.user.upsert({
      where: {
        auth_provider_id: authProviderId,
      },
      update: {
        // Update email/name if they've changed in the auth provider
        email,
        name: name || email.split("@")[0],
      },
      create: {
        email,
        name: name || email.split("@")[0], // Use email prefix if name not provided
        auth_provider_id: authProviderId,
        status: "ACTIVE",
      },
    });

    return user;
  } catch (error: any) {
    // Handle unique constraint violation on email
    // This can happen if a user already exists with the same email but different auth_provider_id
    if (error.code === "P2002") {
      // Find existing user by auth_provider_id and return it
      const existingUser = await prisma.user.findFirst({
        where: {
          auth_provider_id: authProviderId,
        },
      });

      if (existingUser) {
        return existingUser;
      }

      // If we still can't find the user, throw the original error
      throw error;
    }

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
