import { FastifyRequest, FastifyReply } from "fastify";
import { rbacService } from "../services/rbac.service";
import type { PermissionCode } from "../constants/permissions";
import { PrismaClient } from "@prisma/client";
import type { UserIdentity } from "./auth.middleware";

const prisma = new PrismaClient();

/**
 * Extended request with user identity from auth middleware
 */
interface AuthenticatedRequest extends FastifyRequest {
  user?: UserIdentity;
  cookies: {
    accessToken?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Permission scope extracted from request
 */
interface RequestScope {
  companyId?: string;
  storeId?: string;
}

/**
 * Extract scope from request (query params, route params, or body)
 * @param request - Fastify request object
 * @returns Permission scope
 */
function extractScope(request: AuthenticatedRequest): RequestScope {
  const scope: RequestScope = {};

  // Try to get companyId from route params, query params, or body
  const companyId =
    (request.params as any)?.companyId ||
    (request.query as any)?.company_id ||
    (request.body as any)?.company_id;
  if (companyId) {
    scope.companyId = String(companyId);
  }

  // Try to get storeId from route params, query params, or body
  const storeId =
    (request.params as any)?.storeId ||
    (request.query as any)?.store_id ||
    (request.body as any)?.store_id;
  if (storeId) {
    scope.storeId = String(storeId);
  }

  return scope;
}

/**
 * Log permission denial to AuditLog
 * @param userId - User ID
 * @param permission - Permission code that was denied
 * @param resource - Resource/endpoint that was accessed
 * @param request - Fastify request object
 */
async function logPermissionDenial(
  userId: string,
  permission: PermissionCode,
  resource: string,
  request: AuthenticatedRequest,
): Promise<void> {
  try {
    // Extract IP address and user agent from request
    const ipAddress =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      request.ip ||
      request.socket.remoteAddress ||
      null;
    const userAgent = request.headers["user-agent"] || null;

    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: "PERMISSION_DENIED",
        table_name: "api_route",
        record_id: crypto.randomUUID(), // Generate UUID for record_id
        reason: `Permission denied: ${permission} for resource: ${resource}`,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });
  } catch (error) {
    // Log error but don't fail the request
    console.error("Failed to log permission denial:", error);
  }
}

/**
 * Create permission middleware that checks if user has required permission
 * @param requiredPermission - Permission code required to access the route
 * @returns Fastify middleware function
 */
export function permissionMiddleware(requiredPermission: PermissionCode) {
  return async (
    request: AuthenticatedRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    try {
      // Check if user is authenticated (should be set by auth middleware)
      if (!request.user) {
        reply.code(401);
        reply.send({
          error: "Unauthorized",
          message: "Authentication required",
        });
        return;
      }

      const userId = request.user.id;
      const resource = `${request.method} ${request.url}`;

      // Extract scope from request
      const scope = extractScope(request);

      // Check permission using RBAC service
      const hasPermission = await rbacService.checkPermission(
        userId,
        requiredPermission,
        scope,
      );

      if (!hasPermission) {
        // Log permission denial
        await logPermissionDenial(
          userId,
          requiredPermission,
          resource,
          request,
        );

        // Return 403 Forbidden
        reply.code(403);
        reply.send({
          error: "Forbidden",
          message: `Permission denied: ${requiredPermission} is required`,
        });
        return;
      }

      // Permission granted, allow request to proceed
      // No need to call next() in Fastify, just return
    } catch (error) {
      // If permission check fails, deny access
      console.error("Permission check error:", error);
      reply.code(403);
      reply.send({
        error: "Forbidden",
        message: "Permission check failed",
      });
    }
  };
}

/**
 * Create permission middleware with multiple required permissions (user must have ALL)
 * @param requiredPermissions - Array of permission codes, all must be present
 * @returns Fastify middleware function
 */
export function requireAllPermissions(requiredPermissions: PermissionCode[]) {
  return async (
    request: AuthenticatedRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    try {
      if (!request.user) {
        reply.code(401);
        reply.send({
          error: "Unauthorized",
          message: "Authentication required",
        });
        return;
      }

      const userId = request.user.id;
      const resource = `${request.method} ${request.url}`;
      const scope = extractScope(request);

      // Check all permissions
      for (const permission of requiredPermissions) {
        const hasPermission = await rbacService.checkPermission(
          userId,
          permission,
          scope,
        );

        if (!hasPermission) {
          await logPermissionDenial(userId, permission, resource, request);
          reply.code(403);
          reply.send({
            error: "Forbidden",
            message: `Permission denied: ${permission} is required`,
          });
          return;
        }
      }

      // All permissions granted
    } catch (error) {
      console.error("Permission check error:", error);
      reply.code(403);
      reply.send({
        error: "Forbidden",
        message: "Permission check failed",
      });
    }
  };
}

/**
 * Create permission middleware with multiple required permissions (user must have ANY)
 * @param requiredPermissions - Array of permission codes, at least one must be present
 * @returns Fastify middleware function
 */
export function requireAnyPermission(requiredPermissions: PermissionCode[]) {
  return async (
    request: AuthenticatedRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    try {
      if (!request.user) {
        reply.code(401);
        reply.send({
          error: "Unauthorized",
          message: "Authentication required",
        });
        return;
      }

      const userId = request.user.id;
      const resource = `${request.method} ${request.url}`;
      const scope = extractScope(request);

      // Check if user has any of the required permissions
      let hasAnyPermission = false;
      for (const permission of requiredPermissions) {
        const hasPermission = await rbacService.checkPermission(
          userId,
          permission,
          scope,
        );

        if (hasPermission) {
          hasAnyPermission = true;
          break;
        }
      }

      if (!hasAnyPermission) {
        // Log denial for the first permission (representative)
        await logPermissionDenial(
          userId,
          requiredPermissions[0],
          resource,
          request,
        );
        reply.code(403);
        reply.send({
          error: "Forbidden",
          message: `Permission denied: One of [${requiredPermissions.join(", ")}] is required`,
        });
        return;
      }

      // At least one permission granted
    } catch (error) {
      console.error("Permission check error:", error);
      reply.code(403);
      reply.send({
        error: "Forbidden",
        message: "Permission check failed",
      });
    }
  };
}
