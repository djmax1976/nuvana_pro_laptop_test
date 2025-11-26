import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { prisma } from "../utils/db";
import {
  toUTC,
  isValidTimezone,
  getStoreDate,
  toStoreTime,
} from "../utils/timezone.utils";
import { addDays } from "date-fns";

/**
 * Client Dashboard Routes
 *
 * Provides API endpoints for client users to access their dashboard data.
 * All endpoints require authentication and verify the user is a client user.
 * RLS policies automatically filter data to only show owned companies/stores.
 */
export async function clientDashboardRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/client/dashboard
   * Returns client dashboard overview data including:
   * - User info
   * - Owned companies with store counts
   * - Stores within owned companies
   * - Quick stats (active stores, total employees)
   *
   * @security Requires authentication, client user access
   * @returns Dashboard data filtered by RLS policies
   */
  fastify.get(
    "/api/client/dashboard",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;

      try {
        // Verify user is a client user
        const dbUser = await prisma.user.findUnique({
          where: { user_id: user.id },
          select: { is_client_user: true, name: true, email: true },
        });

        if (!dbUser?.is_client_user) {
          reply.code(403);
          return {
            error: "Access denied",
            message: "This endpoint is for client users only",
          };
        }

        // Get companies owned by this user with store counts
        // RLS policies will filter to only show owned companies
        const companies = await prisma.company.findMany({
          where: {
            owner_user_id: user.id,
            deleted_at: null,
          },
          select: {
            company_id: true,
            name: true,
            address: true,
            status: true,
            created_at: true,
            _count: {
              select: {
                stores: {
                  where: { deleted_at: null },
                },
              },
            },
          },
          orderBy: { name: "asc" },
        });

        // Get stores within owned companies
        const companyIds = companies.map(
          (c: { company_id: string }) => c.company_id,
        );
        const stores = await prisma.store.findMany({
          where: {
            company_id: { in: companyIds },
            deleted_at: null,
          },
          select: {
            store_id: true,
            name: true,
            location_json: true,
            timezone: true,
            status: true,
            company_id: true,
            created_at: true,
            company: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { name: "asc" },
        });

        // Calculate stats
        const activeStores = stores.filter(
          (s: { status: string }) => s.status === "ACTIVE",
        ).length;

        // Count employees in stores (users with role assignments to these stores)
        // Exclude the owner user themselves from the count
        // Use groupBy to count distinct user_ids (not role rows) to avoid double-counting
        const employeeRoles = await prisma.userRole.groupBy({
          by: ["user_id"],
          where: {
            user_id: { not: user.id },
            OR: [
              { company_id: { in: companyIds } },
              {
                store_id: {
                  in: stores.map((s: { store_id: string }) => s.store_id),
                },
              },
            ],
          },
        });
        const employeeCount = employeeRoles.length;

        // Count today's transactions across all owned stores
        // Uses per-store timezone-aware "today" calculation:
        // For each store, calculates local midnight to next midnight in the store's timezone,
        // converts those boundaries to UTC, then queries transactions within that UTC interval.
        // Stores are batched by timezone for efficiency. Falls back to UTC if timezone is missing/invalid.
        const storeIds = stores.map((s: { store_id: string }) => s.store_id);
        let todayTransactionCount = 0;

        if (storeIds.length > 0) {
          // Group stores by timezone for efficient batching
          const storesByTimezone = new Map<
            string,
            Array<{ store_id: string; timezone: string }>
          >();
          const storesWithoutTimezone: Array<{ store_id: string }> = [];

          for (const store of stores) {
            const timezone = store.timezone;
            if (timezone && isValidTimezone(timezone)) {
              if (!storesByTimezone.has(timezone)) {
                storesByTimezone.set(timezone, []);
              }
              storesByTimezone.get(timezone)!.push({
                store_id: store.store_id,
                timezone,
              });
            } else {
              // Fall back to UTC for stores with missing/invalid timezone
              storesWithoutTimezone.push({ store_id: store.store_id });
            }
          }

          // Process each timezone group
          for (const [timezone, timezoneStores] of storesByTimezone) {
            const timezoneStoreIds = timezoneStores.map((s) => s.store_id);

            // Get current date in store's timezone as YYYY-MM-DD
            const now = new Date();
            const localDateStr = getStoreDate(now, timezone);

            // Calculate local midnight (start of today) in store timezone
            const localMidnightStr = `${localDateStr} 00:00:00`;
            const startUTC = toUTC(localMidnightStr, timezone);

            // Calculate next midnight (start of tomorrow) in store timezone
            // Get current time in store timezone, add one day, then get the date string
            // This ensures correct handling of DST transitions
            const storeTimeNow = toStoreTime(now, timezone);
            const storeTimeTomorrow = addDays(storeTimeNow, 1);
            // storeTimeTomorrow is a UTC Date object representing tomorrow in store timezone
            // Format it in store timezone to get the date string
            const nextDayStr = getStoreDate(storeTimeTomorrow, timezone);
            const localNextMidnightStr = `${nextDayStr} 00:00:00`;
            const endUTC = toUTC(localNextMidnightStr, timezone);

            // Query transactions for this timezone group within the UTC interval
            const count = await prisma.transaction.count({
              where: {
                store_id: { in: timezoneStoreIds },
                timestamp: {
                  gte: startUTC,
                  lt: endUTC,
                },
              },
            });

            todayTransactionCount += count;
          }

          // Process stores without valid timezone using UTC fallback
          if (storesWithoutTimezone.length > 0) {
            const utcStoreIds = storesWithoutTimezone.map((s) => s.store_id);
            const now = new Date();
            const today = new Date(
              Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                0,
                0,
                0,
                0,
              ),
            );
            const tomorrow = new Date(today);
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

            const count = await prisma.transaction.count({
              where: {
                store_id: { in: utcStoreIds },
                timestamp: {
                  gte: today,
                  lt: tomorrow,
                },
              },
            });

            todayTransactionCount += count;
          }
        }

        // Format response to match ClientDashboardResponse interface
        reply.code(200);
        return {
          user: {
            id: user.id,
            email: dbUser.email,
            name: dbUser.name || "",
          },
          companies: companies.map(
            (c: {
              company_id: string;
              name: string;
              address: string | null;
              status: string;
              created_at: Date;
              _count: { stores: number };
            }) => ({
              company_id: c.company_id,
              name: c.name,
              address: c.address,
              status: c.status,
              created_at: c.created_at.toISOString(),
              store_count: c._count.stores,
            }),
          ),
          stores: stores.map(
            (s: {
              store_id: string;
              company_id: string;
              company: { name: string };
              name: string;
              location_json: unknown;
              timezone: string;
              status: string;
              created_at: Date;
            }) => ({
              store_id: s.store_id,
              company_id: s.company_id,
              company_name: s.company.name,
              name: s.name,
              location_json: s.location_json as {
                address?: string;
                gps?: { lat: number; lng: number };
              } | null,
              timezone: s.timezone,
              status: s.status,
              created_at: s.created_at.toISOString(),
            }),
          ),
          stats: {
            total_companies: companies.length,
            total_stores: stores.length,
            active_stores: activeStores,
            total_employees: employeeCount,
            today_transactions: todayTransactionCount,
          },
        };
      } catch (error) {
        fastify.log.error({ error }, "Client dashboard error");
        reply.code(500);
        return {
          error: "Internal Server Error",
          message: "Failed to load dashboard data",
        };
      }
    },
  );
}
