/**
 * Redis Test Data Factories
 *
 * Pure functions for generating test data related to Redis connections,
 * health checks, and Redis operations. Uses faker for dynamic values.
 */

import { faker } from "@faker-js/faker";

export type RedisHealthStatus = {
  status: "healthy" | "unhealthy";
  version?: string;
  latency?: number;
  error?: string;
};

export type RedisConnectionConfig = {
  url: string;
  maxRetries?: number;
  retryDelay?: number;
};

/**
 * Creates a Redis health status object
 */
export const createRedisHealthStatus = (
  overrides: Partial<RedisHealthStatus> = {},
): RedisHealthStatus => ({
  status: "healthy",
  version: "7.4.0",
  latency: faker.number.int({ min: 1, max: 10 }), // 1-10ms latency
  ...overrides,
});

/**
 * Creates a Redis connection configuration object
 */
export const createRedisConnectionConfig = (
  overrides: Partial<RedisConnectionConfig> = {},
): RedisConnectionConfig => ({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  maxRetries: 3,
  retryDelay: 1000,
  ...overrides,
});

/**
 * Creates multiple Redis health status objects
 */
export const createRedisHealthStatuses = (count: number): RedisHealthStatus[] =>
  Array.from({ length: count }, () => createRedisHealthStatus());
