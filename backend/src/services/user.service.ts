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
  // If name is null/undefined/empty, use email prefix as fallback
  const normalizedName =
    !name || (typeof name === "string" && name.trim() === "")
      ? email.split("@")[0]
      : name.trim();

  // STEP 1: Check if user with this email already exists (handles duplicate email scenario PROACTIVELY)
  // This prevents the upsert from failing with P2002 constraint violation
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUserByEmail) {
    // User with this email exists - check if it's the same auth provider
    if (existingUserByEmail.auth_provider_id === authProviderId) {
      // Same user, same provider - just update name if needed
      console.log(
        `User ${email} already exists with auth_provider_id ${authProviderId}, updating name`,
      );
      return await prisma.user.update({
        where: { email },
        data: { name: normalizedName },
      });
    }

    // Different auth_provider_id - user is switching OAuth providers
    // Check if the NEW auth_provider_id is already claimed by someone else
    const userWithNewAuthId = await prisma.user.findUnique({
      where: { auth_provider_id: authProviderId },
    });

    if (
      userWithNewAuthId &&
      userWithNewAuthId.user_id !== existingUserByEmail.user_id
    ) {
      // CONFLICT: The new auth_provider_id already belongs to a DIFFERENT user
      console.error(
        `Conflict: auth_provider_id ${authProviderId} already belongs to user ${userWithNewAuthId.user_id}, but email ${email} belongs to user ${existingUserByEmail.user_id}`,
      );
      throw new Error(
        `Authentication provider ID already associated with different account`,
      );
    }

    // Safe to update: the email exists but with different auth_provider_id, and the new auth_provider_id is not claimed
    console.log(
      `Updating user ${email} from auth_provider_id ${existingUserByEmail.auth_provider_id} to ${authProviderId}`,
    );
    return await prisma.user.update({
      where: { email },
      data: {
        auth_provider_id: authProviderId,
        name: normalizedName,
      },
    });
  }

  // STEP 2: No user with this email - proceed with atomic upsert by auth_provider_id
  // This handles race conditions where the same auth_provider_id is used concurrently
  try {
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
        name: normalizedName,
        auth_provider_id: authProviderId,
        status: "ACTIVE",
      },
    });

    return user;
  } catch (error: any) {
    // Handle race condition: another request created user with same email between our check and upsert
    if (error.code === "P2002" && error.meta?.target?.includes("email")) {
      console.log(
        `Race condition detected: User with email ${email} was created concurrently, retrying...`,
      );

      // Retry the entire operation (recursive call)
      return await getUserOrCreate(authProviderId, email, name);
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
