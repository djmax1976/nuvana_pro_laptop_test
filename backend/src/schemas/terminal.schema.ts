/**
 * Terminal Validation Schemas
 *
 * Zod schemas for validating terminal API payloads and connection configurations.
 * Story 4.81: External POS Connection Schema
 */

import { z } from "zod";

/**
 * Connection Type Enum
 */
export const POSConnectionTypeEnum = z.enum([
  "NETWORK",
  "API",
  "WEBHOOK",
  "FILE",
  "MANUAL",
]);

/**
 * Vendor Type Enum
 */
export const POSVendorTypeEnum = z.enum([
  "GENERIC",
  "SQUARE",
  "CLOVER",
  "TOAST",
  "LIGHTSPEED",
  "CUSTOM",
]);

/**
 * Terminal Status Enum
 */
export const POSTerminalStatusEnum = z.enum([
  "ACTIVE",
  "INACTIVE",
  "PENDING",
  "ERROR",
]);

/**
 * Sync Status Enum
 */
export const SyncStatusEnum = z.enum([
  "NEVER",
  "SUCCESS",
  "FAILED",
  "IN_PROGRESS",
]);

/**
 * NETWORK Connection Config Schema
 * For TCP/HTTP network connections
 */
export const NetworkConnectionConfigSchema = z.object({
  host: z.string().min(1, "host is required"),
  port: z.number().int().positive("port must be a positive integer"),
  protocol: z.enum(["TCP", "HTTP"]),
});

/**
 * API Connection Config Schema
 * For REST API connections
 */
export const ApiConnectionConfigSchema = z.object({
  baseUrl: z.string().url("baseUrl must be a valid URL"),
  apiKey: z.string().min(1, "apiKey is required"),
});

/**
 * WEBHOOK Connection Config Schema
 * For webhook-based connections (read-only webhook URL, auto-generated)
 */
export const WebhookConnectionConfigSchema = z.object({
  webhookUrl: z
    .string()
    .url("webhookUrl must be a valid URL")
    .optional()
    .describe("Read-only, auto-generated"),
  secret: z.string().min(1, "secret is required"),
});

/**
 * FILE Connection Config Schema
 * For file-based imports
 */
export const FileConnectionConfigSchema = z.object({
  importPath: z.string().min(1, "importPath is required"),
});

/**
 * Discriminated Union Schema for Connection Config
 * Validates connection_config structure based on connection_type
 */
export const ConnectionConfigSchema = z.discriminatedUnion("connection_type", [
  z.object({
    connection_type: z.literal("NETWORK"),
    connection_config: NetworkConnectionConfigSchema,
  }),
  z.object({
    connection_type: z.literal("API"),
    connection_config: ApiConnectionConfigSchema,
  }),
  z.object({
    connection_type: z.literal("WEBHOOK"),
    connection_config: WebhookConnectionConfigSchema,
  }),
  z.object({
    connection_type: z.literal("FILE"),
    connection_config: FileConnectionConfigSchema,
  }),
  z.object({
    connection_type: z.literal("MANUAL"),
    connection_config: z.undefined().or(z.null()),
  }),
]);

/**
 * Create Terminal Request Schema
 * Validates the request body for POST /api/stores/:storeId/terminals
 */
