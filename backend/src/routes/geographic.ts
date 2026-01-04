/**
 * Geographic Reference API Routes
 *
 * Provides REST API endpoints for US geographic reference data:
 * - States (with lottery enablement flags)
 * - Counties (with FIPS codes)
 * - Cities (linked to counties)
 * - ZIP Codes (with autocomplete support)
 *
 * @enterprise-standards
 * - API-001: VALIDATION - Zod schema validation for all requests
 * - API-003: ERROR_HANDLING - Centralized error responses
 * - SEC-006: SQL_INJECTION - Prisma ORM prevents SQL injection
 * - DB-006: TENANT_ISOLATION - Reference data accessible to all authenticated users
 *
 * Story: State-Scoped Lottery Games Phase
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { prisma } from "../utils/db";
import { rbacService } from "../services/rbac.service";
import {
  validateListStatesQuery,
  validateListCountiesQuery,
  validateListCitiesQuery,
  validateListZipCodesQuery,
  validateZipCodeLookup,
  validateCreateUSState,
  validateUpdateUSState,
  ListStatesQuery,
  ListCountiesQuery,
  ListCitiesQuery,
  ListZipCodesQuery,
  ZipCodeLookupQuery,
  CreateUSStateInput,
  UpdateUSStateInput,
} from "../schemas/address.schema";
import { ZodError } from "zod";

/**
 * Format Zod validation errors into API response format
 */
function formatZodError(error: ZodError): {
  code: string;
  message: string;
  details: unknown[];
} {
  return {
    code: "VALIDATION_ERROR",
    message: "Request validation failed",
    details: error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    })),
  };
}

/**
 * Check if user has SYSTEM scope (SuperAdmin)
 */
async function isSystemAdmin(userId: string): Promise<boolean> {
  const userRoles = await rbacService.getUserRoles(userId);
  return userRoles.some((role) => role.scope === "SYSTEM");
}

/**
 * Geographic Reference API routes
 */
