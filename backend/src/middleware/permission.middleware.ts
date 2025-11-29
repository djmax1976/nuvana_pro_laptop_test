import { FastifyRequest, FastifyReply } from "fastify";
import { rbacService } from "../services/rbac.service";
import type { PermissionCode } from "../constants/permissions";
import { prisma, withRLSContext } from "../utils/db";
import type { UserIdentity } from "./auth.middleware";

/**
 * Extended request with user identity from auth middleware
 */
interface AuthenticatedRequest extends FastifyRequest {
  user?: UserIdentity;
  cookies: {
    accessToken?: string;
    [key: string]: string | undefined;
  };
  routerPath?: string;
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
  // EXCEPTION: For POST /api/companies/:companyId/stores, don't extract companyId from params
  // The route handler handles company isolation - permission middleware should
  // only check if user has STORE_CREATE permission, not company access
  const isStoreCreation =
    request.method === "POST" &&
    (request.routerPath === "/api/companies/:companyId/stores" ||
      // Fallback to regex check if routerPath is not available
      (!request.routerPath &&
        (() => {
          // Strip query parameters from URL
          const cleanPath = request.url?.split("?")[0] || "";
          // Precise regex matching /api/companies/:companyId/stores with optional trailing slash
          // Enforces segment boundaries to prevent false positives
          const storeCreationPattern = /^\/api\/companies\/[^\/]+\/stores\/?$/;
          return storeCreationPattern.test(cleanPath);
        })()));

  if (!isStoreCreation) {
    const companyId =
      (request.params as any)?.companyId ||
      (request.query as any)?.company_id ||
      (request.body as any)?.company_id;
    if (companyId) {
      scope.companyId = String(companyId);
    }
  }

  // Try to get storeId from route params, query params, or body
  // EXCEPTION: For GET /api/transactions, don't extract store_id from query params
  // The service layer handles store filtering via RLS - permission middleware should
  // only check if user has TRANSACTION_READ permission, not store access
  const isTransactionQuery =
    request.method === "GET" &&
    request.url?.startsWith("/api/transactions") &&
    !request.url.includes("/stores/");

  if (!isTransactionQuery) {
    const storeId =
      (request.params as any)?.storeId ||
      (request.query as any)?.store_id ||
      (request.body as any)?.store_id;
    if (storeId) {
      scope.storeId = String(storeId);
    }
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
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
        });
      }

      const userId = request.user.id;
      const resource = `${request.method} ${request.url}`;

      // Check if user has wildcard permission in JWT token (bypasses DB check)
      if (request.user.permissions && request.user.permissions.includes("*")) {
        // User has wildcard permission, grant access
        return;
      }

      // Extract scope from request
      const scope = extractScope(request);

      // Check permission using RBAC service with RLS context
      // RLS context is needed because user_roles table has RLS policies
      const hasPermission = await withRLSContext(userId, () =>
        rbacService.checkPermission(userId, requiredPermission, scope),
      );

      if (!hasPermission) {
        // Log permission denial
        await logPermissionDenial(
          userId,
          requiredPermission,
          resource,
          request,
        );

        // Return 403 Forbidden with standard API response format
        return reply.code(403).send({
          success: false,
          error: {
            code: "PERMISSION_DENIED",
            message: `Permission denied: ${requiredPermission} is required`,
          },
        });
      }

      // Permission granted, allow request to proceed
      // No need to call next() in Fastify, just return
    } catch (error) {
      // If permission check fails, deny access
      console.error("Permission check error:", error);
      return reply.code(403).send({
        success: false,
        error: {
          code: "PERMISSION_DENIED",
          message: "Permission check failed",
        },
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
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
        });
      }

      const userId = request.user.id;
      const resource = `${request.method} ${request.url}`;

      // Check if user has wildcard permission in JWT token (bypasses DB check)
      if (request.user.permissions && request.user.permissions.includes("*")) {
        // User has wildcard permission, grant access
        return;
      }

      const scope = extractScope(request);

      // Check all permissions with RLS context
      for (const permission of requiredPermissions) {
        const hasPermission = await withRLSContext(userId, () =>
          rbacService.checkPermission(userId, permission, scope),
        );

        if (!hasPermission) {
          await logPermissionDenial(userId, permission, resource, request);
          return reply.code(403).send({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied: ${permission} is required`,
            },
          });
        }
      }

      // All permissions granted
    } catch (error) {
      console.error("Permission check error:", error);
      return reply.code(403).send({
        success: false,
        error: {
          code: "PERMISSION_DENIED",
          message: "Permission check failed",
        },
      });
    }
  };
}

/**
 * Alias for permissionMiddleware for better naming consistency
 * @param requiredPermission - Permission code required to access the route
 * @returns Fastify middleware function
 */
export const requirePermission = permissionMiddleware;

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
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
        });
      }

      const userId = request.user.id;
      const resource = `${request.method} ${request.url}`;

      // Check if user has wildcard permission in JWT token (bypasses DB check)
      if (request.user.permissions && request.user.permissions.includes("*")) {
        // User has wildcard permission, grant access
        return;
      }

      const scope = extractScope(request);

      // Check if user has any of the required permissions with RLS context
      let hasAnyPermission = false;
      for (const permission of requiredPermissions) {
        const hasPermission = await withRLSContext(userId, () =>
          rbacService.checkPermission(userId, permission, scope),
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
        return reply.code(403).send({
          success: false,
          error: {
            code: "PERMISSION_DENIED",
            message: `Permission denied: One of [${requiredPermissions.join(", ")}] is required`,
          },
        });
      }

      // At least one permission granted
    } catch (error) {
      console.error("Permission check error:", error);
      return reply.code(403).send({
        success: false,
        error: {
          code: "PERMISSION_DENIED",
          message: "Permission check failed",
        },
      });
    }
  };
}
