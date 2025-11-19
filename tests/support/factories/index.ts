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

// JWT factories
export {
  createJWTAccessToken,
  createJWTRefreshToken,
  createJWTAccessTokenPayload,
  createJWTRefreshTokenPayload,
  createExpiredJWTAccessToken,
  createExpiredJWTRefreshToken,
  createAdminJWTAccessToken,
  createMultiRoleJWTAccessToken,
  type JWTTokenPayload,
} from "./jwt.factory";

// RBAC factories
export {
  createRole,
  createSuperadminRole,
  createCorporateAdminRole,
  createStoreManagerRole,
  createShiftManagerRole,
  createCashierRole,
  createPermission,
  createUserCreatePermission,
  createUserReadPermission,
  createUserUpdatePermission,
  createUserDeletePermission,
  createStoreCreatePermission,
  createStoreReadPermission,
  createShiftOpenPermission,
  createShiftClosePermission,
  createUserRole,
  createRolePermission,
  createRoles,
  createPermissions,
  createUserRoles,
  createRolePermissions,
  type RoleData,
  type PermissionData,
  type UserRoleData,
  type RolePermissionData,
} from "./rbac.factory";

// Transaction factories (Story 3.1 & 3.2)
export {
  createTransaction,
  createTransactionLineItem,
  createTransactionPayment,
  createTransactions,
  createTransactionLineItems,
  createTransactionPayments,
  createFullTransaction,
  createTransactionPayload,
  type TransactionData,
  type TransactionLineItemData,
  type TransactionPaymentData,
  type TransactionPayloadData,
} from "./transaction.factory";
