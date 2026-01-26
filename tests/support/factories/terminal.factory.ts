/**
 * POS Terminal Test Data Factories
 *
 * Pure functions for generating test data for POSTerminal model:
 * - Terminal entities with all required fields
 * Uses faker for dynamic values to prevent collisions in parallel tests.
 *
 * Story: 4-8-cashier-shift-start-flow
 * Enhanced: 4-81-external-pos-connection-schema (added connection fields)
 */

import { faker } from "@faker-js/faker";
import { Prisma } from "@prisma/client";

export type POSConnectionType =
  | "NETWORK"
  | "API"
  | "WEBHOOK"
  | "FILE"
  | "MANUAL";

/**
 * POSSystemType - All 15 supported POS system types
 * Must match the implementation in src/types/pos-integration.ts
 */
export type POSSystemType =
  // Verifone POS Systems
  | "VERIFONE_COMMANDER" // File-based
  | "VERIFONE_RUBY2" // File-based
  | "VERIFONE_SAPPHIRE" // Network-based
  // Gilbarco POS Systems
  | "GILBARCO_PASSPORT" // Network-based
  | "GILBARCO_NAXML" // File-based
  | "GILBARCO_COMMANDER" // Network-based
  // Cloud POS Systems
  | "SQUARE_REST" // API-based
  | "CLOVER_REST" // API-based
  | "TOAST_REST" // API-based
  | "LIGHTSPEED_REST" // API-based
  // Other POS Systems
  | "NCR_ALOHA" // Network-based
  | "ORACLE_SIMPHONY" // Network-based
  | "GENERIC_REST" // Network-based
  | "GENERIC_XML" // File-based
  | "MANUAL_ENTRY"; // Manual (no sync)

export type POSTerminalStatus = "ACTIVE" | "INACTIVE" | "PENDING" | "ERROR";

export type SyncStatus = "NEVER" | "SUCCESS" | "FAILED" | "IN_PROGRESS";

export type NetworkConnectionConfig = {
  host: string;
  port: number;
  protocol: "TCP" | "HTTP";
};

/**
 * API connection config - uses camelCase to match backend schema
 * @see backend/src/schemas/terminal.schema.ts ApiConnectionConfigSchema
 */
export type ApiConnectionConfig = {
  baseUrl: string;
  apiKey: string;
};

/**
 * Webhook connection config - uses camelCase to match backend schema
 * @see backend/src/schemas/terminal.schema.ts WebhookConnectionConfigSchema
 */
export type WebhookConnectionConfig = {
  webhookUrl?: string;
  secret: string;
};

/**
 * File connection config - uses camelCase to match backend schema
 * @see backend/src/schemas/terminal.schema.ts FileConnectionConfigSchema
 */
export type FileConnectionConfig = {
  importPath: string;
};

export type ConnectionConfig =
  | NetworkConnectionConfig
  | ApiConnectionConfig
  | WebhookConnectionConfig
  | FileConnectionConfig
  | Prisma.NullableJsonNullValueInput
  | undefined;

export type TerminalData = {
  pos_terminal_id?: string;
  store_id: string;
  name: string;
  device_id?: string | null;
  deleted_at?: Date | null;
  // Connection fields (Story 4.81)
  connection_type?: POSConnectionType;
  connection_config?: ConnectionConfig;
  pos_type?: POSSystemType;
  terminal_status?: POSTerminalStatus;
  last_sync_at?: Date | null;
  sync_status?: SyncStatus;
};

/**
 * Creates a POSTerminal test data object
 * Requires store_id to be provided
 * Defaults to MANUAL connection type for backward compatibility
 */
export const createTerminal = (
  overrides: Partial<TerminalData> & {
    store_id: string;
  },
): TerminalData => ({
  name: `Terminal ${faker.number.int({ min: 1, max: 999 })}`,
  device_id: `device-${faker.string.alphanumeric(8)}`,
  deleted_at: null,
  // Default connection fields (matching migration defaults)
  connection_type: "MANUAL",
  connection_config: Prisma.JsonNull,
  pos_type: "MANUAL_ENTRY",
  terminal_status: "ACTIVE",
  sync_status: "NEVER",
  last_sync_at: null,
  ...overrides,
});

/**
 * Creates a terminal with NETWORK connection type
 * Uses VERIFONE_SAPPHIRE as the default Network POS type
 */
export const createNetworkTerminal = (
  overrides: Partial<TerminalData> & {
    store_id: string;
  },
): TerminalData => {
  return createTerminal({
    ...overrides,
    connection_type: "NETWORK",
    pos_type: overrides.pos_type || "VERIFONE_SAPPHIRE",
    connection_config: {
      host: faker.internet.ip(),
      port: faker.internet.port(),
      protocol: faker.helpers.arrayElement(["TCP", "HTTP"]) as "TCP" | "HTTP",
    },
  });
};

/**
 * Creates a terminal with API connection type
 * Uses SQUARE_REST as the default Cloud POS type (Cloud POS -> API connection)
 */
export const createApiTerminal = (
  overrides: Partial<TerminalData> & {
    store_id: string;
  },
): TerminalData => {
  return createTerminal({
    ...overrides,
    connection_type: "API",
    pos_type: overrides.pos_type || "SQUARE_REST",
    connection_config: {
      baseUrl: faker.internet.url(),
      apiKey: faker.string.alphanumeric(32),
    },
  });
};

/**
 * Creates a terminal with WEBHOOK connection type
 * Uses SQUARE_REST as the default (Cloud POS can use webhook)
 */
export const createWebhookTerminal = (
  overrides: Partial<TerminalData> & {
    store_id: string;
  },
): TerminalData => {
  return createTerminal({
    ...overrides,
    connection_type: "WEBHOOK",
    pos_type: overrides.pos_type || "SQUARE_REST",
    connection_config: {
      webhookUrl: faker.internet.url(),
      secret: faker.string.alphanumeric(32),
    },
  });
};

/**
 * Creates a terminal with FILE connection type
 * Uses VERIFONE_COMMANDER as the default File POS type
 */
export const createFileTerminal = (
  overrides: Partial<TerminalData> & {
    store_id: string;
  },
): TerminalData => {
  return createTerminal({
    ...overrides,
    connection_type: "FILE",
    pos_type: overrides.pos_type || "VERIFONE_COMMANDER",
    connection_config: {
      importPath: faker.system.filePath(),
    },
  });
};

/**
 * Creates multiple POSTerminal test data objects
 * Requires store_id to be provided
 */
export const createTerminals = (
  count: number,
  overrides: Partial<TerminalData> & {
    store_id: string;
  },
): TerminalData[] =>
  Array.from({ length: count }, () => createTerminal(overrides));
