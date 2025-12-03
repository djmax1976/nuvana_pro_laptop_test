/**
 * Terminal Types
 * TypeScript types for POS terminal connection configuration
 * Story 4.82: Terminal Connection Configuration UI
 */

/**
 * POS Connection Type Enum
 */
export type POSConnectionType =
  | "NETWORK"
  | "API"
  | "WEBHOOK"
  | "FILE"
  | "MANUAL";

/**
 * POS Vendor Type Enum
 */
export type POSVendorType =
  | "GENERIC"
  | "SQUARE"
  | "CLOVER"
  | "TOAST"
  | "LIGHTSPEED"
  | "CUSTOM";

/**
 * POS Terminal Status Enum
 */
export type POSTerminalStatus = "ACTIVE" | "INACTIVE" | "PENDING" | "ERROR";

/**
 * Sync Status Enum
 */
export type SyncStatus = "NEVER" | "SUCCESS" | "FAILED" | "IN_PROGRESS";

/**
 * Connection Config Types
 * Structure depends on connection_type
 */
export type NetworkConnectionConfig = {
  host: string;
  port: number;
  protocol: "TCP" | "HTTP";
};

export type ApiConnectionConfig = {
  baseUrl: string;
  apiKey: string;
};

export type WebhookConnectionConfig = {
  webhookUrl: string;
  secret: string;
};

export type FileConnectionConfig = {
  importPath: string;
};

export type ConnectionConfig =
  | NetworkConnectionConfig
  | ApiConnectionConfig
  | WebhookConnectionConfig
  | FileConnectionConfig
  | null;
