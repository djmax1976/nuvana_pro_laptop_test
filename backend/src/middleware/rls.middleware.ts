import { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { withRLSContext } from "../utils/db";
import type { UserIdentity } from "./auth.middleware";

/**
 * Wrap a Fastify route handler with RLS context
 * Automatically sets RLS context for all Prisma queries in the handler
 *
 * @param handler - Route handler function
 * @returns Wrapped handler with RLS context
 *
 * @example
 * ```typescript
 * fastify.get('/api/companies', rlsHandler(async (request, reply) => {
 *   const companies = await prisma.company.findMany();
 *   return { data: companies };
 * }));
 * ```
 */
export function rlsHandler(
  handler: (
    request: FastifyRequest & { user?: UserIdentity },
    reply: FastifyReply,
  ) => Promise<any>,
) {
  return async (
    request: FastifyRequest & { user?: UserIdentity },
    reply: FastifyReply,
  ): Promise<any> => {
    const user = (request as any).user as UserIdentity | undefined;
    const userId = user?.id || null;

    // Wrap handler execution with RLS context
    return withRLSContext(userId, async () => {
      return handler(request, reply);
    });
  };
}

/**
 * Fastify plugin to register RLS middleware
 * Automatically wraps ALL route handlers with RLS context via onRoute hook
 * This ensures tenant isolation is enforced globally across all routes
 *
 * @param fastify - Fastify instance
 */
export async function rlsPlugin(fastify: FastifyInstance) {
  // Add rlsHandler as a decorator for convenience (for manual wrapping if needed)
  fastify.decorate("rlsHandler", rlsHandler);

  // Use onRoute hook to wrap all route handlers with RLS context
  // This runs when routes are registered, allowing us to wrap the handler
  fastify.addHook("onRoute", (routeOptions) => {
    const originalHandler = routeOptions.handler;

    // Wrap the handler with RLS context
    routeOptions.handler = async function (request, reply) {
      const user = (request as any).user as UserIdentity | undefined;
      const userId = user?.id || null;

      // Execute original handler within RLS context
      return withRLSContext(userId, async () => {
        return originalHandler.call(this, request, reply);
      });
    };
  });
}

// Extend Fastify types to include rlsHandler decorator
declare module "fastify" {
  interface FastifyInstance {
    rlsHandler: typeof rlsHandler;
  }
}
