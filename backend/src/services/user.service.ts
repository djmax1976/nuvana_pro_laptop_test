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
 * Uses email-based upsert to prevent race conditions (email is unique)
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
    // First, try to find existing user by auth_provider_id
    let user = await prisma.user.findFirst({
      where: {
        auth_provider_id: authProviderId,
      },
    });

    if (user) {
      return user;
    }

    // User doesn't exist by auth_provider_id, use email-based upsert
    // Email is unique, so this is atomic and race-condition safe
    user = await prisma.user.upsert({
      where: {
        email: email,
      },
      update: {
        // Update auth_provider_id if user exists with this email but different provider
        auth_provider_id: authProviderId,
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
    // Handle any unexpected errors
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
