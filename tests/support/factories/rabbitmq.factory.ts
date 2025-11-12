/**
 * RabbitMQ Test Data Factories
 *
 * Pure functions for generating test data related to RabbitMQ connections,
 * health checks, and channel operations. Uses faker for dynamic values.
 */

import { faker } from "@faker-js/faker";

export type RabbitMQHealthStatus = {
  status: "healthy" | "unhealthy";
  version?: string;
  channels?: number;
  error?: string;
};

export type RabbitMQConnectionConfig = {
  url: string;
  maxRetries?: number;
  retryDelay?: number;
};

/**
 * Creates a RabbitMQ health status object
 */
export const createRabbitMQHealthStatus = (
  overrides: Partial<RabbitMQHealthStatus> = {},
): RabbitMQHealthStatus => ({
  status: "healthy",
  version: "3.13.7",
  channels: faker.number.int({ min: 1, max: 10 }),
  ...overrides,
});

/**
 * Creates a RabbitMQ connection configuration object
 */
export const createRabbitMQConnectionConfig = (
  overrides: Partial<RabbitMQConnectionConfig> = {},
): RabbitMQConnectionConfig => ({
  url: process.env.RABBITMQ_URL || "amqp://localhost:5672",
  maxRetries: 3,
  retryDelay: 1000,
  ...overrides,
});

/**
 * Creates multiple RabbitMQ health status objects
 */
export const createRabbitMQHealthStatuses = (
  count: number,
): RabbitMQHealthStatus[] =>
  Array.from({ length: count }, () => createRabbitMQHealthStatus());
