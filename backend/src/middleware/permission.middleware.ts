import { FastifyRequest, FastifyReply } from "fastify";
import { rbacService } from "../services/rbac.service";
import type { PermissionCode } from "../constants/permissions";
import { prisma, withRLSContext, isValidUUID } from "../utils/db";
import type { UserIdentity } from "./auth.middleware";
import { permissionCacheService } from "../services/permission-cache.service";
import { userAccessCacheService } from "../services/user-access-cache.service";
import { rbacCircuitBreaker, CircuitOpenError } from "../utils/circuit-breaker";

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
    // Only include companyId if it's a valid UUID to prevent DB query errors
    if (companyId && isValidUUID(String(companyId))) {
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
    // Only include storeId if it's a valid UUID to prevent DB query errors
    if (storeId && isValidUUID(String(storeId))) {
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
 * JWT-based store company access verification (CACHED)
 * Checks if user has company-level access to a store using JWT company_ids
 *
 * PERFORMANCE: Uses Redis cache for store-company mappings
 * - Cache hit: Zero database queries
 * - Cache miss: Single query to stores table, then cached for 15 minutes
 *
 * @param companyIds - Array of company IDs from JWT
 * @param storeId - Store ID to verify access to
 * @returns true if store belongs to one of user's companies, false otherwise
 */
async function verifyStoreCompanyAccessFromJWT(
  companyIds: string[],
  storeId: string,
): Promise<boolean> {
  // Use cached store-company mapping (avoids DB query on cache hit)
  return permissionCacheService.verifyStoreCompanyAccess(companyIds, storeId);
}

/**
 * Fast-path store access verification (legacy - used as fallback)
 * Verifies user has access to a store with minimal database queries
 * Uses explicit user_id in WHERE clause to bypass RLS (no session variable needed)
 *
 * Scope Hierarchy:
 * - SYSTEM: Access to all stores
 * - SUPPORT: Access to stores within assigned company (COMPANY + STORE access)
 * - COMPANY: Access to stores within assigned company
 * - STORE: Access to directly assigned store only
 *
 * @param userId - User ID
 * @param storeId - Store ID to verify access to
 * @returns true if user has access, false otherwise
 */
async function verifyStoreAccessFast(
  userId: string,
  storeId: string,
): Promise<boolean> {
  // Single query to check if user has access to this store via their roles
  // Uses explicit user_id filter which bypasses RLS policy requirements
  const userRole = await prisma.userRole.findFirst({
    where: {
      user_id: userId,
      OR: [
        // SYSTEM scope (superadmin) - access to all stores
        { role: { scope: "SYSTEM" } },
        // SUPPORT scope - access if store belongs to user's assigned company
        // SUPPORT has COMPANY + STORE level access (but NOT SYSTEM)
        {
          role: { scope: "SUPPORT" },
          company: {
            stores: {
              some: { store_id: storeId },
            },
          },
        },
        // COMPANY scope - access if store belongs to user's company
        {
          role: { scope: "COMPANY" },
          company: {
            stores: {
              some: { store_id: storeId },
            },
          },
        },
        // STORE scope - direct store assignment
        { store_id: storeId },
      ],
    },
    select: { user_role_id: true },
  });

  return userRole !== null;
}

/**
 * Fast-path company access verification
 * Verifies user has access to a company with minimal database queries
 * Uses explicit user_id in WHERE clause to bypass RLS (no session variable needed)
 *
 * Scope Hierarchy:
 * - SYSTEM: Access to all companies
 * - SUPPORT: Access to assigned company (COMPANY + STORE level access)
 * - COMPANY: Access to directly assigned company
 * - STORE: Access if user has role in a store belonging to this company
 *
 * @param userId - User ID
 * @param companyId - Company ID to verify access to
 * @returns true if user has access, false otherwise
 */
async function verifyCompanyAccessFast(
  userId: string,
  companyId: string,
): Promise<boolean> {
  // Single query to check if user has access to this company via their roles
  // Uses explicit user_id filter which bypasses RLS policy requirements
  const userRole = await prisma.userRole.findFirst({
    where: {
      user_id: userId,
      OR: [
        // SYSTEM scope (superadmin) - access to all companies
        { role: { scope: "SYSTEM" } },
        // SUPPORT scope - direct company assignment
        // SUPPORT has COMPANY + STORE level access (but NOT SYSTEM)
        {
          role: { scope: "SUPPORT" },
          company_id: companyId,
        },
        // COMPANY scope - direct company assignment
        // The role must be COMPANY scope AND the user_role must have matching company_id
        {
          role: { scope: "COMPANY" },
          company_id: companyId,
        },
        // STORE scope - access if user has role in a store belonging to this company
        {
          role: { scope: "STORE" },
          store: { company_id: companyId },
        },
      ],
    },
    select: { user_role_id: true },
  });

  return userRole !== null;
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

      // PERFORMANCE OPTIMIZATION: Check JWT permissions first (fast path)
      // The JWT token contains the user's permissions, so we can avoid database
      // queries in most cases by trusting the JWT
      const hasPermissionInJWT =
        request.user.permissions &&
        (request.user.permissions.includes("*") ||
          request.user.permissions.includes(requiredPermission));

      // Extract scope from request (used by both fast and slow paths)
      const scope = extractScope(request);

      if (hasPermissionInJWT) {
        // If no scope in request, trust JWT and grant access
        // The service layer handles data filtering via RLS
        if (!scope.companyId && !scope.storeId) {
          return; // Permission granted
        }

        // Check if user is system admin (from JWT - no DB query needed)
        if (request.user.is_system_admin) {
          return; // Permission granted - system admin has access to everything
        }

        // For scoped requests, use CACHED user access map (PHASE 4 OPTIMIZATION)
        // This eliminates DB queries by caching user's complete access scope
        if (scope.storeId) {
          // 1. Try cached user access map first (zero DB queries on cache hit)
          const { hasAccess: cachedStoreAccess, fromCache } =
            await userAccessCacheService.hasStoreAccess(
              userId,
              scope.storeId,
              request.user.store_ids,
              request.user.company_ids,
            );

          if (cachedStoreAccess) {
            return; // Permission granted from cache or JWT fallback
          }

          // 2. If not from cache (cache miss), check company-level access via store-company mapping cache
          if (!fromCache) {
            // Check if user has company-level access to this store
            const hasCompanyAccess = await verifyStoreCompanyAccessFromJWT(
              request.user.company_ids,
              scope.storeId,
            );
            if (hasCompanyAccess) {
              return; // Permission granted - company-level access
            }
          } else {
            // Cache hit but no direct access - check company-level access
            const accessMap =
              await userAccessCacheService.getUserAccessMap(userId);
            if (accessMap && accessMap.companyIds.length > 0) {
              const hasCompanyAccess = await verifyStoreCompanyAccessFromJWT(
                accessMap.companyIds,
                scope.storeId,
              );
              if (hasCompanyAccess) {
                return; // Permission granted - company-level access via cached companies
              }
            }
          }

          // 3. Final fallback to legacy DB check (handles edge cases not in cache/JWT)
          const hasStoreAccess = await verifyStoreAccessFast(
            userId,
            scope.storeId,
          );
          if (hasStoreAccess) {
            return; // Permission granted
          }
          // Fast-path failed - fall through to slow path
        } else if (scope.companyId) {
          // 1. Try cached user access map first (zero DB queries on cache hit)
          const { hasAccess: cachedCompanyAccess } =
            await userAccessCacheService.hasCompanyAccess(
              userId,
              scope.companyId,
              request.user.company_ids,
            );

          if (cachedCompanyAccess) {
            return; // Permission granted from cache or JWT fallback
          }

          // 2. Final fallback to legacy DB check
          const hasCompanyAccess = await verifyCompanyAccessFast(
            userId,
            scope.companyId,
          );
          if (hasCompanyAccess) {
            return; // Permission granted
          }
          // Fast-path failed - fall through to slow path
        }

        // NOTE: If fast-path verification failed, we fall through to slow path
        // instead of immediately denying. This ensures we don't miss edge cases
        // like client permission overrides that aren't captured in the fast-path query.
      }

      // SLOW PATH: Either JWT doesn't have permission, or fast-path scope check failed
      // Use full RBAC check with RLS context, wrapped in circuit breaker for resilience

      // Check permission using RBAC service with RLS context
      // RLS context is needed because user_roles table has RLS policies
      // Circuit breaker protects against cascading failures when DB is slow/unavailable
      let hasPermission = false;
      try {
        hasPermission = await rbacCircuitBreaker.fire(() =>
          withRLSContext(userId, () =>
            rbacService.checkPermission(userId, requiredPermission, scope),
          ),
        );
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          // Circuit is open - DB is unavailable
          // Fail secure: If we can't verify permission, deny access
          console.warn(
            `RBAC circuit open - denying permission check for user ${userId}`,
          );
          return reply.code(503).send({
            success: false,
            error: {
              code: "SERVICE_UNAVAILABLE",
              message:
                "Permission service temporarily unavailable. Please try again.",
            },
          });
        }
        // Other errors - treat as permission denied
        throw error;
      }

      if (!hasPermission) {
        // Log permission denial with technical details for debugging
        await logPermissionDenial(
          userId,
          requiredPermission,
          resource,
          request,
        );

        // Return 403 Forbidden with user-friendly message
        // Technical details (permission code) are logged but not exposed to user
        return reply.code(403).send({
          success: false,
          error: {
            code: "PERMISSION_DENIED",
            message:
              "You do not have permission to access this feature. Please contact your manager.",
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

      // PERFORMANCE OPTIMIZATION: Check JWT permissions first (fast path)
      const hasAllInJWT =
        request.user.permissions &&
        (request.user.permissions.includes("*") ||
          requiredPermissions.every((p) =>
            request.user!.permissions.includes(p),
          ));

      if (hasAllInJWT) {
        const scope = extractScope(request);

        // If no scope in request, trust JWT
        if (!scope.companyId && !scope.storeId) {
          return;
        }

        // System admin bypass (from JWT - no DB query)
        if (request.user.is_system_admin) {
          return;
        }

        // CACHED scope verification (PHASE 4 OPTIMIZATION)
        if (scope.storeId) {
          const { hasAccess: cachedStoreAccess, fromCache } =
            await userAccessCacheService.hasStoreAccess(
              userId,
              scope.storeId,
              request.user.store_ids,
              request.user.company_ids,
            );

          if (cachedStoreAccess) {
            return; // Permission granted from cache
          }

          // Check company-level access
          const companyIds = fromCache
            ? (await userAccessCacheService.getUserAccessMap(userId))
                ?.companyIds || request.user.company_ids
            : request.user.company_ids;

          const hasCompanyAccess = await verifyStoreCompanyAccessFromJWT(
            companyIds,
            scope.storeId,
          );
          if (hasCompanyAccess) {
            return;
          }

          // Fallback to legacy DB check
          const hasStoreAccess = await verifyStoreAccessFast(
            userId,
            scope.storeId,
          );
          if (hasStoreAccess) {
            return;
          }
        } else if (scope.companyId) {
          const { hasAccess: cachedCompanyAccess } =
            await userAccessCacheService.hasCompanyAccess(
              userId,
              scope.companyId,
              request.user.company_ids,
            );

          if (cachedCompanyAccess) {
            return; // Permission granted from cache
          }

          // Fallback to legacy DB check
          const hasCompanyAccess = await verifyCompanyAccessFast(
            userId,
            scope.companyId,
          );
          if (hasCompanyAccess) {
            return;
          }
        }

        // Fast-path scope verification failed - fall through to slow path
      }

      // SLOW PATH: Fall back to full RBAC check with circuit breaker
      const scope = extractScope(request);

      // Check all permissions with RLS context, wrapped in circuit breaker
      for (const permission of requiredPermissions) {
        let hasPermission = false;
        try {
          hasPermission = await rbacCircuitBreaker.fire(() =>
            withRLSContext(userId, () =>
              rbacService.checkPermission(userId, permission, scope),
            ),
          );
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            console.warn(
              `RBAC circuit open - denying permission check for user ${userId}`,
            );
            return reply.code(503).send({
              success: false,
              error: {
                code: "SERVICE_UNAVAILABLE",
                message:
                  "Permission service temporarily unavailable. Please try again.",
              },
            });
          }
          throw error;
        }

        if (!hasPermission) {
          await logPermissionDenial(userId, permission, resource, request);
          return reply.code(403).send({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message:
                "You do not have permission to access this feature. Please contact your manager.",
            },
          });
        }
      }

      // All permissions granted
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        return reply.code(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message:
              "Permission service temporarily unavailable. Please try again.",
          },
        });
      }
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

      // PERFORMANCE OPTIMIZATION: Check JWT permissions first (fast path)
      const hasAnyInJWT =
        request.user.permissions &&
        (request.user.permissions.includes("*") ||
          requiredPermissions.some((p) =>
            request.user!.permissions.includes(p),
          ));

      if (hasAnyInJWT) {
        const scope = extractScope(request);

        // If no scope in request, trust JWT
        if (!scope.companyId && !scope.storeId) {
          return;
        }

        // System admin bypass (from JWT - no DB query)
        if (request.user.is_system_admin) {
          return;
        }

        // CACHED scope verification (PHASE 4 OPTIMIZATION)
        if (scope.storeId) {
          const { hasAccess: cachedStoreAccess, fromCache } =
            await userAccessCacheService.hasStoreAccess(
              userId,
              scope.storeId,
              request.user.store_ids,
              request.user.company_ids,
            );

          if (cachedStoreAccess) {
            return; // Permission granted from cache
          }

          // Check company-level access
          const companyIds = fromCache
            ? (await userAccessCacheService.getUserAccessMap(userId))
                ?.companyIds || request.user.company_ids
            : request.user.company_ids;

          const hasCompanyAccess = await verifyStoreCompanyAccessFromJWT(
            companyIds,
            scope.storeId,
          );
          if (hasCompanyAccess) {
            return;
          }

          // Fallback to legacy DB check
          const hasStoreAccess = await verifyStoreAccessFast(
            userId,
            scope.storeId,
          );
          if (hasStoreAccess) {
            return;
          }
        } else if (scope.companyId) {
          const { hasAccess: cachedCompanyAccess } =
            await userAccessCacheService.hasCompanyAccess(
              userId,
              scope.companyId,
              request.user.company_ids,
            );

          if (cachedCompanyAccess) {
            return; // Permission granted from cache
          }

          // Fallback to legacy DB check
          const hasCompanyAccess = await verifyCompanyAccessFast(
            userId,
            scope.companyId,
          );
          if (hasCompanyAccess) {
            return;
          }
        }

        // Fast-path scope verification failed - fall through to slow path
      }

      // SLOW PATH: Fall back to full RBAC check with circuit breaker
      const scope = extractScope(request);

      // Check if user has any of the required permissions with RLS context
      // Circuit breaker protects against cascading failures
      let hasAnyPermission = false;
      for (const permission of requiredPermissions) {
        try {
          const hasPermission = await rbacCircuitBreaker.fire(() =>
            withRLSContext(userId, () =>
              rbacService.checkPermission(userId, permission, scope),
            ),
          );

          if (hasPermission) {
            hasAnyPermission = true;
            break;
          }
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            console.warn(
              `RBAC circuit open - denying permission check for user ${userId}`,
            );
            return reply.code(503).send({
              success: false,
              error: {
                code: "SERVICE_UNAVAILABLE",
                message:
                  "Permission service temporarily unavailable. Please try again.",
              },
            });
          }
          throw error;
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
            message:
              "You do not have permission to access this feature. Please contact your manager.",
          },
        });
      }

      // At least one permission granted
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        return reply.code(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message:
              "Permission service temporarily unavailable. Please try again.",
          },
        });
      }
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