export async function geographicRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // US STATES ENDPOINTS
  // ============================================================================

  /**
   * GET /api/geographic/states
   * List all US states
   * Public endpoint for authenticated users (reference data)
   */
  fastify.get(
    "/api/geographic/states",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "List all US states with lottery enablement status",
        tags: ["geographic"],
        querystring: {
          type: "object",
          properties: {
            is_active: {
              type: "string",
              enum: ["true", "false"],
              description: "Filter by active status",
            },
            lottery_enabled: {
              type: "string",
              enum: ["true", "false"],
              description: "Filter by lottery enabled status",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    state_id: { type: "string", format: "uuid" },
                    code: { type: "string" },
                    name: { type: "string" },
                    fips_code: { type: "string" },
                    is_active: { type: "boolean" },
                    lottery_enabled: { type: "boolean" },
                    timezone_default: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = validateListStatesQuery(request.query);

        // Build where clause
        const where: Record<string, unknown> = {};
        if (query.is_active !== undefined) {
          where.is_active = query.is_active;
        }
        if (query.lottery_enabled !== undefined) {
          where.lottery_enabled = query.lottery_enabled;
        }

        const states = await prisma.uSState.findMany({
          where,
          select: {
            state_id: true,
            code: true,
            name: true,
            fips_code: true,
            is_active: true,
            lottery_enabled: true,
            timezone_default: true,
          },
          orderBy: { name: "asc" },
        });

        return { success: true, data: states };
      } catch (error) {
        if (error instanceof ZodError) {
          reply.code(400);
          return { success: false, error: formatZodError(error) };
        }
        throw error;
      }
    },
  );

  /**
   * GET /api/geographic/states/:stateId
   * Get a single state by ID
   */
  fastify.get(
    "/api/geographic/states/:stateId",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "Get a single US state by ID",
        tags: ["geographic"],
        params: {
          type: "object",
          required: ["stateId"],
          properties: {
            stateId: { type: "string", format: "uuid" },
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
                  state_id: { type: "string", format: "uuid" },
                  code: { type: "string" },
                  name: { type: "string" },
                  fips_code: { type: "string" },
                  is_active: { type: "boolean" },
                  lottery_enabled: { type: "boolean" },
                  timezone_default: { type: "string", nullable: true },
                  tax_rate_state: { type: "number", nullable: true },
                  lottery_commission_name: { type: "string", nullable: true },
                  lottery_commission_phone: { type: "string", nullable: true },
                  lottery_commission_url: { type: "string", nullable: true },
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
      const { stateId } = request.params as { stateId: string };

      const state = await prisma.uSState.findUnique({
        where: { state_id: stateId },
      });

      if (!state) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "State not found",
          },
        };
      }

      return { success: true, data: state };
    },
  );

  /**
   * POST /api/geographic/states
   * Create a new US state (SuperAdmin only)
   */
  fastify.post(
    "/api/geographic/states",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.SYSTEM_CONFIG_MANAGE),
      ],
      schema: {
        description: "Create a new US state (SuperAdmin only)",
        tags: ["geographic"],
        body: {
          type: "object",
          required: ["code", "name", "fips_code"],
          properties: {
            code: { type: "string", minLength: 2, maxLength: 2 },
            name: { type: "string", maxLength: 100 },
            fips_code: { type: "string", minLength: 2, maxLength: 2 },
            is_active: { type: "boolean" },
            lottery_enabled: { type: "boolean" },
            timezone_default: { type: "string", maxLength: 50 },
            tax_rate_state: { type: "number" },
            lottery_commission_name: { type: "string", maxLength: 255 },
            lottery_commission_phone: { type: "string", maxLength: 20 },
            lottery_commission_url: { type: "string", maxLength: 500 },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  state_id: { type: "string", format: "uuid" },
                  code: { type: "string" },
                  name: { type: "string" },
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
              },
            },
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
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const input = validateCreateUSState(request.body);

        // Check for duplicate code or FIPS code
        const existingState = await prisma.uSState.findFirst({
          where: {
            OR: [{ code: input.code }, { fips_code: input.fips_code }],
          },
        });

        if (existingState) {
          reply.code(409);
          return {
            success: false,
            error: {
              code: "DUPLICATE_STATE",
              message:
                existingState.code === input.code
                  ? `State with code ${input.code} already exists`
                  : `State with FIPS code ${input.fips_code} already exists`,
            },
          };
        }

        const state = await prisma.uSState.create({
          data: {
            code: input.code,
            name: input.name,
            fips_code: input.fips_code,
            is_active: input.is_active ?? true,
            lottery_enabled: input.lottery_enabled ?? true,
            timezone_default: input.timezone_default ?? null,
            tax_rate_state: input.tax_rate_state ?? null,
            lottery_commission_name: input.lottery_commission_name ?? null,
            lottery_commission_phone: input.lottery_commission_phone ?? null,
            lottery_commission_url: input.lottery_commission_url ?? null,
          },
          select: {
            state_id: true,
            code: true,
            name: true,
          },
        });

        reply.code(201);
        return { success: true, data: state };
      } catch (error) {
        if (error instanceof ZodError) {
          reply.code(400);
          return { success: false, error: formatZodError(error) };
        }
        throw error;
      }
    },
  );

  /**
   * PUT /api/geographic/states/:stateId
   * Update a US state (SuperAdmin only)
   */
  fastify.put(
    "/api/geographic/states/:stateId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.SYSTEM_CONFIG_MANAGE),
      ],
      schema: {
        description: "Update a US state (SuperAdmin only)",
        tags: ["geographic"],
        params: {
          type: "object",
          required: ["stateId"],
          properties: {
            stateId: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string", maxLength: 100 },
            is_active: { type: "boolean" },
            lottery_enabled: { type: "boolean" },
            timezone_default: { type: "string", maxLength: 50 },
            tax_rate_state: { type: "number" },
            lottery_commission_name: { type: "string", maxLength: 255 },
            lottery_commission_phone: { type: "string", maxLength: 20 },
            lottery_commission_url: { type: "string", maxLength: 500 },
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
                  state_id: { type: "string", format: "uuid" },
                  code: { type: "string" },
                  name: { type: "string" },
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
      const { stateId } = request.params as { stateId: string };

      try {
        const input = validateUpdateUSState(request.body);

        // Check state exists
        const existingState = await prisma.uSState.findUnique({
          where: { state_id: stateId },
        });

        if (!existingState) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "State not found",
            },
          };
        }

        const state = await prisma.uSState.update({
          where: { state_id: stateId },
          data: input,
          select: {
            state_id: true,
            code: true,
            name: true,
          },
        });

        return { success: true, data: state };
      } catch (error) {
        if (error instanceof ZodError) {
          reply.code(400);
          return { success: false, error: formatZodError(error) };
        }
        throw error;
      }
    },
  );

  // ============================================================================
  // US COUNTIES ENDPOINTS
  // ============================================================================

  /**
   * GET /api/geographic/counties
   * List counties with optional state filter
   */
  fastify.get(
    "/api/geographic/counties",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "List US counties with optional state filter",
        tags: ["geographic"],
        querystring: {
          type: "object",
          properties: {
            state_id: { type: "string", format: "uuid" },
            state_code: { type: "string", minLength: 2, maxLength: 2 },
            is_active: { type: "string", enum: ["true", "false"] },
            search: { type: "string", maxLength: 100 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    county_id: { type: "string", format: "uuid" },
                    state_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    fips_code: { type: "string" },
                    county_seat: { type: "string", nullable: true },
                    is_active: { type: "boolean" },
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
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = validateListCountiesQuery(request.query);

        // Build where clause
        const where: Record<string, unknown> = {};

        if (query.state_id) {
          where.state_id = query.state_id;
        } else if (query.state_code) {
          // Find state by code
          const state = await prisma.uSState.findUnique({
            where: { code: query.state_code },
            select: { state_id: true },
          });
          if (state) {
            where.state_id = state.state_id;
          } else {
            return {
              success: true,
              data: [],
              meta: { total: 0, limit: query.limit, offset: query.offset },
            };
          }
        }

        if (query.is_active !== undefined) {
          where.is_active = query.is_active;
        }

        if (query.search) {
          where.name = {
            contains: query.search,
            mode: "insensitive",
          };
        }

        // Get total count
        const total = await prisma.uSCounty.count({ where });

        // Get counties
        const counties = await prisma.uSCounty.findMany({
          where,
          select: {
            county_id: true,
            state_id: true,
            name: true,
            fips_code: true,
            county_seat: true,
            is_active: true,
          },
          orderBy: { name: "asc" },
          take: query.limit,
          skip: query.offset,
        });

        return {
          success: true,
          data: counties,
          meta: {
            total,
            limit: query.limit,
            offset: query.offset,
          },
        };
      } catch (error) {
        if (error instanceof ZodError) {
          reply.code(400);
          return { success: false, error: formatZodError(error) };
        }
        throw error;
      }
    },
  );

  /**
   * GET /api/geographic/states/:stateId/counties
   * List counties for a specific state
   */
  fastify.get(
    "/api/geographic/states/:stateId/counties",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "List counties for a specific state",
        tags: ["geographic"],
        params: {
          type: "object",
          required: ["stateId"],
          properties: {
            stateId: { type: "string", format: "uuid" },
          },
        },
        querystring: {
          type: "object",
          properties: {
            search: { type: "string", maxLength: 100 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 200 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    county_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    fips_code: { type: "string" },
                    county_seat: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { stateId } = request.params as { stateId: string };
      const { search, limit = 200 } = request.query as {
        search?: string;
        limit?: number;
      };

      // Build where clause
      const where: Record<string, unknown> = {
        state_id: stateId,
        is_active: true,
      };

      if (search) {
        where.name = {
          contains: search,
          mode: "insensitive",
        };
      }

      const counties = await prisma.uSCounty.findMany({
        where,
        select: {
          county_id: true,
          name: true,
          fips_code: true,
          county_seat: true,
        },
        orderBy: { name: "asc" },
        take: limit,
      });

      return { success: true, data: counties };
    },
  );

  // ============================================================================
  // US CITIES ENDPOINTS
  // ============================================================================

  /**
   * GET /api/geographic/cities
   * List cities with optional filters
   */
  fastify.get(
    "/api/geographic/cities",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "List US cities with optional filters",
        tags: ["geographic"],
        querystring: {
          type: "object",
          properties: {
            state_id: { type: "string", format: "uuid" },
            state_code: { type: "string", minLength: 2, maxLength: 2 },
            county_id: { type: "string", format: "uuid" },
            is_active: { type: "string", enum: ["true", "false"] },
            search: { type: "string", maxLength: 100 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    city_id: { type: "string", format: "uuid" },
                    state_id: { type: "string", format: "uuid" },
                    county_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    is_active: { type: "boolean" },
                    is_incorporated: { type: "boolean" },
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
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = validateListCitiesQuery(request.query);

        // Build where clause
        const where: Record<string, unknown> = {};

        if (query.state_id) {
          where.state_id = query.state_id;
        } else if (query.state_code) {
          const state = await prisma.uSState.findUnique({
            where: { code: query.state_code },
            select: { state_id: true },
          });
          if (state) {
            where.state_id = state.state_id;
          } else {
            return {
              success: true,
              data: [],
              meta: { total: 0, limit: query.limit, offset: query.offset },
            };
          }
        }

        if (query.county_id) {
          where.county_id = query.county_id;
        }

        if (query.is_active !== undefined) {
          where.is_active = query.is_active;
        }

        if (query.search) {
          where.name = {
            contains: query.search,
            mode: "insensitive",
          };
        }

        // Get total count
        const total = await prisma.uSCity.count({ where });

        // Get cities
        const cities = await prisma.uSCity.findMany({
          where,
          select: {
            city_id: true,
            state_id: true,
            county_id: true,
            name: true,
            is_active: true,
            is_incorporated: true,
          },
          orderBy: { name: "asc" },
          take: query.limit,
          skip: query.offset,
        });

        return {
          success: true,
          data: cities,
          meta: {
            total,
            limit: query.limit,
            offset: query.offset,
          },
        };
      } catch (error) {
        if (error instanceof ZodError) {
          reply.code(400);
          return { success: false, error: formatZodError(error) };
        }
        throw error;
      }
    },
  );

  /**
   * GET /api/geographic/states/:stateId/cities
   * List cities for a specific state
   */
  fastify.get(
    "/api/geographic/states/:stateId/cities",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "List cities for a specific state",
        tags: ["geographic"],
        params: {
          type: "object",
          required: ["stateId"],
          properties: {
            stateId: { type: "string", format: "uuid" },
          },
        },
        querystring: {
          type: "object",
          properties: {
            county_id: { type: "string", format: "uuid" },
            search: { type: "string", maxLength: 100 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    city_id: { type: "string", format: "uuid" },
                    county_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { stateId } = request.params as { stateId: string };
      const {
        county_id,
        search,
        limit = 100,
      } = request.query as {
        county_id?: string;
        search?: string;
        limit?: number;
      };

      // Build where clause
      const where: Record<string, unknown> = {
        state_id: stateId,
        is_active: true,
      };

      if (county_id) {
        where.county_id = county_id;
      }

      if (search) {
        where.name = {
          contains: search,
          mode: "insensitive",
        };
      }

      const cities = await prisma.uSCity.findMany({
        where,
        select: {
          city_id: true,
          county_id: true,
          name: true,
        },
        orderBy: { name: "asc" },
        take: limit,
      });

      return { success: true, data: cities };
    },
  );

  // ============================================================================
  // US ZIP CODES ENDPOINTS
  // ============================================================================

  /**
   * GET /api/geographic/zip-codes
   * List ZIP codes with optional filters
   */
  fastify.get(
    "/api/geographic/zip-codes",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "List US ZIP codes with optional filters",
        tags: ["geographic"],
        querystring: {
          type: "object",
          properties: {
            state_id: { type: "string", format: "uuid" },
            state_code: { type: "string", minLength: 2, maxLength: 2 },
            county_id: { type: "string", format: "uuid" },
            city_id: { type: "string", format: "uuid" },
            city_name: { type: "string", maxLength: 100 },
            is_active: { type: "string", enum: ["true", "false"] },
            search: { type: "string", maxLength: 10 },
            limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    zip_code: { type: "string" },
                    state_id: { type: "string", format: "uuid" },
                    county_id: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    city_id: { type: "string", format: "uuid", nullable: true },
                    city_name: { type: "string" },
                    is_active: { type: "boolean" },
                    is_primary: { type: "boolean" },
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
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = validateListZipCodesQuery(request.query);

        // Build where clause
        const where: Record<string, unknown> = {};

        if (query.state_id) {
          where.state_id = query.state_id;
        } else if (query.state_code) {
          const state = await prisma.uSState.findUnique({
            where: { code: query.state_code },
            select: { state_id: true },
          });
          if (state) {
            where.state_id = state.state_id;
          } else {
            return {
              success: true,
              data: [],
              meta: { total: 0, limit: query.limit, offset: query.offset },
            };
          }
        }

        if (query.county_id) {
          where.county_id = query.county_id;
        }

        if (query.city_id) {
          where.city_id = query.city_id;
        }

        if (query.city_name) {
          where.city_name = {
            contains: query.city_name,
            mode: "insensitive",
          };
        }

        if (query.is_active !== undefined) {
          where.is_active = query.is_active;
        }

        if (query.search) {
          where.zip_code = {
            startsWith: query.search,
          };
        }

        // Get total count
        const total = await prisma.uSZipCode.count({ where });

        // Get ZIP codes
        const zipCodes = await prisma.uSZipCode.findMany({
          where,
          select: {
            zip_code: true,
            state_id: true,
            county_id: true,
            city_id: true,
            city_name: true,
            is_active: true,
            is_primary: true,
          },
          orderBy: { zip_code: "asc" },
          take: query.limit,
          skip: query.offset,
        });

        return {
          success: true,
          data: zipCodes,
          meta: {
            total,
            limit: query.limit,
            offset: query.offset,
          },
        };
      } catch (error) {
        if (error instanceof ZodError) {
          reply.code(400);
          return { success: false, error: formatZodError(error) };
        }
        throw error;
      }
    },
  );

  /**
   * GET /api/geographic/zip-codes/:zipCode
   * Lookup a specific ZIP code (for address autocomplete)
   */
  fastify.get(
    "/api/geographic/zip-codes/:zipCode",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "Lookup a specific ZIP code for address autocomplete",
        tags: ["geographic"],
        params: {
          type: "object",
          required: ["zipCode"],
          properties: {
            zipCode: { type: "string", pattern: "^[0-9]{5}$" },
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
                  zip_code: { type: "string" },
                  city_name: { type: "string" },
                  state: {
                    type: "object",
                    properties: {
                      state_id: { type: "string", format: "uuid" },
                      code: { type: "string" },
                      name: { type: "string" },
                    },
                  },
                  county: {
                    type: "object",
                    nullable: true,
                    properties: {
                      county_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                    },
                  },
                  city: {
                    type: "object",
                    nullable: true,
                    properties: {
                      city_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                    },
                  },
                  latitude: { type: "number", nullable: true },
                  longitude: { type: "number", nullable: true },
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
      const { zipCode } = request.params as { zipCode: string };

      const zipData = await prisma.uSZipCode.findUnique({
        where: { zip_code: zipCode },
        select: {
          zip_code: true,
          city_name: true,
          latitude: true,
          longitude: true,
          state: {
            select: {
              state_id: true,
              code: true,
              name: true,
            },
          },
          county: {
            select: {
              county_id: true,
              name: true,
            },
          },
          city: {
            select: {
              city_id: true,
              name: true,
            },
          },
        },
      });

      if (!zipData) {
        reply.code(404);
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `ZIP code ${zipCode} not found`,
          },
        };
      }

      return { success: true, data: zipData };
    },
  );

  /**
   * GET /api/geographic/states/:stateId/zip-codes
   * List ZIP codes for a specific state
   */
  fastify.get(
    "/api/geographic/states/:stateId/zip-codes",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "List ZIP codes for a specific state",
        tags: ["geographic"],
        params: {
          type: "object",
          required: ["stateId"],
          properties: {
            stateId: { type: "string", format: "uuid" },
          },
        },
        querystring: {
          type: "object",
          properties: {
            city_name: { type: "string", maxLength: 100 },
            search: { type: "string", maxLength: 10 },
            limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    zip_code: { type: "string" },
                    city_name: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { stateId } = request.params as { stateId: string };
      const {
        city_name,
        search,
        limit = 100,
      } = request.query as {
        city_name?: string;
        search?: string;
        limit?: number;
      };

      // Build where clause
      const where: Record<string, unknown> = {
        state_id: stateId,
        is_active: true,
      };

      if (city_name) {
        where.city_name = {
          contains: city_name,
          mode: "insensitive",
        };
      }

      if (search) {
        where.zip_code = {
          startsWith: search,
        };
      }

      const zipCodes = await prisma.uSZipCode.findMany({
        where,
        select: {
          zip_code: true,
          city_name: true,
        },
        orderBy: { zip_code: "asc" },
        take: limit,
      });

      return { success: true, data: zipCodes };
    },
  );
}
