import { createClient, RedisClientType } from "redis";

let redisClient: RedisClientType | null = null;
let isReconnecting = false;

/**
 * Initialize Redis client with production-grade connection options
 *
 * Key features for connection stability:
 * - pingInterval: Sends periodic PING to keep connection alive (critical for Docker/Windows)
 * - keepAlive: TCP-level keepalive with short interval (5 seconds)
 * - Exponential backoff with jitter for reconnection (prevents thundering herd)
 * - Graceful error handling with transient error classification
 *
 * @returns Redis client instance or null if connection failed
 */
export async function initializeRedis(): Promise<RedisClientType | null> {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  // Prevent concurrent reconnection attempts
  if (isReconnecting) {
    return null;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  redisClient = createClient({
    url: redisUrl,
    // pingInterval: Send PING command every 10 seconds to keep connection alive
    // This is CRITICAL for Docker Desktop on Windows which can reset idle connections
    // Without this, connections sitting idle will get ECONNRESET errors
    pingInterval: 10000,
    socket: {
      reconnectStrategy: (retries: number, cause: Error) => {
        // Log the cause of disconnection for debugging
        if (retries === 0) {
          console.log(
            `Redis: Connection lost - ${cause?.message || "unknown reason"}`,
          );
        }

        if (retries > 20) {
          console.error(
            "Redis: Max reconnection attempts (20) reached, giving up",
          );
          return new Error("Max reconnection attempts reached");
        }

        // Exponential backoff with jitter to prevent thundering herd
        const jitter = Math.floor(Math.random() * 200);
        const baseDelay = Math.min(Math.pow(2, retries) * 50, 5000);
        const delay = baseDelay + jitter;

        if (retries % 5 === 0) {
          // Log every 5th retry to reduce noise
          console.log(
            `Redis: Reconnecting in ${delay}ms (attempt ${retries + 1}/20)`,
          );
        }

        return delay;
      },
      // Connection timeout - fail fast if Redis is unreachable
      connectTimeout: 10000,
      // TCP keepalive: 5 seconds (more aggressive than default)
      // Helps detect dead connections faster on Docker/Windows
      keepAlive: 5000,
      // Disable Nagle's algorithm for lower latency
      noDelay: true,
    },
  });

  // Error handling with improved logging
  redisClient.on("error", (err) => {
    // Only log connection-level errors, not every transient error
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Classify error types for better handling
    const isTransientError =
      errorMessage.includes("ECONNRESET") ||
      errorMessage.includes("EPIPE") ||
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("ETIMEDOUT") ||
      errorMessage.includes("Connection lost") ||
      errorMessage.includes("Socket closed");

    if (isTransientError) {
      // These are handled by reconnection strategy, just log once
      if (!isReconnecting) {
        console.warn(`Redis: Transient error detected - ${errorMessage}`);
        isReconnecting = true;
      }
    } else {
      // Log unexpected errors at error level
      console.error("Redis Client Error:", err);
    }
  });

  redisClient.on("connect", () => {
    console.log("Redis: Connecting...");
  });

  redisClient.on("ready", () => {
    console.log("Redis: Client ready");
    isReconnecting = false;
  });

  redisClient.on("reconnecting", () => {
    isReconnecting = true;
    console.log("Redis: Reconnecting...");
  });

  // Handle connection end - reset client reference
  redisClient.on("end", () => {
    console.log("Redis: Connection ended");
    isReconnecting = false;
    redisClient = null;
  });

  // Connect with retry logic - gracefully handle failures
  try {
    await redisClient.connect();
    console.log("Redis: Connected successfully");
    return redisClient;
  } catch (error) {
    console.error(
      "Redis: Initial connection failed, continuing without cache:",
      error,
    );
    redisClient = null;
    return null;
  }
}

/**
 * Get the Redis client instance (initializes if needed)
 * Returns null if Redis is unavailable (for graceful degradation)
 *
 * This function handles:
 * - Initial connection
 * - Reconnection after connection loss
 * - Graceful degradation when Redis is unavailable
 *
 * @returns Redis client instance or null if unavailable
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  // If client exists and is open, return it
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  // If we're in the middle of reconnecting, let the reconnect strategy handle it
  // Return null to allow graceful degradation
  if (isReconnecting) {
    return null;
  }

  // No client or client is closed - try to initialize/reinitialize
  if (!redisClient) {
    return await initializeRedis();
  }

  // Client exists but connection is closed and we're not reconnecting
  // This means reconnection failed or was abandoned - try to recreate
  console.log("Redis: Client connection closed, attempting to recreate...");
  try {
    // Clean up the old client
    await redisClient.quit().catch(() => {
      // Ignore errors during cleanup - connection is already broken
    });
  } catch {
    // Ignore cleanup errors
  }
  redisClient = null;
  return await initializeRedis();
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  isReconnecting = false;

  if (redisClient) {
    try {
      if (redisClient.isOpen) {
        await redisClient.quit();
        console.log("Redis: Connection closed gracefully");
      } else {
        // Connection already closed, just clean up
        await redisClient.disconnect().catch(() => {});
      }
    } catch (error) {
      console.error("Redis: Error during close:", error);
      // Force disconnect if quit fails
      try {
        await redisClient.disconnect();
      } catch {
        // Ignore - we're closing anyway
      }
    }
    redisClient = null;
  }
}

/**
 * Health check: Verify Redis connection and ping
 * @returns Health status object with detailed connection info
 */
export async function checkRedisHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
  status: "connected" | "reconnecting" | "disconnected";
}> {
  // Check if we're in reconnecting state
  if (isReconnecting) {
    return {
      healthy: false,
      status: "reconnecting",
      error: "Redis is reconnecting",
    };
  }

  try {
    const client = await getRedisClient();
    if (!client) {
      return {
        healthy: false,
        status: "disconnected",
        error: "Redis client unavailable",
      };
    }
    const start = Date.now();
    await client.ping();
    const latency = Date.now() - start;
    return { healthy: true, latency, status: "connected" };
  } catch (error) {
    return {
      healthy: false,
      status: "disconnected",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if Redis is currently in a reconnecting state
 * Useful for determining if operations should be skipped/queued
 */
export function isRedisReconnecting(): boolean {
  return isReconnecting;
}

/**
 * Check if Redis is currently connected and ready
 */
export function isRedisConnected(): boolean {
  return redisClient !== null && redisClient.isOpen && !isReconnecting;
}

// Export client for direct use (after initialization)
export { redisClient };