export const CreateTerminalSchema = z
  .object({
    name: z
      .string()
      .min(1, "name is required")
      .max(100, "name must be 100 characters or less"),
    device_id: z
      .string()
      .max(255, "device_id must be 255 characters or less")
      .optional(),
    connection_type: POSConnectionTypeEnum.optional(),
    connection_config: z.any().optional(),
    vendor_type: POSVendorTypeEnum.optional(),
    terminal_status: POSTerminalStatusEnum.optional(),
    sync_status: SyncStatusEnum.optional(),
  })
  .refine(
    (data) => {
      // If connection_type is MANUAL, connection_config must be null/undefined
      if (data.connection_type === "MANUAL") {
        return (
          data.connection_config === undefined ||
          data.connection_config === null
        );
      }
      // If connection_type is provided and not MANUAL, connection_config must be provided
      const nonManualTypes = ["NETWORK", "API", "WEBHOOK", "FILE"] as const;
      if (
        data.connection_type &&
        nonManualTypes.includes(data.connection_type as any)
      ) {
        return data.connection_config !== undefined;
      }
      return true;
    },
    {
      message:
        "connection_config is required when connection_type is not MANUAL",
    },
  )
  .refine(
    (data) => {
      // Validate connection_config structure matches connection_type
      if (data.connection_type && data.connection_config) {
        try {
          ConnectionConfigSchema.parse({
            connection_type: data.connection_type,
            connection_config: data.connection_config,
          });
          return true;
        } catch (error) {
          return false;
        }
      }
      return true;
    },
    {
      message: "connection_config structure does not match connection_type",
    },
  );

/**
 * Update Terminal Request Schema
 * Validates the request body for PUT /api/stores/:storeId/terminals/:terminalId
 */
export const UpdateTerminalSchema = z
  .object({
    name: z
      .string()
      .min(1, "name is required")
      .max(100, "name must be 100 characters or less")
      .optional(),
    device_id: z
      .string()
      .max(255, "device_id must be 255 characters or less")
      .optional(),
    connection_type: POSConnectionTypeEnum.optional(),
    connection_config: z.any().optional(),
    vendor_type: POSVendorTypeEnum.optional(),
    terminal_status: POSTerminalStatusEnum.optional(),
    sync_status: SyncStatusEnum.optional(),
  })
  .refine(
    (data) => {
      // If connection_type is MANUAL, connection_config must be null/undefined
      if (data.connection_type === "MANUAL") {
        return (
          data.connection_config === undefined ||
          data.connection_config === null
        );
      }
      // If connection_type is provided and not MANUAL, and connection_config is provided, validate structure
      const nonManualTypes = ["NETWORK", "API", "WEBHOOK", "FILE"] as const;
      if (
        data.connection_type &&
        nonManualTypes.includes(data.connection_type as any) &&
        data.connection_config !== undefined
      ) {
        try {
          ConnectionConfigSchema.parse({
            connection_type: data.connection_type,
            connection_config: data.connection_config,
          });
          return true;
        } catch (error) {
          return false;
        }
      }
      return true;
    },
    {
      message: "connection_config structure does not match connection_type",
    },
  );

/**
 * Type inference from schemas
 */
export type CreateTerminalInput = z.infer<typeof CreateTerminalSchema>;
export type UpdateTerminalInput = z.infer<typeof UpdateTerminalSchema>;
export type NetworkConnectionConfig = z.infer<
  typeof NetworkConnectionConfigSchema
>;
export type ApiConnectionConfig = z.infer<typeof ApiConnectionConfigSchema>;
export type WebhookConnectionConfig = z.infer<
  typeof WebhookConnectionConfigSchema
>;
export type FileConnectionConfig = z.infer<typeof FileConnectionConfigSchema>;

/**
 * Validate create terminal request and return typed result
 * @param data - Raw payload data
 * @returns Validated and typed create terminal input
 * @throws ZodError if validation fails
 */
export function validateCreateTerminalInput(
  data: unknown,
): CreateTerminalInput {
  return CreateTerminalSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateCreateTerminalInput(data: unknown) {
  return CreateTerminalSchema.safeParse(data);
}

/**
 * Validate update terminal request and return typed result
 * @param data - Raw payload data
 * @returns Validated and typed update terminal input
 * @throws ZodError if validation fails
 */
export function validateUpdateTerminalInput(
  data: unknown,
): UpdateTerminalInput {
  return UpdateTerminalSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateUpdateTerminalInput(data: unknown) {
  return UpdateTerminalSchema.safeParse(data);
}
