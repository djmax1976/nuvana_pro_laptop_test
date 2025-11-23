import { createClient, RedisClientType } from "redis";

let redisClient: RedisClientType | null = null;

/**
 * Initialize Redis client with connection options, pooling, and retry logic
 * Returns null if connection fails (graceful degradation)
 * @returns Redis client instance or null if connection failed
 */
export async function initializeRedis(): Promise<RedisClientType | null> {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  redisClient = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries: number) => {
        if (retries > 10) {
          console.error("Redis: Max reconnection attempts reached");
          return new Error("Max reconnection attempts reached");
        }
        // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms, etc.
        const delay = Math.min(100 * Math.pow(2, retries), 30000);
        console.log(
          `Redis: Reconnecting in ${delay}ms (attempt ${retries + 1})`,
        );
        return delay;
      },
      connectTimeout: 10000,
    },
  });

  // Error handling
  redisClient.on("error", (err) => {
    console.error("Redis Client Error:", err);
  });

  redisClient.on("connect", () => {
    console.log("Redis: Connecting...");
  });

  redisClient.on("ready", () => {
    console.log("Redis: Client ready");
  });

  redisClient.on("reconnecting", () => {
    console.log("Redis: Reconnecting...");
  });

  // Connect with retry logic - gracefully handle failures
  try {
    await redisClient.connect();
    console.log("Redis: Connected successfully");
    return redisClient;
  } catch (error) {
    console.error("Redis: Connection failed, continuing without cache:", error);
    redisClient = null;
    return null;
  }
}

/**
 * Get the Redis client instance (initializes if needed)
 * Returns null if Redis is unavailable (for graceful degradation)
 * @returns Redis client instance or null if unavailable
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  if (!redisClient || !redisClient.isOpen) {
    return await initializeRedis();
  }
  return redisClient;
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.quit();
      console.log("Redis: Connection closed gracefully");
    } catch (error) {
      console.error("Redis: Error during close:", error);
      // Force disconnect if quit fails
      await redisClient.disconnect();
    }
    redisClient = null;
  }
}

/**
 * Health check: Verify Redis connection and ping
 * @returns Health status object
 */
export async function checkRedisHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  try {
    const client = await getRedisClient();
    if (!client) {
      return {
        healthy: false,
        error: "Redis client unavailable",
      };
    }
    const start = Date.now();
    await client.ping();
    const latency = Date.now() - start;
    return { healthy: true, latency };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Export client for direct use (after initialization)
export { redisClient };
