/**
 * Test Data Factories Index
 *
 * Central export point for all test data factories.
 * Provides a clean entry point for importing factories in tests.
 */

// Database factories
export {
  createUser,
  createCompany,
  createStore,
  createUsers,
  createCompanies,
  createStores,
  type UserData,
  type CompanyData,
  type StoreData,
} from "./database.factory";

// Server factories
export {
  createHealthCheckResponse,
  createErrorResponse,
  createHealthCheckResponses,
  type HealthCheckResponse,
  type ErrorResponse,
} from "./server.factory";

// Redis factories
export {
  createRedisHealthStatus,
  createRedisConnectionConfig,
  createRedisHealthStatuses,
  type RedisHealthStatus,
  type RedisConnectionConfig,
} from "./redis.factory";

// RabbitMQ factories
export {
  createRabbitMQHealthStatus,
  createRabbitMQConnectionConfig,
  createRabbitMQHealthStatuses,
  type RabbitMQHealthStatus,
  type RabbitMQConnectionConfig,
} from "./rabbitmq.factory";

// Supabase factories
export {
  createSupabaseToken,
  createOAuthCallbackParams,
  createSupabaseUserIdentity,
  type SupabaseTokenData,
} from "./supabase.factory";
