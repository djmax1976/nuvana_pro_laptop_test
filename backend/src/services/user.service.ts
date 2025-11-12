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
  // Check if user exists by auth_provider_id
  let user = await prisma.user.findFirst({
    where: {
      auth_provider_id: authProviderId,
    },
  });

  // If user doesn't exist, create new user
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: name || email.split("@")[0], // Use email prefix if name not provided
        auth_provider_id: authProviderId,
        status: "ACTIVE",
      },
    });
  }

  return user;
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
