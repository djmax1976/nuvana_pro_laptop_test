import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import {
  roleAdminService,
  AuditContext,
  CreateRoleInput,
  UpdateRoleInput,
  UpdateRolePermissionsInput,
} from "../services/role-admin.service";
import { companyRoleAccessService } from "../services/company-role-access.service";

// UUID validation helper
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Validation schemas
const createRoleSchema = z.object({
  code: z
    .string()
    .min(2, "Role code must be at least 2 characters")
    .max(100, "Role code must be at most 100 characters")
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Role code must be uppercase, start with a letter, and contain only letters, numbers, and underscores",
    ),
  scope: z.enum(["SYSTEM", "COMPANY", "STORE"], {
    message: "Scope must be SYSTEM, COMPANY, or STORE",
  }),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().uuid()).optional(),
});

const updateRoleSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .optional(),
  description: z.string().max(500).optional().nullable(),
});

const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string().uuid()),
});

const setCompanyRolesSchema = z.object({
  role_ids: z.array(z.string().uuid()),
});

const addRemoveCompanyRoleSchema = z.object({
  role_id: z.string().uuid(),
});

/**
 * Helper to extract audit context from request
 */
function getAuditContext(
  request: FastifyRequest,
  user: UserIdentity,
): AuditContext {
  const ipAddress =
    (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    request.ip ||
    request.socket.remoteAddress ||
    undefined;
  const userAgent = request.headers["user-agent"] || undefined;

  return {
    userId: user.id,
    userEmail: user.email,
    ipAddress,
    userAgent,
  };
}

/**
 * Admin role management routes
 * Provides CRUD operations for roles and company role access management
 * All routes require ADMIN_SYSTEM_CONFIG permission (Super Admin only)
 */
export async function adminRolesRoutes(fastify: FastifyInstance) {
  // ============================================================
  // ROLE CRUD OPERATIONS
  // ============================================================

  /**
   * GET /api/admin/roles
   * List all roles with details (optionally including deleted)
   */
  fastify.get(
    "/api/admin/roles",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { include_deleted } = request.query as {
          include_deleted?: string;
        };
        const includeDeleted = include_deleted === "true";

        const roles = await roleAdminService.getAllRoles(includeDeleted);

        return {
          success: true,
          data: roles,
        };
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error fetching roles");

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch roles",
        };
      }
    },
  );

  /**
   * GET /api/admin/roles/deleted
   * List all soft-deleted roles
   */
  fastify.get(
    "/api/admin/roles/deleted",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const roles = await roleAdminService.getDeletedRoles();

        return {
          success: true,
          data: roles,
        };
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error fetching deleted roles");

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch deleted roles",
        };
      }
    },
  );

  /**
   * GET /api/admin/roles/permissions
   * Get all available permissions in the system
   */
  fastify.get(
    "/api/admin/roles/permissions",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const permissions = await roleAdminService.getAllPermissions();

        return {
          success: true,
          data: permissions,
        };
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error fetching permissions");

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch permissions",
        };
      }
    },
  );

  /**
   * GET /api/admin/roles/:roleId
   * Get a single role by ID with full details
   */
  fastify.get(
    "/api/admin/roles/:roleId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { roleId } = request.params as { roleId: string };

        if (!isValidUUID(roleId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid role ID format",
          };
        }

        const role = await roleAdminService.getRoleById(roleId);

        if (!role) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message: "Role not found",
          };
        }

        return {
          success: true,
          data: role,
        };
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error fetching role");

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch role",
        };
      }
    },
  );

  /**
   * POST /api/admin/roles
   * Create a new role
   */
  fastify.post(
    "/api/admin/roles",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate request body
        const parseResult = createRoleSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const auditContext = getAuditContext(request, user);
        const input: CreateRoleInput = parseResult.data;

        const role = await roleAdminService.createRole(input, auditContext);

        reply.code(201);
        return {
          success: true,
          data: role,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error creating role");

        if (
          message.includes("already exists") ||
          message.includes("must be") ||
          message.includes("Invalid")
        ) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to create role",
        };
      }
    },
  );

  /**
   * PUT /api/admin/roles/:roleId
   * Update a role's basic info (code, description)
   */
  fastify.put(
    "/api/admin/roles/:roleId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { roleId } = request.params as { roleId: string };

        if (!isValidUUID(roleId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid role ID format",
          };
        }

        // Validate request body
        const parseResult = updateRoleSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const auditContext = getAuditContext(request, user);
        const input: UpdateRoleInput = {
          code: parseResult.data.code,
          description: parseResult.data.description ?? undefined,
        };

        const role = await roleAdminService.updateRole(
          roleId,
          input,
          auditContext,
        );

        return {
          success: true,
          data: role,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error updating role");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message,
          };
        }

        if (
          message.includes("cannot") ||
          message.includes("already exists") ||
          message.includes("must be") ||
          message.includes("deleted")
        ) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to update role",
        };
      }
    },
  );

  /**
   * PUT /api/admin/roles/:roleId/permissions
   * Update a role's permissions (system defaults)
   */
  fastify.put(
    "/api/admin/roles/:roleId/permissions",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { roleId } = request.params as { roleId: string };

        if (!isValidUUID(roleId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid role ID format",
          };
        }

        // Validate request body
        const parseResult = updateRolePermissionsSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const auditContext = getAuditContext(request, user);
        const input: UpdateRolePermissionsInput = parseResult.data;

        const role = await roleAdminService.updateRolePermissions(
          roleId,
          input,
          auditContext,
        );

        return {
          success: true,
          data: role,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error updating role permissions");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message,
          };
        }

        if (message.includes("Invalid") || message.includes("deleted")) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to update role permissions",
        };
      }
    },
  );

  /**
   * DELETE /api/admin/roles/:roleId
   * Soft delete a role
   */
  fastify.delete(
    "/api/admin/roles/:roleId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { roleId } = request.params as { roleId: string };

        if (!isValidUUID(roleId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid role ID format",
          };
        }

        const auditContext = getAuditContext(request, user);

        await roleAdminService.softDeleteRole(roleId, auditContext);

        return {
          success: true,
          message: "Role deleted successfully",
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error deleting role");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message,
          };
        }

        if (
          message.includes("System roles") ||
          message.includes("already deleted") ||
          message.includes("Cannot delete")
        ) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to delete role",
        };
      }
    },
  );

  /**
   * POST /api/admin/roles/:roleId/restore
   * Restore a soft-deleted role
   */
  fastify.post(
    "/api/admin/roles/:roleId/restore",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { roleId } = request.params as { roleId: string };

        if (!isValidUUID(roleId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid role ID format",
          };
        }

        const auditContext = getAuditContext(request, user);

        const role = await roleAdminService.restoreRole(roleId, auditContext);

        return {
          success: true,
          data: role,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error restoring role");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message,
          };
        }

        if (message.includes("not deleted")) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to restore role",
        };
      }
    },
  );

  /**
   * DELETE /api/admin/roles/:roleId/purge
   * Permanently delete a soft-deleted role
   */
  fastify.delete(
    "/api/admin/roles/:roleId/purge",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { roleId } = request.params as { roleId: string };

        if (!isValidUUID(roleId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid role ID format",
          };
        }

        const auditContext = getAuditContext(request, user);

        await roleAdminService.purgeRole(roleId, auditContext);

        return {
          success: true,
          message: "Role permanently deleted",
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error purging role");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message,
          };
        }

        if (
          message.includes("Cannot permanently") ||
          message.includes("System roles")
        ) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to purge role",
        };
      }
    },
  );

  // ============================================================
  // COMPANY ROLE ACCESS MANAGEMENT
  // ============================================================

  /**
   * GET /api/admin/companies/roles
   * Get all companies with their allowed roles
   */
  fastify.get(
    "/api/admin/companies/roles",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const companies =
          await companyRoleAccessService.getAllCompaniesWithAllowedRoles();

        return {
          success: true,
          data: companies,
        };
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error fetching companies with roles");

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch companies with roles",
        };
      }
    },
  );

  /**
   * GET /api/admin/companies/:companyId/roles
   * Get a company's allowed roles
   */
  fastify.get(
    "/api/admin/companies/:companyId/roles",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { companyId } = request.params as { companyId: string };

        if (!isValidUUID(companyId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid company ID format",
          };
        }

        const company =
          await companyRoleAccessService.getCompanyWithAllowedRoles(companyId);

        if (!company) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message: "Company not found",
          };
        }

        return {
          success: true,
          data: company,
        };
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error fetching company roles");

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch company roles",
        };
      }
    },
  );

  /**
   * PUT /api/admin/companies/:companyId/roles
   * Set all allowed roles for a company (replaces existing)
   */
  fastify.put(
    "/api/admin/companies/:companyId/roles",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { companyId } = request.params as { companyId: string };

        if (!isValidUUID(companyId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid company ID format",
          };
        }

        // Validate request body
        const parseResult = setCompanyRolesSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const auditContext = getAuditContext(request, user);

        const company = await companyRoleAccessService.setCompanyAllowedRoles(
          companyId,
          parseResult.data.role_ids,
          auditContext,
        );

        return {
          success: true,
          data: company,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error setting company roles");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message,
          };
        }

        if (
          message.includes("Invalid") ||
          message.includes("deleted") ||
          message.includes("SYSTEM scope")
        ) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to set company roles",
        };
      }
    },
  );

  /**
   * POST /api/admin/companies/:companyId/roles
   * Add a single role to a company
   */
  fastify.post(
    "/api/admin/companies/:companyId/roles",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { companyId } = request.params as { companyId: string };

        if (!isValidUUID(companyId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid company ID format",
          };
        }

        // Validate request body
        const parseResult = addRemoveCompanyRoleSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const auditContext = getAuditContext(request, user);

        await companyRoleAccessService.addRoleToCompany(
          companyId,
          parseResult.data.role_id,
          auditContext,
        );

        return {
          success: true,
          message: "Role added to company",
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error adding role to company");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message,
          };
        }

        if (
          message.includes("already assigned") ||
          message.includes("deleted") ||
          message.includes("SYSTEM scope")
        ) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to add role to company",
        };
      }
    },
  );

  /**
   * DELETE /api/admin/companies/:companyId/roles/:roleId
   * Remove a single role from a company
   */
  fastify.delete(
    "/api/admin/companies/:companyId/roles/:roleId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { companyId, roleId } = request.params as {
          companyId: string;
          roleId: string;
        };

        if (!isValidUUID(companyId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid company ID format",
          };
        }

        if (!isValidUUID(roleId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid role ID format",
          };
        }

        const auditContext = getAuditContext(request, user);

        await companyRoleAccessService.removeRoleFromCompany(
          companyId,
          roleId,
          auditContext,
        );

        return {
          success: true,
          message: "Role removed from company",
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error removing role from company");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message,
          };
        }

        if (
          message.includes("not assigned") ||
          message.includes("Cannot remove")
        ) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to remove role from company",
        };
      }
    },
  );

  /**
   * GET /api/admin/roles/:roleId/companies
   * Get all companies that have access to a specific role
   */
  fastify.get(
    "/api/admin/roles/:roleId/companies",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { roleId } = request.params as { roleId: string };

        if (!isValidUUID(roleId)) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: "Invalid role ID format",
          };
        }

        const roleWithAccess =
          await companyRoleAccessService.getRoleWithCompanyAccess(roleId);

        if (!roleWithAccess) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message: "Role not found",
          };
        }

        return {
          success: true,
          data: roleWithAccess,
        };
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error fetching role companies");

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch role companies",
        };
      }
    },
  );
}
