import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { storeService } from "../services/store.service";
import { rbacService } from "../services/rbac.service";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  safeValidateCreateTerminalInput,
  safeValidateUpdateTerminalInput,
} from "../schemas/terminal.schema";
import {
  safeValidateUpdateLotteryBinCount,
  MIN_LOTTERY_BIN_COUNT,
  MAX_LOTTERY_BIN_COUNT,
} from "../schemas/lottery-bin-count.schema";
import { lotteryBinCountService } from "../services/lottery-bin-count.service";
import { prisma } from "../utils/db";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../utils/public-id";
import {
  getCalendarDayBoundaries,
  DEFAULT_STORE_TIMEZONE,
} from "../utils/timezone.utils";

/**
 * Validate IANA timezone using Intl.DateTimeFormat
 * This validates that the timezone is an actual valid IANA timezone,
 * not just a format that looks valid.
 * @param timezone - Timezone string to validate
 * @returns true if valid IANA timezone
 */
function isValidIANATimezone(timezone: string): boolean {
  // Limit to reasonable length to prevent abuse
  if (!timezone || timezone.length > 50) {
    return false;
  }

  // Use Intl.DateTimeFormat to validate actual timezone existence
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper function to extract user's company_id from their roles
 * @param userId - User ID
 * @returns Company ID if user has COMPANY or STORE scope role, null otherwise
 */
async function getUserCompanyId(userId: string): Promise<string | null> {
  const userRoles = await rbacService.getUserRoles(userId);

  // Find COMPANY scope role first
  const companyRole = userRoles.find(
    (role) => role.scope === "COMPANY" && role.company_id,
  );
  if (companyRole) {
    return companyRole.company_id;
  }

  // If no COMPANY role, check for STORE scope role and get company_id from the store
  const storeRole = userRoles.find(
    (role) => role.scope === "STORE" && role.store_id && role.company_id,
  );
  if (storeRole) {
    return storeRole.company_id;
  }

  // Check for SYSTEM scope (can access all companies)
  const systemRole = userRoles.find((role) => role.scope === "SYSTEM");
  if (systemRole) {
    // System admins don't have a specific company, return null
    // They should be handled separately with permission checks
    return null;
  }

  return null;
}

/**
 * Store management routes
 * Provides CRUD operations for stores with RBAC enforcement
 * All routes require STORE_* permissions and enforce company isolation
 */
export async function storeRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/stores
   * List all stores (System Admin only)
   * Protected route - requires STORE_READ permission and SYSTEM scope
   */
  fastify.get(
    "/api/stores",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_READ),
      ],
      schema: {
        description: "List all stores (System Admin only)",
        tags: ["stores"],
        querystring: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
              description: "Items per page (max 100)",
            },
            offset: {
              type: "integer",
              minimum: 0,
              default: 0,
              description: "Pagination offset",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    store_id: { type: "string", format: "uuid" },
                    public_id: { type: "string" },
                    company_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    location_json: {
                      type: "object",
                      additionalProperties: true,
                    },
                    // Structured address fields
                    address_line1: { type: "string", nullable: true },
                    address_line2: { type: "string", nullable: true },
                    city: { type: "string", nullable: true },
                    state_id: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    county_id: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    zip_code: { type: "string", nullable: true },
                    timezone: { type: "string" },
                    status: { type: "string" },
                    created_at: { type: "string", format: "date-time" },
                    updated_at: { type: "string", format: "date-time" },
                    company: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                      },
                    },
                  },
                },
              },
              meta: {
                type: "object",
                properties: {
                  total: { type: "integer" },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const query = request.query as { limit?: number; offset?: number };

        // Check if user has SYSTEM scope (System Admin)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          // Log permission denial to audit_logs
          const ipAddress =
            (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
            request.ip ||
            request.socket.remoteAddress ||
            null;
          const userAgent = request.headers["user-agent"] || null;

          try {
            await prisma.auditLog.create({
              data: {
                user_id: user.id,
                action: "PERMISSION_DENIED",
                table_name: "api_route",
                record_id: crypto.randomUUID(),
                reason: `Permission denied: STORE_READ for resource: GET /api/stores - Only System Administrators can view all stores`,
                ip_address: ipAddress,
                user_agent: userAgent,
              },
            });
          } catch (auditError) {
            // Log error but don't fail the request
            fastify.log.error(
              { error: auditError },
              "Failed to log permission denial",
            );
          }

          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "Only System Administrators can view all stores",
            },
          };
        }

        const limit = query.limit || 20;
        const offset = query.offset || 0;

        // Get all stores with company info
        // Use deterministic ordering: created_at desc, then store_id desc as tiebreaker
        // This ensures pagination is stable even when stores have identical created_at timestamps
        const [stores, total] = await Promise.all([
          prisma.store.findMany({
            skip: offset,
            take: limit,
            orderBy: [{ created_at: "desc" }, { store_id: "desc" }],
            include: {
              company: {
                select: {
                  name: true,
                },
              },
            },
          }),
          prisma.store.count(),
        ]);

        reply.code(200);
        return {
          data: stores,
          meta: {
            total,
            limit,
            offset,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error retrieving all stores");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to retrieve stores",
          },
        };
      }
    },
  );

  /**
   * POST /api/companies/:companyId/stores
   * Create a new store
   * Protected route - requires STORE_CREATE permission
   */
  fastify.post(
    "/api/companies/:companyId/stores",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_CREATE),
      ],
      schema: {
        description: "Create a new store",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["companyId"],
          properties: {
            companyId: {
              type: "string",
              format: "uuid",
              description: "Company UUID",
            },
          },
        },
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 255,
              description: "Store name",
            },
            location_json: {
              type: "object",
              properties: {
                address: {
                  type: "string",
                  description: "Store address",
                },
              },
              description: "Store location (address only)",
            },
            timezone: {
              type: "string",
              description:
                "IANA timezone format (e.g., America/New_York, Europe/London) - validated by service layer",
              default: "America/New_York",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "CLOSED"],
              description: "Store status (defaults to ACTIVE)",
            },
            // === Structured Address Fields ===
            address_line1: {
              type: "string",
              maxLength: 255,
              description: "Street address line 1 (e.g., '123 Main Street')",
            },
            address_line2: {
              type: "string",
              maxLength: 255,
              nullable: true,
              description: "Street address line 2 (e.g., 'Suite 100')",
            },
            city: {
              type: "string",
              maxLength: 100,
              description: "City name",
            },
            state_id: {
              type: "string",
              format: "uuid",
              description:
                "FK to us_states - determines lottery game visibility",
            },
            county_id: {
              type: "string",
              format: "uuid",
              nullable: true,
              description: "FK to us_counties - for tax jurisdiction",
            },
            zip_code: {
              type: "string",
              pattern: "^[0-9]{5}(-[0-9]{4})?$",
              description: "ZIP code (5-digit or ZIP+4 format)",
            },
            manager: {
              type: "object",
              description:
                "Optional store login credential (CLIENT_USER) to create",
              properties: {
                email: {
                  type: "string",
                  format: "email",
                  maxLength: 255,
                  description: "Store login email address",
                },
                password: {
                  type: "string",
                  minLength: 8,
                  maxLength: 255,
                  description: "Store login password (min 8 characters)",
                },
              },
              required: ["email", "password"],
            },
            terminals: {
              type: "array",
              description: "Optional terminals to create for this store",
              items: {
                type: "object",
                required: ["name"],
                properties: {
                  name: {
                    type: "string",
                    minLength: 1,
                    maxLength: 100,
                    description: "Terminal name",
                  },
                  device_id: {
                    type: "string",
                    maxLength: 100,
                    description: "Optional device ID (must be globally unique)",
                  },
                  connection_type: {
                    type: "string",
                    enum: ["NETWORK", "API", "WEBHOOK", "FILE", "MANUAL"],
                    default: "MANUAL",
                    description: "Connection type",
                  },
                  pos_type: {
                    type: "string",
                    enum: [
                      "GILBARCO_PASSPORT",
                      "GILBARCO_NAXML",
                      "GILBARCO_COMMANDER",
                      "VERIFONE_RUBY2",
                      "VERIFONE_COMMANDER",
                      "VERIFONE_SAPPHIRE",
                      "CLOVER_REST",
                      "ORACLE_SIMPHONY",
                      "NCR_ALOHA",
                      "LIGHTSPEED_REST",
                      "SQUARE_REST",
                      "TOAST_REST",
                      "GENERIC_XML",
                      "GENERIC_REST",
                      "MANUAL_ENTRY",
                    ],
                    default: "MANUAL_ENTRY",
                    description: "POS system type (enterprise 15-type enum)",
                  },
                  connection_config: {
                    type: "object",
                    description:
                      "Connection configuration based on connection_type",
                    additionalProperties: true,
                  },
                },
              },
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              store_id: { type: "string", format: "uuid" },
              company_id: { type: "string", format: "uuid" },
              public_id: { type: "string" },
              name: { type: "string" },
              location_json: {
                type: "object",
                additionalProperties: true,
              },
              // Structured address fields
              address_line1: { type: "string", nullable: true },
              address_line2: { type: "string", nullable: true },
              city: { type: "string", nullable: true },
              state_id: { type: "string", format: "uuid", nullable: true },
              county_id: { type: "string", format: "uuid", nullable: true },
              zip_code: { type: "string", nullable: true },
              timezone: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
              manager: {
                type: "object",
                nullable: true,
                properties: {
                  user_id: { type: "string", format: "uuid" },
                  email: { type: "string" },
                  name: { type: "string" },
                },
              },
              terminals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pos_terminal_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    device_id: { type: "string", nullable: true },
                    connection_type: { type: "string" },
                    pos_type: { type: "string" },
                  },
                },
              },
              request_metadata: {
                type: "object",
                properties: {
                  timestamp: { type: "string", format: "date-time" },
                  request_id: { type: "string" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { companyId: string };
        const body = request.body as {
          name: string;
          location_json?: {
            address?: string;
          };
          timezone?: string;
          status?: "ACTIVE" | "INACTIVE" | "CLOSED";
          // === Structured Address Fields ===
          address_line1?: string;
          address_line2?: string | null;
          city?: string;
          state_id?: string;
          county_id?: string | null;
          zip_code?: string;
          manager?: {
            email: string;
            password: string;
          };
          terminals?: Array<{
            name: string;
            device_id?: string;
            connection_type?: string;
            pos_type?: string;
            connection_config?: Record<string, unknown>;
          }>;
        };
        const user = (request as any).user as UserIdentity;

        // Verify user can create stores for this company (company isolation)
        // System Admins (SYSTEM scope) can create stores for ANY company
        // Company Admins (COMPANY scope) can only create stores for their assigned company
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          // Non-system admin: must create store for their assigned company only
          const userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId || userCompanyId !== params.companyId) {
            // Log permission denial to audit_logs
            const ipAddress =
              (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
              request.ip ||
              request.socket.remoteAddress ||
              null;
            const userAgent = request.headers["user-agent"] || null;

            try {
              await prisma.auditLog.create({
                data: {
                  user_id: user.id,
                  action: "PERMISSION_DENIED",
                  table_name: "api_route",
                  record_id: crypto.randomUUID(),
                  reason: `Permission denied: STORE_CREATE for resource: POST /api/companies/${params.companyId}/stores - Company isolation violation: attempted to create store for different company`,
                  ip_address: ipAddress,
                  user_agent: userAgent,
                },
              });
            } catch (auditError) {
              // Log error but don't fail the request
              fastify.log.error(
                { error: auditError },
                "Failed to log permission denial",
              );
            }

            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only create stores for your assigned company",
              },
            };
          }
        }
        // System admins bypass company isolation - they can create stores for any company

        // Validate location_json.address if provided
        if (body.location_json?.address !== undefined) {
          // Ensure address is a string
          if (typeof body.location_json.address !== "string") {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "location_json.address must be a string",
              },
            };
          }
          // TODO: Replace regex-based XSS protection with a dedicated sanitization library (e.g., DOMPurify, sanitize-html)
          // XSS protection: Reject addresses containing script tags or other dangerous HTML
          const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
          if (xssPattern.test(body.location_json.address)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Invalid address: HTML tags and scripts are not allowed",
              },
            };
          }
        }

        // Get IP and user agent for audit logs
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Validate manager data if provided
        if (body.manager) {
          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(body.manager.email)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid store login email format",
              },
            };
          }

          // Check if email already exists
          const existingUser = await prisma.user.findUnique({
            where: { email: body.manager.email.toLowerCase().trim() },
          });

          if (existingUser) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Store login email already exists",
              },
            };
          }

          // Validate password strength
          const passwordRegex =
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
          if (!passwordRegex.test(body.manager.password)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Manager password must be at least 8 characters with uppercase, lowercase, number, and special character",
              },
            };
          }
        }

        // Validate terminals if provided
        if (body.terminals && body.terminals.length > 0) {
          // Check for duplicate device_ids in the request
          const deviceIds = body.terminals
            .map((t) => t.device_id)
            .filter((id) => id !== undefined && id !== null && id !== "");
          const uniqueDeviceIds = new Set(deviceIds);
          if (deviceIds.length !== uniqueDeviceIds.size) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Duplicate device_id in terminals list",
              },
            };
          }

          // Check if any device_ids already exist in database
          if (deviceIds.length > 0) {
            const existingTerminals = await prisma.pOSTerminal.findMany({
              where: { device_id: { in: deviceIds as string[] } },
              select: { device_id: true },
            });
            if (existingTerminals.length > 0) {
              reply.code(400);
              return {
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message: `Device ID(s) already exist: ${existingTerminals.map((t) => t.device_id).join(", ")}`,
                },
              };
            }
          }
        }

        // Get CLIENT_USER role if manager is being created
        let clientUserRole = null;
        if (body.manager) {
          clientUserRole = await prisma.role.findFirst({
            where: { code: "CLIENT_USER" },
          });

          if (!clientUserRole) {
            reply.code(500);
            return {
              success: false,
              error: {
                code: "INTERNAL_ERROR",
                message: "CLIENT_USER role not found in system",
              },
            };
          }
        }

        // Create store, manager, and terminals in a single transaction
        const result = await prisma.$transaction(async (tx) => {
          // 1. Create store using service (which handles validation)
          const store = await storeService.createStore(
            {
              company_id: params.companyId,
              name: body.name,
              location_json: body.location_json,
              timezone: body.timezone,
              status: body.status,
              // === Structured Address Fields ===
              address_line1: body.address_line1,
              address_line2: body.address_line2,
              city: body.city,
              state_id: body.state_id,
              county_id: body.county_id,
              zip_code: body.zip_code,
            },
            tx,
          );

          let createdManager = null;
          let createdTerminals: Array<{
            pos_terminal_id: string;
            name: string;
            device_id: string | null;
            connection_type: string;
            pos_type: string;
          }> = [];

          // 2. Create store login if provided
          if (body.manager && clientUserRole) {
            const passwordHash = await bcrypt.hash(body.manager.password, 10);

            // Create user with store name as user name
            const newUser = await tx.user.create({
              data: {
                public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
                email: body.manager.email.toLowerCase().trim(),
                name: body.name, // Use store name as user name
                password_hash: passwordHash,
                status: "ACTIVE",
                is_client_user: true,
              },
            });

            // Create user role with STORE scope
            await tx.userRole.create({
              data: {
                user_id: newUser.user_id,
                role_id: clientUserRole.role_id,
                company_id: params.companyId,
                store_id: store.store_id,
                assigned_by: user.id,
              },
            });

            // Update store with login reference
            await tx.store.update({
              where: { store_id: store.store_id },
              data: { store_login_user_id: newUser.user_id },
            });

            createdManager = {
              user_id: newUser.user_id,
              email: newUser.email,
              name: newUser.name,
            };

            // Audit log for store login creation
            await tx.auditLog.create({
              data: {
                user_id: user.id,
                action: "CREATE",
                table_name: "users",
                record_id: newUser.user_id,
                new_values: {
                  user_id: newUser.user_id,
                  email: newUser.email,
                  name: newUser.name,
                  is_store_login: true,
                  store_id: store.store_id,
                  store_name: body.name,
                } as any,
                ip_address: ipAddress,
                user_agent: userAgent,
                reason: `Store login created with store ${body.name} by ${user.email}`,
              },
            });
          }

          // 3. Create terminals if provided
          if (body.terminals && body.terminals.length > 0) {
            for (const terminalData of body.terminals) {
              const terminal = await tx.pOSTerminal.create({
                data: {
                  store_id: store.store_id,
                  name: terminalData.name,
                  device_id: terminalData.device_id || null,
                  connection_type:
                    (terminalData.connection_type as any) || "MANUAL",
                  pos_type: (terminalData.pos_type as any) || "MANUAL_ENTRY",
                  connection_config:
                    (terminalData.connection_config as any) || {},
                  terminal_status: "ACTIVE",
                  sync_status: "NEVER",
                },
              });

              createdTerminals.push({
                pos_terminal_id: terminal.pos_terminal_id,
                name: terminal.name,
                device_id: terminal.device_id,
                connection_type: terminal.connection_type,
                pos_type: terminal.pos_type,
              });

              // Audit log for each terminal
              await tx.auditLog.create({
                data: {
                  user_id: user.id,
                  action: "CREATE",
                  table_name: "pos_terminals",
                  record_id: terminal.pos_terminal_id,
                  new_values: {
                    pos_terminal_id: terminal.pos_terminal_id,
                    store_id: store.store_id,
                    name: terminal.name,
                    device_id: terminal.device_id,
                    connection_type: terminal.connection_type,
                  } as any,
                  ip_address: ipAddress,
                  user_agent: userAgent,
                  reason: `Terminal created with store ${body.name} by ${user.email}`,
                },
              });
            }
          }

          // 4. Audit log for store creation
          await tx.auditLog.create({
            data: {
              user_id: user.id,
              action: "CREATE",
              table_name: "stores",
              record_id: store.store_id,
              new_values: {
                ...store,
                manager_created: !!createdManager,
                terminals_created: createdTerminals.length,
              } as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Store created by ${user.email} (roles: ${user.roles.join(", ")})${createdManager ? " with manager" : ""}${createdTerminals.length > 0 ? ` and ${createdTerminals.length} terminal(s)` : ""}`,
            },
          });

          return {
            store,
            manager: createdManager,
            terminals: createdTerminals,
          };
        });

        reply.code(201);
        return {
          ...result.store,
          manager: result.manager,
          terminals: result.terminals,
          request_metadata: {
            timestamp: new Date().toISOString(),
            request_id: request.id,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error creating store");
        if (
          error.message.includes("required") ||
          error.message.includes("Invalid") ||
          error.message.includes("cannot")
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create store",
          },
        };
      }
    },
  );

  /**
   * GET /api/companies/:companyId/stores
   * List all stores for a company
   * Protected route - requires STORE_READ permission
   */
  fastify.get(
    "/api/companies/:companyId/stores",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_READ),
      ],
      schema: {
        description: "List all stores for a company",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["companyId"],
          properties: {
            companyId: {
              type: "string",
              format: "uuid",
              description: "Company UUID",
            },
          },
        },
        querystring: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
              description: "Items per page (max 100)",
            },
            offset: {
              type: "integer",
              minimum: 0,
              default: 0,
              description: "Pagination offset",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    store_id: { type: "string", format: "uuid" },
                    public_id: { type: "string" },
                    company_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    location_json: {
                      type: "object",
                      additionalProperties: true,
                    },
                    // Structured address fields
                    address_line1: { type: "string", nullable: true },
                    address_line2: { type: "string", nullable: true },
                    city: { type: "string", nullable: true },
                    state_id: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    county_id: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    zip_code: { type: "string", nullable: true },
                    timezone: { type: "string" },
                    status: { type: "string" },
                    created_at: { type: "string", format: "date-time" },
                    updated_at: { type: "string", format: "date-time" },
                  },
                },
              },
              meta: {
                type: "object",
                properties: {
                  total: { type: "integer" },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { companyId: string };
        const user = (request as any).user as UserIdentity;

        // Verify user can view stores for this company (company isolation)
        // System Admins can view stores for ANY company
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          const userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId || userCompanyId !== params.companyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only view stores for your assigned company",
              },
            };
          }
        }

        const stores = await storeService.getStoresByCompany(params.companyId);

        reply.code(200);
        return {
          data: stores,
          meta: {
            total: stores.length,
            limit: (request.query as any)?.limit || 20,
            offset: (request.query as any)?.offset || 0,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error retrieving stores");
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to retrieve stores",
          },
        };
      }
    },
  );

  /**
   * GET /api/stores/:storeId
   * Get store by ID
   * Protected route - requires STORE_READ permission
   */
  fastify.get(
    "/api/stores/:storeId",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "Get store by ID",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              store_id: { type: "string", format: "uuid" },
              public_id: { type: "string" },
              company_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              location_json: {
                type: "object",
                additionalProperties: true,
              },
              // Structured address fields
              address_line1: { type: "string", nullable: true },
              address_line2: { type: "string", nullable: true },
              city: { type: "string", nullable: true },
              state_id: { type: "string", format: "uuid", nullable: true },
              county_id: { type: "string", format: "uuid", nullable: true },
              zip_code: { type: "string", nullable: true },
              timezone: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
              // === POS Connection Configuration ===
              // SEC-014: OUTPUT_FILTERING - Whitelist POS fields for desktop app configuration
              // These fields are required by the frontend EditStoreModal to display saved POS config
              pos_type: {
                type: "string",
                enum: [
                  "GILBARCO_PASSPORT",
                  "GILBARCO_NAXML",
                  "GILBARCO_COMMANDER",
                  "VERIFONE_RUBY2",
                  "VERIFONE_COMMANDER",
                  "VERIFONE_SAPPHIRE",
                  "CLOVER_REST",
                  "ORACLE_SIMPHONY",
                  "NCR_ALOHA",
                  "LIGHTSPEED_REST",
                  "SQUARE_REST",
                  "TOAST_REST",
                  "GENERIC_XML",
                  "GENERIC_REST",
                  "MANUAL_ENTRY",
                ],
              },
              pos_connection_type: {
                type: "string",
                enum: ["NETWORK", "API", "WEBHOOK", "FILE", "MANUAL"],
              },
              pos_connection_config: {
                type: ["object", "null"],
                additionalProperties: true,
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { storeId: string };
      const user = (request as any).user as UserIdentity;
      try {
        // Check if store exists FIRST (before permission check)
        // This ensures we return 404 for non-existent stores, not 403
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Get user's company_id for isolation check
        // System Admins can access ANY store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You must have a COMPANY scope role to access stores",
              },
            };
          }

          // Check company isolation
          if (store.company_id !== userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only access stores for your assigned company",
              },
            };
          }
        }

        // Check permission (after existence and ownership checks)
        const hasPermission = await rbacService.checkPermission(
          user.id,
          PERMISSIONS.STORE_READ,
          { storeId: params.storeId, companyId: userCompanyId || undefined },
        );

        if (!hasPermission) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied: ${PERMISSIONS.STORE_READ} is required`,
            },
          };
        }

        reply.code(200);
        return store;
      } catch (error: any) {
        fastify.log.error({ error }, "Error retrieving store");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to retrieve store",
          },
        };
      }
    },
  );

  /**
   * PUT /api/stores/:storeId
   * Update store
   * Protected route - requires STORE_UPDATE permission
   */
  fastify.put(
    "/api/stores/:storeId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_UPDATE),
      ],
      schema: {
        description: "Update store",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 255,
              description: "Store name",
            },
            location_json: {
              type: "object",
              properties: {
                address: {
                  type: "string",
                  description:
                    "Store address (deprecated - use structured fields)",
                },
              },
              description:
                "Store location - DEPRECATED: Use structured address fields instead",
            },
            timezone: {
              type: "string",
              description:
                "IANA timezone format (e.g., America/New_York, Europe/London) - validated by service layer",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "CLOSED"],
              description: "Store status",
            },
            // === Structured Address Fields ===
            address_line1: {
              type: "string",
              maxLength: 255,
              description: "Street address line 1 (e.g., '123 Main Street')",
            },
            address_line2: {
              type: ["string", "null"],
              maxLength: 255,
              description: "Street address line 2 (e.g., 'Suite 100')",
            },
            city: {
              type: "string",
              maxLength: 100,
              description: "City name",
            },
            state_id: {
              type: "string",
              format: "uuid",
              description:
                "State UUID - CRITICAL: determines lottery game visibility",
            },
            county_id: {
              type: ["string", "null"],
              format: "uuid",
              description: "County UUID - for tax jurisdiction",
            },
            zip_code: {
              type: "string",
              pattern: "^[0-9]{5}(-[0-9]{4})?$",
              description: "ZIP code (5-digit or ZIP+4 format)",
            },
            // === POS Connection Configuration ===
            // SEC-014: INPUT_VALIDATION - Strict enum allowlists for POS types
            pos_type: {
              type: "string",
              enum: [
                "GILBARCO_PASSPORT",
                "GILBARCO_NAXML",
                "GILBARCO_COMMANDER",
                "VERIFONE_RUBY2",
                "VERIFONE_COMMANDER",
                "VERIFONE_SAPPHIRE",
                "CLOVER_REST",
                "ORACLE_SIMPHONY",
                "NCR_ALOHA",
                "LIGHTSPEED_REST",
                "SQUARE_REST",
                "TOAST_REST",
                "GENERIC_XML",
                "GENERIC_REST",
                "MANUAL_ENTRY",
              ],
              description: "POS System Type - Which POS vendor/protocol to use",
            },
            pos_connection_type: {
              type: "string",
              enum: ["NETWORK", "API", "WEBHOOK", "FILE", "MANUAL"],
              description:
                "POS Connection Type - How to connect to the POS system",
            },
            pos_connection_config: {
              type: ["object", "null"],
              description:
                "Connection-specific configuration (JSON) - structure depends on connection type",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              store_id: { type: "string", format: "uuid" },
              public_id: { type: "string" },
              company_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              location_json: {
                type: "object",
                additionalProperties: true,
              },
              timezone: { type: "string" },
              status: { type: "string" },
              // Structured address fields in response
              address_line1: { type: ["string", "null"] },
              address_line2: { type: ["string", "null"] },
              city: { type: ["string", "null"] },
              state_id: { type: ["string", "null"], format: "uuid" },
              county_id: { type: ["string", "null"], format: "uuid" },
              zip_code: { type: ["string", "null"] },
              state: {
                type: ["object", "null"],
                properties: {
                  state_id: { type: "string", format: "uuid" },
                  code: { type: "string" },
                  name: { type: "string" },
                },
              },
              county: {
                type: ["object", "null"],
                properties: {
                  county_id: { type: "string", format: "uuid" },
                  name: { type: "string" },
                },
              },
              // POS Connection Configuration in response
              pos_type: {
                type: "string",
                enum: [
                  "GILBARCO_PASSPORT",
                  "GILBARCO_NAXML",
                  "GILBARCO_COMMANDER",
                  "VERIFONE_RUBY2",
                  "VERIFONE_COMMANDER",
                  "VERIFONE_SAPPHIRE",
                  "CLOVER_REST",
                  "ORACLE_SIMPHONY",
                  "NCR_ALOHA",
                  "LIGHTSPEED_REST",
                  "SQUARE_REST",
                  "TOAST_REST",
                  "GENERIC_XML",
                  "GENERIC_REST",
                  "MANUAL_ENTRY",
                ],
              },
              pos_connection_type: {
                type: "string",
                enum: ["NETWORK", "API", "WEBHOOK", "FILE", "MANUAL"],
              },
              pos_connection_config: {
                type: ["object", "null"],
                additionalProperties: true,
              },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { storeId: string };
        const body = request.body as {
          name?: string;
          location_json?: {
            address?: string;
          };
          timezone?: string;
          status?: "ACTIVE" | "INACTIVE" | "CLOSED";
          // Structured address fields
          address_line1?: string;
          address_line2?: string | null;
          city?: string;
          state_id?: string;
          county_id?: string | null;
          zip_code?: string;
          // POS Connection Configuration
          pos_type?:
            | "GILBARCO_PASSPORT"
            | "GILBARCO_NAXML"
            | "GILBARCO_COMMANDER"
            | "VERIFONE_RUBY2"
            | "VERIFONE_COMMANDER"
            | "VERIFONE_SAPPHIRE"
            | "CLOVER_REST"
            | "ORACLE_SIMPHONY"
            | "NCR_ALOHA"
            | "LIGHTSPEED_REST"
            | "SQUARE_REST"
            | "TOAST_REST"
            | "GENERIC_XML"
            | "GENERIC_REST"
            | "MANUAL_ENTRY";
          pos_connection_type?:
            | "NETWORK"
            | "API"
            | "WEBHOOK"
            | "FILE"
            | "MANUAL";
          pos_connection_config?: Record<string, unknown> | null;
        };
        const user = (request as any).user as UserIdentity;

        // Check if store exists FIRST (before permission check)
        // This ensures we return 404 for non-existent stores, not 403
        const oldStore = await prisma.store.findUnique({
          where: { store_id: params.storeId },
        });

        if (!oldStore) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Get user's company_id for isolation check
        // System Admins can update ANY store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You must have a COMPANY scope role to update stores",
              },
            };
          }

          // Check company isolation
          if (oldStore.company_id !== userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only update stores for your assigned company",
              },
            };
          }
        }

        // Validate location_json.address if provided
        if (body.location_json?.address !== undefined) {
          // Ensure address is a string
          if (typeof body.location_json.address !== "string") {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "location_json.address must be a string",
              },
            };
          }
          // TODO: Replace regex-based XSS protection with a dedicated sanitization library (e.g., DOMPurify, sanitize-html)
          // XSS protection: Reject addresses containing script tags or other dangerous HTML
          const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
          if (xssPattern.test(body.location_json.address)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Invalid address: HTML tags and scripts are not allowed",
              },
            };
          }
        }

        // Update store (service will verify company isolation)
        // Service layer handles SEC-014: INPUT_VALIDATION for POS fields
        const store = await storeService.updateStore(
          params.storeId,
          userCompanyId || oldStore.company_id,
          {
            name: body.name,
            location_json: body.location_json,
            timezone: body.timezone,
            status: body.status,
            // Structured address fields
            address_line1: body.address_line1,
            address_line2: body.address_line2,
            city: body.city,
            state_id: body.state_id,
            county_id: body.county_id,
            zip_code: body.zip_code,
            // POS Connection Configuration
            pos_type: body.pos_type,
            pos_connection_type: body.pos_connection_type,
            pos_connection_config: body.pos_connection_config,
          },
        );

        // Log store update to AuditLog (BLOCKING)
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "UPDATE",
              table_name: "stores",
              record_id: store.store_id,
              old_values: JSON.stringify(oldStore) as any,
              new_values: JSON.stringify(store) as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Store updated by ${user.email} (roles: ${user.roles.join(", ")})`,
            },
          });
        } catch (auditError) {
          // If audit log fails, revert the update and fail the request
          // Restore ALL updatable fields to ensure complete rollback
          await storeService.updateStore(
            params.storeId,
            userCompanyId || oldStore.company_id,
            {
              name: oldStore.name,
              location_json: oldStore.location_json as any,
              timezone: oldStore.timezone,
              status: oldStore.status as any,
              // Structured address fields
              address_line1: oldStore.address_line1 ?? undefined,
              address_line2: oldStore.address_line2,
              city: oldStore.city ?? undefined,
              state_id: oldStore.state_id ?? undefined,
              county_id: oldStore.county_id,
              zip_code: oldStore.zip_code ?? undefined,
              // POS Connection Configuration
              pos_type: oldStore.pos_type as any,
              pos_connection_type: oldStore.pos_connection_type as any,
              pos_connection_config: oldStore.pos_connection_config as Record<
                string,
                unknown
              > | null,
            },
          );
          throw new Error("Failed to create audit log - operation rolled back");
        }

        reply.code(200);
        return store;
      } catch (error: any) {
        fastify.log.error({ error }, "Error updating store");
        // SEC-014: INPUT_VALIDATION - Return 400 for all validation errors from service layer
        // Check for various validation error patterns (case-insensitive where appropriate)
        const errorMsg = error.message.toLowerCase();
        if (
          error.message.includes("required") ||
          error.message.includes("Invalid") ||
          error.message.includes("cannot") ||
          errorMsg.includes("invalid") ||
          errorMsg.includes("exceeds") ||
          errorMsg.includes("must be")
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          };
        }
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update store",
          },
        };
      }
    },
  );

  /**
   * PUT /api/stores/:storeId/configuration
   * Update store configuration (timezone, location, operating hours)
   * Protected route - requires STORE_UPDATE permission
   * Only Store Managers can update their store's configuration
   */
  fastify.put(
    "/api/stores/:storeId/configuration",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "Update store configuration",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            timezone: {
              type: "string",
              description:
                "IANA timezone format (e.g., America/New_York, Europe/London) - validated by service layer",
            },
            location_json: {
              type: "object",
              properties: {
                address: {
                  type: "string",
                  description: "Store address",
                },
              },
              description: "Store location (address only)",
            },
            location: {
              type: "object",
              properties: {
                address: {
                  type: "string",
                  description: "Store address",
                },
              },
              description:
                "Store location (address only) - deprecated, use location_json",
            },
            operating_hours: {
              type: "object",
              properties: {
                monday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                      description: "Open time in HH:mm format",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                      description: "Close time in HH:mm format",
                    },
                    closed: {
                      type: "boolean",
                      description: "If true, store is closed on this day",
                    },
                  },
                },
                tuesday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
                wednesday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
                thursday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
                friday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
                saturday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
                sunday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
              },
              description: "Operating hours for each day of the week",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              store_id: { type: "string", format: "uuid" },
              company_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              timezone: { type: "string" },
              location_json: {
                type: "object",
                additionalProperties: true,
              },
              status: { type: "string" },
              configuration: { type: "object" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { storeId: string };
        const body = request.body as {
          timezone?: string;
          location_json?: {
            address?: string;
          };
          location?: {
            address?: string;
          };
          operating_hours?: {
            monday?: { open?: string; close?: string; closed?: boolean };
            tuesday?: { open?: string; close?: string; closed?: boolean };
            wednesday?: { open?: string; close?: string; closed?: boolean };
            thursday?: { open?: string; close?: string; closed?: boolean };
            friday?: { open?: string; close?: string; closed?: boolean };
            saturday?: { open?: string; close?: string; closed?: boolean };
            sunday?: { open?: string; close?: string; closed?: boolean };
          };
        };
        const user = (request as any).user as UserIdentity;

        // Check if store exists FIRST (before permission check)
        const oldStore = await prisma.store.findUnique({
          where: { store_id: params.storeId },
        });

        if (!oldStore) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Get user's company_id for isolation check
        // System Admins can update ANY store configuration
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message:
                  "You must have a COMPANY scope role to update store configuration",
              },
            };
          }

          // Check company isolation
          if (oldStore.company_id !== userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only update stores for your assigned company",
              },
            };
          }
        }

        // Check permission (after ownership check to give specific error)
        const hasPermission = await rbacService.checkPermission(
          user.id,
          PERMISSIONS.STORE_UPDATE,
          { storeId: params.storeId, companyId: userCompanyId || undefined },
        );

        if (!hasPermission) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied: ${PERMISSIONS.STORE_UPDATE} is required`,
            },
          };
        }

        // Update store configuration (service will verify company isolation and validate)
        // Support both location_json (preferred) and location (deprecated) for backward compatibility
        const locationData = body.location_json || body.location;

        // Track which fields were updated and their old values for audit
        const fieldsUpdated: {
          timezone?: boolean;
          location_json?: boolean;
          configuration?: boolean;
        } = {};

        // Validate timezone format before transaction (same validation as storeService)
        if (body.timezone !== undefined) {
          if (!isValidIANATimezone(body.timezone)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Invalid timezone format. Must be IANA timezone format (e.g., America/New_York, Europe/London)",
              },
            };
          }
          fieldsUpdated.timezone = true;
        }

        // Validate location_json structure if provided (same validation as storeService)
        if (locationData !== undefined) {
          if (
            locationData.address !== undefined &&
            typeof locationData.address !== "string"
          ) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "location_json.address must be a string",
              },
            };
          }
          // TODO: Replace regex-based XSS protection with a dedicated sanitization library (e.g., DOMPurify, sanitize-html)
          // XSS protection: Reject addresses containing script tags or other dangerous HTML
          if (
            locationData.address &&
            typeof locationData.address === "string"
          ) {
            const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
            if (xssPattern.test(locationData.address)) {
              reply.code(400);
              return {
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message:
                    "Invalid address: HTML tags and scripts are not allowed",
                },
              };
            }
          }
          fieldsUpdated.location_json = true;
        }

        // Track if configuration is being updated
        if (body.operating_hours !== undefined) {
          fieldsUpdated.configuration = true;
        }

        // If no fields are being updated, return early
        if (
          !fieldsUpdated.timezone &&
          !fieldsUpdated.location_json &&
          !fieldsUpdated.configuration
        ) {
          reply.code(200);
          return oldStore;
        }

        // Prepare old values for audit (capture before any updates)
        const oldValues: any = {};
        const newValues: any = {};
        const updatedFields: string[] = [];

        if (fieldsUpdated.timezone) {
          oldValues.timezone = oldStore.timezone;
          newValues.timezone = body.timezone;
          updatedFields.push("timezone");
        }

        if (fieldsUpdated.location_json) {
          oldValues.location_json = oldStore.location_json;
          newValues.location_json = locationData;
          updatedFields.push("location_json");
        }

        if (fieldsUpdated.configuration) {
          oldValues.configuration = oldStore.configuration;
          // Will be set after merge below
          updatedFields.push("configuration");
        }

        // Perform all updates in a single Prisma transaction
        // This ensures atomicity: if any update or audit log creation fails, everything rolls back
        const store = await prisma.$transaction(async (tx) => {
          // Prepare update data for store fields (timezone and location_json)
          const updateData: any = {};
          if (fieldsUpdated.timezone) {
            updateData.timezone = body.timezone;
          }
          if (fieldsUpdated.location_json) {
            updateData.location_json = locationData;
          }

          // Prepare configuration update if operating_hours is provided
          if (fieldsUpdated.configuration) {
            // Merge new configuration with existing configuration (deep merge)
            // Same logic as storeService.updateStoreConfiguration
            const existingConfig = (oldStore.configuration as any) || {};
            const mergedConfig = {
              ...existingConfig,
              operating_hours: {
                ...(existingConfig.operating_hours || {}),
                ...body.operating_hours,
              },
            };
            updateData.configuration = mergedConfig;
            newValues.configuration = mergedConfig;
          }

          // Update store with all fields atomically
          const updatedStore = await tx.store.update({
            where: { store_id: params.storeId },
            data: updateData,
          });

          // Create audit log within the same transaction
          // If this fails, the entire transaction (including store update) will roll back
          if (Object.keys(oldValues).length > 0) {
            const ipAddress =
              (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
              request.ip ||
              request.socket.remoteAddress ||
              null;
            const userAgent = request.headers["user-agent"] || null;

            await tx.auditLog.create({
              data: {
                user_id: user.id,
                action: "UPDATE",
                table_name: "stores",
                record_id: updatedStore.store_id,
                old_values: oldValues as any,
                new_values: newValues as any,
                ip_address: ipAddress,
                user_agent: userAgent,
                reason: `Store ${updatedFields.join(", ")} updated by ${user.email} (roles: ${user.roles.join(", ")})`,
              },
            });
          }

          return updatedStore;
        });

        reply.code(200);
        return store;
      } catch (error: any) {
        const errorParams = request.params as { storeId?: string } | undefined;
        const errorUser = (request as any).user as UserIdentity | undefined;
        fastify.log.error(
          {
            error,
            storeId: errorParams?.storeId,
            userId: errorUser?.id,
          },
          "Error updating store configuration",
        );
        if (
          error.message.includes("required") ||
          error.message.includes("Invalid") ||
          error.message.includes("cannot") ||
          error.message.includes("must be")
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          };
        }
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update store configuration",
          },
        };
      }
    },
  );

  /**
   * DELETE /api/stores/:storeId
   * Hard delete store (permanently removes the store)
   * Protected route - requires STORE_DELETE permission
   */
  fastify.delete(
    "/api/stores/:storeId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_DELETE),
      ],
      schema: {
        description: "Hard delete store",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { storeId: string };
      const user = (request as any).user as UserIdentity;
      try {
        // Check if store exists FIRST (before permission check)
        // This ensures we return 404 for non-existent stores, not 403
        const oldStore = await prisma.store.findUnique({
          where: { store_id: params.storeId },
        });

        if (!oldStore) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Get user's company_id for isolation check
        // System Admins can delete ANY store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You must have a COMPANY scope role to delete stores",
              },
            };
          }

          // Check company isolation
          if (oldStore.company_id !== userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only delete stores for your assigned company",
              },
            };
          }
        } else {
          // System admin: use the store's company_id for the service call
          userCompanyId = oldStore.company_id;
        }

        // Hard delete store (service will verify company isolation and ACTIVE status)
        await storeService.deleteStore(params.storeId, userCompanyId!);

        // Log store deletion to AuditLog (non-blocking - don't fail the deletion if audit fails)
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "DELETE",
              table_name: "stores",
              record_id: params.storeId,
              old_values: JSON.stringify(oldStore) as any,
              new_values: {} as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Store permanently deleted by ${user.email} (roles: ${user.roles.join(", ")})`,
            },
          });
        } catch (auditError) {
          // Log the audit failure but don't fail the deletion operation
          console.error(
            "Failed to create audit log for store deletion:",
            auditError,
          );
        }

        reply.code(200);
        return {
          success: true,
          message: "Store permanently deleted",
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error deleting store");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        if (error.message.includes("ACTIVE store")) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete store",
          },
        };
      }
    },
  );

  /**
   * GET /api/stores/:storeId/terminals
   * Get terminals for a store with active shift status
   * Story 4.8: Cashier Shift Start Flow
   * Protected route - requires STORE_READ permission
   */
  fastify.get(
    "/api/stores/:storeId/terminals",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_READ),
      ],
      schema: {
        description: "Get terminals for a store with active shift status",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pos_terminal_id: { type: "string", format: "uuid" },
                store_id: { type: "string", format: "uuid" },
                name: { type: "string" },
                device_id: { type: "string", nullable: true },
                connection_type: {
                  type: "string",
                  enum: ["NETWORK", "API", "WEBHOOK", "FILE", "MANUAL"],
                },
                connection_config: {
                  type: "object",
                  nullable: true,
                  additionalProperties: true,
                },
                pos_type: {
                  type: "string",
                  enum: [
                    "GILBARCO_PASSPORT",
                    "GILBARCO_NAXML",
                    "GILBARCO_COMMANDER",
                    "VERIFONE_RUBY2",
                    "VERIFONE_COMMANDER",
                    "VERIFONE_SAPPHIRE",
                    "CLOVER_REST",
                    "ORACLE_SIMPHONY",
                    "NCR_ALOHA",
                    "LIGHTSPEED_REST",
                    "SQUARE_REST",
                    "TOAST_REST",
                    "GENERIC_XML",
                    "GENERIC_REST",
                    "MANUAL_ENTRY",
                  ],
                },
                terminal_status: {
                  type: "string",
                  enum: ["ACTIVE", "INACTIVE", "PENDING", "ERROR"],
                },
                last_sync_at: {
                  type: "string",
                  nullable: true,
                  format: "date-time",
                },
                sync_status: {
                  type: "string",
                  enum: ["NEVER", "SUCCESS", "FAILED", "IN_PROGRESS"],
                },
                status: { type: "string" },
                has_active_shift: { type: "boolean" },
                active_shift_cashier_name: { type: "string", nullable: true },
                deleted_at: {
                  type: "string",
                  nullable: true,
                  format: "date-time",
                },
                created_at: { type: "string", format: "date-time" },
                updated_at: { type: "string", format: "date-time" },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { storeId: string };
      const user = (request as any).user as UserIdentity;
      try {
        // Get terminals with active shift status (service handles authorization including SYSTEM scope bypass)
        const terminals = await storeService.getStoreTerminals(
          params.storeId,
          user.id,
        );

        reply.code(200);
        return terminals;
      } catch (error: any) {
        fastify.log.error({ error }, "Error retrieving store terminals");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to retrieve store terminals",
          },
        };
      }
    },
  );

  /**
   * POST /api/stores/:storeId/terminals
   * Create a new POS terminal for a store
   * Protected route - requires STORE_CREATE permission
   */
  fastify.post(
    "/api/stores/:storeId/terminals",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_CREATE),
      ],
      schema: {
        description: "Create a new POS terminal for a store",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 100,
              description: "Terminal name",
            },
            device_id: {
              type: "string",
              maxLength: 255,
              description: "Device ID (optional, must be globally unique)",
            },
            connection_type: {
              type: "string",
              enum: ["NETWORK", "API", "WEBHOOK", "FILE", "MANUAL"],
              description: "POS connection type",
            },
            connection_config: {
              type: "object",
              nullable: true,
              additionalProperties: true,
              description:
                "Connection configuration (structure depends on connection_type)",
            },
            pos_type: {
              type: "string",
              enum: [
                "GILBARCO_PASSPORT",
                "GILBARCO_NAXML",
                "GILBARCO_COMMANDER",
                "VERIFONE_RUBY2",
                "VERIFONE_COMMANDER",
                "VERIFONE_SAPPHIRE",
                "CLOVER_REST",
                "ORACLE_SIMPHONY",
                "NCR_ALOHA",
                "LIGHTSPEED_REST",
                "SQUARE_REST",
                "TOAST_REST",
                "GENERIC_XML",
                "GENERIC_REST",
                "MANUAL_ENTRY",
              ],
              description: "POS system type (enterprise 15-type enum)",
            },
            terminal_status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "PENDING", "ERROR"],
              description: "Terminal status",
            },
            sync_status: {
              type: "string",
              enum: ["NEVER", "SUCCESS", "FAILED", "IN_PROGRESS"],
              description: "Sync status",
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              pos_terminal_id: { type: "string", format: "uuid" },
              store_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              device_id: { type: "string", nullable: true },
              connection_type: {
                type: "string",
                enum: ["NETWORK", "API", "WEBHOOK", "FILE", "MANUAL"],
              },
              connection_config: {
                type: "object",
                nullable: true,
                additionalProperties: true,
              },
              pos_type: {
                type: "string",
                enum: [
                  "GILBARCO_PASSPORT",
                  "GILBARCO_NAXML",
                  "GILBARCO_COMMANDER",
                  "VERIFONE_RUBY2",
                  "VERIFONE_COMMANDER",
                  "VERIFONE_SAPPHIRE",
                  "CLOVER_REST",
                  "ORACLE_SIMPHONY",
                  "NCR_ALOHA",
                  "LIGHTSPEED_REST",
                  "SQUARE_REST",
                  "TOAST_REST",
                  "GENERIC_XML",
                  "GENERIC_REST",
                  "MANUAL_ENTRY",
                ],
              },
              terminal_status: {
                type: "string",
                enum: ["ACTIVE", "INACTIVE", "PENDING", "ERROR"],
              },
              last_sync_at: {
                type: "string",
                nullable: true,
                format: "date-time",
              },
              sync_status: {
                type: "string",
                enum: ["NEVER", "SUCCESS", "FAILED", "IN_PROGRESS"],
              },
              deleted_at: {
                type: "string",
                nullable: true,
                format: "date-time",
              },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { storeId: string };
      const user = (request as any).user as UserIdentity;
      try {
        // Validate request body using Zod schema
        const validationResult = safeValidateCreateTerminalInput(request.body);
        if (!validationResult.success) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request data",
              details: validationResult.error.issues,
            },
          };
        }

        // Create terminal (service handles authorization including SYSTEM scope bypass)
        const terminal = await storeService.createTerminal(
          params.storeId,
          validationResult.data,
          user.id,
        );

        reply.code(201);
        return terminal;
      } catch (error: any) {
        fastify.log.error(
          {
            error,
            errorMessage: error.message,
            errorStack: error.stack,
            userId: user.id,
            storeId: params.storeId,
          },
          "Error creating terminal",
        );
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        if (
          error.message.includes("required") ||
          error.message.includes("must be") ||
          error.message.includes("already in use")
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create terminal",
          },
        };
      }
    },
  );

  /**
   * PUT /api/stores/:storeId/terminals/:terminalId
   * Update a POS terminal
   * Protected route - requires STORE_UPDATE permission
   */
  fastify.put(
    "/api/stores/:storeId/terminals/:terminalId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_UPDATE),
      ],
      schema: {
        description: "Update a POS terminal",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId", "terminalId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
            terminalId: {
              type: "string",
              format: "uuid",
              description: "Terminal UUID",
            },
          },
        },
        body: {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 100,
              description: "Terminal name",
            },
            device_id: {
              type: "string",
              maxLength: 255,
              description: "Device ID (optional, must be globally unique)",
            },
            connection_type: {
              type: "string",
              enum: ["NETWORK", "API", "WEBHOOK", "FILE", "MANUAL"],
              description: "POS connection type",
            },
            connection_config: {
              type: "object",
              nullable: true,
              additionalProperties: true,
              description:
                "Connection configuration (structure depends on connection_type)",
            },
            pos_type: {
              type: "string",
              enum: [
                "GILBARCO_PASSPORT",
                "GILBARCO_NAXML",
                "GILBARCO_COMMANDER",
                "VERIFONE_RUBY2",
                "VERIFONE_COMMANDER",
                "VERIFONE_SAPPHIRE",
                "CLOVER_REST",
                "ORACLE_SIMPHONY",
                "NCR_ALOHA",
                "LIGHTSPEED_REST",
                "SQUARE_REST",
                "TOAST_REST",
                "GENERIC_XML",
                "GENERIC_REST",
                "MANUAL_ENTRY",
              ],
              description: "POS system type (enterprise 15-type enum)",
            },
            terminal_status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "PENDING", "ERROR"],
              description: "Terminal status",
            },
            sync_status: {
              type: "string",
              enum: ["NEVER", "SUCCESS", "FAILED", "IN_PROGRESS"],
              description: "Sync status",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              pos_terminal_id: { type: "string", format: "uuid" },
              store_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              device_id: { type: "string", nullable: true },
              connection_type: {
                type: "string",
                enum: ["NETWORK", "API", "WEBHOOK", "FILE", "MANUAL"],
              },
              connection_config: {
                type: "object",
                nullable: true,
                additionalProperties: true,
              },
              pos_type: {
                type: "string",
                enum: [
                  "GILBARCO_PASSPORT",
                  "GILBARCO_NAXML",
                  "GILBARCO_COMMANDER",
                  "VERIFONE_RUBY2",
                  "VERIFONE_COMMANDER",
                  "VERIFONE_SAPPHIRE",
                  "CLOVER_REST",
                  "ORACLE_SIMPHONY",
                  "NCR_ALOHA",
                  "LIGHTSPEED_REST",
                  "SQUARE_REST",
                  "TOAST_REST",
                  "GENERIC_XML",
                  "GENERIC_REST",
                  "MANUAL_ENTRY",
                ],
              },
              terminal_status: {
                type: "string",
                enum: ["ACTIVE", "INACTIVE", "PENDING", "ERROR"],
              },
              last_sync_at: {
                type: "string",
                nullable: true,
                format: "date-time",
              },
              sync_status: {
                type: "string",
                enum: ["NEVER", "SUCCESS", "FAILED", "IN_PROGRESS"],
              },
              deleted_at: {
                type: "string",
                nullable: true,
                format: "date-time",
              },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as {
        storeId: string;
        terminalId: string;
      };
      const user = (request as any).user as UserIdentity;
      try {
        // Validate request body using Zod schema
        const validationResult = safeValidateUpdateTerminalInput(request.body);
        if (!validationResult.success) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request data",
              details: validationResult.error.issues,
            },
          };
        }

        // Update terminal (service handles authorization including SYSTEM scope bypass)
        const terminal = await storeService.updateTerminal(
          params.terminalId,
          validationResult.data,
          user.id,
        );

        reply.code(200);
        return terminal;
      } catch (error: any) {
        fastify.log.error({ error }, "Error updating terminal");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        if (
          error.message.includes("required") ||
          error.message.includes("must be") ||
          error.message.includes("already in use")
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update terminal",
          },
        };
      }
    },
  );

  /**
   * DELETE /api/stores/:storeId/terminals/:terminalId
   * Delete a POS terminal
   * Protected route - requires STORE_DELETE permission
   */
  fastify.delete(
    "/api/stores/:storeId/terminals/:terminalId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_DELETE),
      ],
      schema: {
        description: "Delete a POS terminal",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId", "terminalId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
            terminalId: {
              type: "string",
              format: "uuid",
              description: "Terminal UUID",
            },
          },
        },
        response: {
          204: {
            type: "null",
            description: "Terminal deleted successfully",
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as {
          storeId: string;
          terminalId: string;
        };
        const user = (request as any).user as UserIdentity;

        // Delete terminal (service handles authorization including SYSTEM scope bypass)
        await storeService.deleteTerminal(
          params.terminalId,
          params.storeId,
          user.id,
        );

        reply.code(204);
        return null;
      } catch (error: any) {
        fastify.log.error({ error }, "Error deleting terminal");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        if (error.message.includes("active shift")) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete terminal",
          },
        };
      }
    },
  );

  /**
   * GET /api/stores/:storeId/login
   * Get the store's login credential (CLIENT_USER assigned to this store)
   * Protected route - requires STORE_READ permission
   */
  fastify.get(
    "/api/stores/:storeId/login",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_READ),
      ],
      schema: {
        description:
          "Get store login credential (CLIENT_USER assigned to this store)",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              user_id: { type: "string", format: "uuid" },
              email: { type: "string" },
              name: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { storeId: string };
      const user = (request as any).user as UserIdentity;
      try {
        // Check if store exists
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          include: {
            store_login: {
              select: {
                user_id: true,
                email: true,
                name: true,
                status: true,
                created_at: true,
              },
            },
          },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Check company isolation
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          const userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId || userCompanyId !== store.company_id) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only access stores for your assigned company",
              },
            };
          }
        }

        // Check if store has a login credential
        if (!store.store_login) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store does not have a login credential assigned",
            },
          };
        }

        reply.code(200);
        return store.store_login;
      } catch (error: any) {
        fastify.log.error({ error }, "Error retrieving store login");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to retrieve store login",
          },
        };
      }
    },
  );

  /**
   * POST /api/stores/:storeId/login
   * Create a CLIENT_USER as the store's login credential
   * Protected route - requires STORE_CREATE permission
   */
  fastify.post(
    "/api/stores/:storeId/login",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_CREATE),
      ],
      schema: {
        description: "Create a CLIENT_USER as the store's login credential",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              maxLength: 255,
              description: "Store login email address",
            },
            password: {
              type: "string",
              minLength: 8,
              maxLength: 255,
              description: "Store login password (min 8 characters)",
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              user_id: { type: "string", format: "uuid" },
              email: { type: "string" },
              name: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          409: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { storeId: string };
      const body = request.body as { email: string; password: string };
      const user = (request as any).user as UserIdentity;
      try {
        // Check if store exists
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          include: {
            company: true,
          },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Check company isolation
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          const userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId || userCompanyId !== store.company_id) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message:
                  "You can only create store logins for stores in your assigned company",
              },
            };
          }
        }

        // Check if store already has a login credential
        if (store.store_login_user_id) {
          reply.code(409);
          return {
            success: false,
            error: {
              code: "CONFLICT",
              message:
                "Store already has a login credential. Use PUT to update the existing login.",
            },
          };
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.email)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid email format",
            },
          };
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
          where: { email: body.email.toLowerCase().trim() },
        });

        if (existingUser) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Email already exists",
            },
          };
        }

        // Validate password strength
        const passwordRegex =
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(body.password)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
            },
          };
        }

        // Get CLIENT_USER role
        const clientUserRole = await prisma.role.findFirst({
          where: { code: "CLIENT_USER" },
        });

        if (!clientUserRole) {
          reply.code(500);
          return {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "CLIENT_USER role not found in system",
            },
          };
        }

        // Create store login user in transaction
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        const result = await prisma.$transaction(async (tx) => {
          // Hash password
          const passwordHash = await bcrypt.hash(body.password, 10);

          // Create user with store name as user name
          const newUser = await tx.user.create({
            data: {
              public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
              email: body.email.toLowerCase().trim(),
              name: store.name, // Use store name as user name
              password_hash: passwordHash,
              status: "ACTIVE",
              is_client_user: true,
            },
          });

          // Create user role with STORE scope
          await tx.userRole.create({
            data: {
              user_id: newUser.user_id,
              role_id: clientUserRole.role_id,
              company_id: store.company_id,
              store_id: store.store_id,
              assigned_by: user.id,
            },
          });

          // Update store with login reference
          await tx.store.update({
            where: { store_id: store.store_id },
            data: { store_login_user_id: newUser.user_id },
          });

          // Create audit log
          await tx.auditLog.create({
            data: {
              user_id: user.id,
              action: "CREATE",
              table_name: "users",
              record_id: newUser.user_id,
              new_values: {
                user_id: newUser.user_id,
                email: newUser.email,
                name: newUser.name,
                is_store_login: true,
                store_id: store.store_id,
                store_name: store.name,
              } as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Store login created for store ${store.name} by ${user.email}`,
            },
          });

          return newUser;
        });

        reply.code(201);
        return {
          user_id: result.user_id,
          email: result.email,
          name: result.name,
          status: result.status,
          created_at: result.created_at,
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error creating store login");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create store login",
          },
        };
      }
    },
  );

  /**
   * PUT /api/stores/:storeId/login
   * Update the store's login email and/or password
   * Protected route - requires STORE_UPDATE permission
   */
  fastify.put(
    "/api/stores/:storeId/login",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_UPDATE),
      ],
      schema: {
        description: "Update store login email and/or password",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          properties: {
            email: {
              type: "string",
              format: "email",
              maxLength: 255,
              description: "New store login email address",
            },
            password: {
              type: "string",
              minLength: 8,
              maxLength: 255,
              description: "New store login password (min 8 characters)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              user_id: { type: "string", format: "uuid" },
              email: { type: "string" },
              name: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { storeId: string };
      const body = request.body as { email?: string; password?: string };
      const user = (request as any).user as UserIdentity;
      try {
        // Check if store exists and has a login credential
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          include: {
            store_login: true,
          },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Check company isolation
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          const userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId || userCompanyId !== store.company_id) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message:
                  "You can only update store logins for stores in your assigned company",
              },
            };
          }
        }

        // Check if store has a login credential
        if (!store.store_login) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message:
                "Store does not have a login credential. Use POST to create one.",
            },
          };
        }

        // Validate at least one field is being updated
        if (!body.email && !body.password) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "At least one of email or password must be provided",
            },
          };
        }

        // Build update data
        const updateData: { email?: string; password_hash?: string } = {};
        const oldValues: { email?: string } = {};
        const newValues: { email?: string; password_changed?: boolean } = {};

        // Validate and set email if provided
        if (body.email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(body.email)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid email format",
              },
            };
          }

          // Check if email already exists (different user)
          const existingUser = await prisma.user.findUnique({
            where: { email: body.email.toLowerCase().trim() },
          });

          if (
            existingUser &&
            existingUser.user_id !== store.store_login.user_id
          ) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Email already exists",
              },
            };
          }

          oldValues.email = store.store_login.email;
          updateData.email = body.email.toLowerCase().trim();
          newValues.email = updateData.email;
        }

        // Validate and set password if provided
        if (body.password) {
          const passwordRegex =
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
          if (!passwordRegex.test(body.password)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
              },
            };
          }

          updateData.password_hash = await bcrypt.hash(body.password, 10);
          newValues.password_changed = true;
        }

        // Update store login in transaction
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        const result = await prisma.$transaction(async (tx) => {
          // Update user
          const updatedUser = await tx.user.update({
            where: { user_id: store.store_login!.user_id },
            data: updateData,
          });

          // Create audit log
          await tx.auditLog.create({
            data: {
              user_id: user.id,
              action: "UPDATE",
              table_name: "users",
              record_id: updatedUser.user_id,
              old_values: oldValues as any,
              new_values: newValues as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Store login updated for store ${store.name} by ${user.email}`,
            },
          });

          return updatedUser;
        });

        reply.code(200);
        return {
          user_id: result.user_id,
          email: result.email,
          name: result.name,
          status: result.status,
          created_at: result.created_at,
          updated_at: result.updated_at,
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error updating store login");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update store login",
          },
        };
      }
    },
  );

  /**
   * GET /api/stores/:storeId/shifts/open-check
   * Check if there are open shifts for a business date
   *
   * Defense-in-depth: Frontend uses this to show blocking UI before day/lottery close
   * Backend validation still enforces the rule - this is for UX only
   *
   * DB-006: Tenant isolation via store_id scoping
   * API-003: Structured response format
   * SEC-014: Only returns necessary shift information
   *
   * Protected route - requires SHIFT_CLOSE permission (same as day close operations)
   */
  fastify.get(
    "/api/stores/:storeId/shifts/open-check",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.SHIFT_CLOSE),
      ],
      schema: {
        description: "Check if there are open shifts for a business date",
        tags: ["stores", "shifts"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        querystring: {
          type: "object",
          properties: {
            business_date: {
              type: "string",
              format: "date",
              description: "Business date (YYYY-MM-DD). Defaults to today.",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  has_open_shifts: { type: "boolean" },
                  open_shift_count: { type: "integer" },
                  open_shifts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        shift_id: { type: "string", format: "uuid" },
                        terminal_name: { type: ["string", "null"] },
                        cashier_name: { type: "string" },
                        shift_number: { type: ["integer", "null"] },
                        status: { type: "string" },
                        opened_at: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { storeId: string };
      const query = request.query as { business_date?: string };
      const user = (request as any).user as UserIdentity;

      try {
        // Validate store exists and get timezone for date calculations
        // DB-006: Tenant isolation - fetch store to validate access and get timezone
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          select: { store_id: true, company_id: true, timezone: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate user access to this store (company isolation)
        // SEC-014: RLS enforcement via company_id check
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          const userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId || userCompanyId !== store.company_id) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You do not have access to this store",
              },
            };
          }
        }

        // BUSINESS RULE: For day close blocking, we need to find ALL open shifts
        // regardless of when they were opened. A shift that started yesterday
        // but is still open MUST block today's day close.
        //
        // The optional business_date filter is for reporting purposes only,
        // not for the blocking check. When no date is provided, we find ALL open shifts.

        // DB-001: Using ORM query builder for safe parameterized queries
        // DB-006: Tenant isolation via store_id scoping
        let openShifts;

        if (query.business_date) {
          // Date filter requested - for reporting use cases
          const storeTimezone = store.timezone || DEFAULT_STORE_TIMEZONE;
          const { startUTC, endUTC } = getCalendarDayBoundaries(
            query.business_date,
            storeTimezone,
          );
          openShifts = await prisma.shift.findMany({
            where: {
              store_id: params.storeId,
              status: { in: ["OPEN", "ACTIVE", "CLOSING", "RECONCILING"] },
              opened_at: { gte: startUTC, lte: endUTC },
            },
            select: {
              shift_id: true,
              shift_number: true,
              status: true,
              opened_at: true,
              pos_terminal: { select: { name: true } },
              cashier: { select: { name: true } },
            },
          });
        } else {
          // No date filter - find ALL open shifts for day close blocking
          openShifts = await prisma.shift.findMany({
            where: {
              store_id: params.storeId,
              status: { in: ["OPEN", "ACTIVE", "CLOSING", "RECONCILING"] },
            },
            select: {
              shift_id: true,
              shift_number: true,
              status: true,
              opened_at: true,
              pos_terminal: { select: { name: true } },
              cashier: { select: { name: true } },
            },
          });
        }

        // API-003: Structured response format with consistent field names
        return reply.send({
          success: true,
          data: {
            has_open_shifts: openShifts.length > 0,
            open_shift_count: openShifts.length,
            open_shifts: openShifts.map((s) => ({
              shift_id: s.shift_id,
              terminal_name: s.pos_terminal?.name || null,
              cashier_name: s.cashier.name,
              shift_number: s.shift_number,
              status: s.status,
              opened_at: s.opened_at.toISOString(),
            })),
          },
        });
      } catch (error: any) {
        // LM-001: Structured logging with context
        fastify.log.error(
          { error, storeId: params.storeId },
          "Error checking open shifts",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to check open shifts",
          },
        };
      }
    },
  );

  // =============================================================================
  // LOTTERY BIN COUNT ENDPOINTS
  // =============================================================================

  /**
   * GET /api/stores/:storeId/lottery/bin-count
   * Get the configured lottery bin count and statistics for a store
   *
   * @enterprise-standards
   * - API-001: VALIDATION - UUID parameter validation
   * - API-003: ERROR_HANDLING - Structured error responses
   * - API-004: AUTHENTICATION - JWT auth required
   * - DB-006: TENANT_ISOLATION - Company/store scoped access
   */
  fastify.get<{
    Params: { storeId: string };
  }>(
    "/api/stores/:storeId/lottery/bin-count",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_CONFIG_READ),
      ],
      schema: {
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  store_id: { type: "string", format: "uuid" },
                  bin_count: { type: "integer", nullable: true },
                  active_bins: { type: "integer" },
                  bins_with_packs: { type: "integer" },
                  empty_bins: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.params as { storeId: string };
      const user = (request as any).user as UserIdentity;

      try {
        // Validate store access
        const store = await prisma.store.findUnique({
          where: { store_id: storeId },
          select: { store_id: true, company_id: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "STORE_NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Check user access to store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasAccess =
          userRoles.some((r) => r.scope === "SYSTEM") ||
          userRoles.some(
            (r) => r.scope === "COMPANY" && r.company_id === store.company_id,
          ) ||
          userRoles.some((r) => r.scope === "STORE" && r.store_id === storeId);

        if (!hasAccess) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "You do not have access to this store",
            },
          };
        }

        // Get bin count data
        const binCountData = await lotteryBinCountService.getBinCount(storeId);

        return {
          success: true,
          data: binCountData,
        };
      } catch (error: any) {
        fastify.log.error(
          { error, storeId },
          "Error getting lottery bin count",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get lottery bin count",
          },
        };
      }
    },
  );

  /**
   * PUT /api/stores/:storeId/lottery/bin-count
   * Update the lottery bin count and sync bin rows
   *
   * @enterprise-standards
   * - API-001: VALIDATION - Zod schema validation for request body
   * - API-003: ERROR_HANDLING - Structured error responses
   * - API-004: AUTHENTICATION - JWT auth required
   * - DB-006: TENANT_ISOLATION - Company/store scoped access
   * - SEC-014: INPUT_VALIDATION - Range constraints enforced
   */
  fastify.put<{
    Params: { storeId: string };
    Body: { bin_count: number };
  }>(
    "/api/stores/:storeId/lottery/bin-count",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_CONFIG_WRITE),
      ],
      schema: {
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          required: ["bin_count"],
          properties: {
            bin_count: {
              type: "integer",
              minimum: MIN_LOTTERY_BIN_COUNT,
              maximum: MAX_LOTTERY_BIN_COUNT,
              description: `Number of bins (${MIN_LOTTERY_BIN_COUNT}-${MAX_LOTTERY_BIN_COUNT})`,
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  previous_count: { type: "integer", nullable: true },
                  new_count: { type: "integer" },
                  bins_created: { type: "integer" },
                  bins_reactivated: { type: "integer" },
                  bins_deactivated: { type: "integer" },
                  bins_with_packs_count: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.params as { storeId: string };
      const user = (request as any).user as UserIdentity;
      const ipAddress =
        (request.headers["x-forwarded-for"] as string) ||
        request.ip ||
        "unknown";
      const userAgent = (request.headers["user-agent"] as string) || "unknown";

      try {
        // Validate request body with Zod
        const validation = safeValidateUpdateLotteryBinCount(request.body);
        if (!validation.success) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request body",
              details: validation.error.issues.map((e) => ({
                field: e.path.join("."),
                message: e.message,
              })),
            },
          };
        }

        const { bin_count } = validation.data;

        // Validate store access
        const store = await prisma.store.findUnique({
          where: { store_id: storeId },
          select: { store_id: true, company_id: true, name: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "STORE_NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Check user access to store (need COMPANY or higher for management)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasAccess =
          userRoles.some((r) => r.scope === "SYSTEM") ||
          userRoles.some(
            (r) => r.scope === "COMPANY" && r.company_id === store.company_id,
          );

        if (!hasAccess) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message:
                "You do not have permission to manage lottery bin count for this store",
            },
          };
        }

        // Update bin count and sync bins
        const result = await lotteryBinCountService.updateBinCount(
          storeId,
          bin_count,
          user.id,
        );

        // Create audit log
        await prisma.auditLog.create({
          data: {
            user_id: user.id,
            action: "UPDATE",
            table_name: "stores",
            record_id: storeId,
            old_values: {
              lottery_bin_count: result.previous_count,
            } as any,
            new_values: {
              lottery_bin_count: result.new_count,
              bins_created: result.bins_created,
              bins_reactivated: result.bins_reactivated,
              bins_deactivated: result.bins_deactivated,
            } as any,
            ip_address: ipAddress,
            user_agent: userAgent,
            reason: `Lottery bin count updated from ${result.previous_count ?? "not set"} to ${result.new_count} for store ${store.name}`,
          },
        });

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        fastify.log.error(
          { error, storeId },
          "Error updating lottery bin count",
        );

        // Handle specific error cases
        if (error.message?.includes("Cannot reduce bin count")) {
          reply.code(409);
          return {
            success: false,
            error: {
              code: "BINS_HAVE_ACTIVE_PACKS",
              message: error.message,
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update lottery bin count",
          },
        };
      }
    },
  );

  /**
   * GET /api/stores/:storeId/lottery/bin-count/validate
   * Pre-flight validation for bin count change
   * Used to show confirmation dialog before making changes
   *
   * @enterprise-standards
   * - API-001: VALIDATION - UUID and query parameter validation
   * - API-003: ERROR_HANDLING - Structured error responses
   */
  fastify.get<{
    Params: { storeId: string };
    Querystring: { new_count: string };
  }>(
    "/api/stores/:storeId/lottery/bin-count/validate",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_CONFIG_READ),
      ],
      schema: {
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        querystring: {
          type: "object",
          required: ["new_count"],
          properties: {
            new_count: {
              type: "string",
              description: "Proposed new bin count",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  allowed: { type: "boolean" },
                  current_count: { type: "integer" },
                  bins_to_add: { type: "integer" },
                  bins_to_remove: { type: "integer" },
                  bins_with_packs_blocking: { type: "integer" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.params as { storeId: string };
      const { new_count: newCountStr } = request.query as { new_count: string };
      const user = (request as any).user as UserIdentity;

      try {
        // Parse and validate new_count
        const newCount = parseInt(newCountStr, 10);
        if (
          isNaN(newCount) ||
          newCount < MIN_LOTTERY_BIN_COUNT ||
          newCount > MAX_LOTTERY_BIN_COUNT
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: `new_count must be an integer between ${MIN_LOTTERY_BIN_COUNT} and ${MAX_LOTTERY_BIN_COUNT}`,
            },
          };
        }

        // Validate store access
        const store = await prisma.store.findUnique({
          where: { store_id: storeId },
          select: { store_id: true, company_id: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "STORE_NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Check user access
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasAccess =
          userRoles.some((r) => r.scope === "SYSTEM") ||
          userRoles.some(
            (r) => r.scope === "COMPANY" && r.company_id === store.company_id,
          ) ||
          userRoles.some((r) => r.scope === "STORE" && r.store_id === storeId);

        if (!hasAccess) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "You do not have access to this store",
            },
          };
        }

        // Validate the proposed change
        const validationResult =
          await lotteryBinCountService.validateBinCountChange(
            storeId,
            newCount,
          );

        return {
          success: true,
          data: validationResult,
        };
      } catch (error: any) {
        fastify.log.error(
          { error, storeId },
          "Error validating lottery bin count change",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to validate bin count change",
          },
        };
      }
    },
  );
}
