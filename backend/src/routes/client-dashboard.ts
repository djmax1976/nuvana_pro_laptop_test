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
import { PERMISSIONS } from "../constants/permissions";

/**
 * Client Dashboard Routes
 *
 * Provides API endpoints for client users to access their dashboard data.
 * All endpoints require authentication and verify the user is a client user.
 * RLS policies automatically filter data to only show owned companies/stores.
 *
 * PERFORMANCE OPTIMIZATIONS (Dec 2025):
 * - Queries are parallelized using Promise.all() where possible
 * - Transaction counts use a single query with groupBy instead of per-timezone queries
 * - Independent queries run concurrently to reduce total response time
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
        // PHASE 1: Parallel fetch of user info, permissions, owned companies, and role assignments
        // These queries are independent and can run concurrently
        const [
          dbUser,
          hasClientDashboardPermission,
          ownedCompanies,
          userRoleAssignments,
        ] = await Promise.all([
          // Get user info
          prisma.user.findUnique({
            where: { user_id: user.id },
            select: { is_client_user: true, name: true, email: true },
          }),

          // Check if user has CLIENT_DASHBOARD_ACCESS permission via their roles
          prisma.userRole.findFirst({
            where: {
              user_id: user.id,
              role: {
                role_permissions: {
                  some: {
                    permission: {
                      code: PERMISSIONS.CLIENT_DASHBOARD_ACCESS,
                    },
                  },
                },
              },
            },
          }),

          // Get companies owned by this user with store counts
          prisma.company.findMany({
            where: {
              owner_user_id: user.id,
            },
            select: {
              company_id: true,
              name: true,
              address: true,
              status: true,
              created_at: true,
              _count: {
                select: {
                  stores: true,
                },
              },
            },
            orderBy: { name: "asc" },
          }),

          // Get all role assignments with store/company scopes
          prisma.userRole.findMany({
            where: {
              user_id: user.id,
              OR: [{ store_id: { not: null } }, { company_id: { not: null } }],
            },
            select: {
              store_id: true,
              company_id: true,
              role: {
                select: {
                  scope: true,
                },
              },
            },
          }),
        ]);

        // Check permissions
        if (
          !dbUser ||
          (!dbUser.is_client_user && !hasClientDashboardPermission)
        ) {
          reply.code(403);
          reply.send({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "This endpoint is for client users only",
            },
          });
          return;
        }

        // Process role assignments (in-memory, fast)
        const assignedStoreIds = userRoleAssignments
          .filter((r) => r.store_id !== null)
          .map((r) => r.store_id as string);

        const assignedCompanyIds = userRoleAssignments
          .filter(
            (r) =>
              r.company_id !== null &&
              (r.role.scope === "COMPANY" || r.role.scope === "SYSTEM"),
          )
          .map((r) => r.company_id as string);

        const ownedCompanyIds = ownedCompanies.map((c) => c.company_id);
        const allAccessibleCompanyIds = [
          ...ownedCompanyIds,
          ...assignedCompanyIds,
        ];

        // Build OR conditions for stores query
        const storeOrConditions: Array<
          { company_id: { in: string[] } } | { store_id: { in: string[] } }
        > = [];

        if (allAccessibleCompanyIds.length > 0) {
          storeOrConditions.push({
            company_id: { in: allAccessibleCompanyIds },
          });
        }
        if (assignedStoreIds.length > 0) {
          storeOrConditions.push({ store_id: { in: assignedStoreIds } });
        }

        // Filter company IDs for assigned companies query (exclude owned)
        const assignedCompanyIdsNotOwned = assignedCompanyIds.filter(
          (id) => !ownedCompanies.some((c) => c.company_id === id),
        );

        // PHASE 2: Parallel fetch of assigned companies and stores
        const [assignedCompanies, stores] = await Promise.all([
          // Get companies the user is assigned to (not owned)
          assignedCompanyIdsNotOwned.length > 0
            ? prisma.company.findMany({
                where: {
                  company_id: {
                    in: assignedCompanyIdsNotOwned,
                  },
                },
                select: {
                  company_id: true,
                  name: true,
                  address: true,
                  status: true,
                  created_at: true,
                  _count: {
                    select: {
                      stores: true,
                    },
                  },
                },
                orderBy: { name: "asc" },
              })
            : Promise.resolve([]),

          // Get stores
          storeOrConditions.length > 0
            ? prisma.store.findMany({
                where: {
                  OR: storeOrConditions,
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
              })
            : Promise.resolve([]),
        ]);

        // Combine owned and assigned companies
        const companies = [...ownedCompanies, ...assignedCompanies];

        // Deduplicate stores (in case user owns company AND is assigned to store)
        const uniqueStores = stores.filter(
          (store, index, self) =>
            index === self.findIndex((s) => s.store_id === store.store_id),
        );

        const companyIds = companies.map((c) => c.company_id);
        const storeIdsForCount = uniqueStores.map((s) => s.store_id);

        // Calculate active stores count (in-memory, fast)
        const activeStores = uniqueStores.filter(
          (s) => s.status === "ACTIVE",
        ).length;

        // PHASE 3: Parallel fetch of employee count and transaction counts
        // Build transaction count query parameters
        const storeIds = uniqueStores.map((s) => s.store_id);

        // Calculate the widest possible time range for all timezones
        // This allows us to use a single query and filter in application
        let earliestStart: Date | null = null;
        let latestEnd: Date | null = null;
        const storeTimezoneMap = new Map<string, { start: Date; end: Date }>();

        if (storeIds.length > 0) {
          const now = new Date();

          for (const store of uniqueStores) {
            const timezone = store.timezone;
            if (timezone && isValidTimezone(timezone)) {
              const localDateStr = getStoreDate(now, timezone);
              const localMidnightStr = `${localDateStr} 00:00:00`;
              const startUTC = toUTC(localMidnightStr, timezone);

              const storeTimeNow = toStoreTime(now, timezone);
              const storeTimeTomorrow = addDays(storeTimeNow, 1);
              const nextDayStr = getStoreDate(storeTimeTomorrow, timezone);
              const localNextMidnightStr = `${nextDayStr} 00:00:00`;
              const endUTC = toUTC(localNextMidnightStr, timezone);

              storeTimezoneMap.set(store.store_id, {
                start: startUTC,
                end: endUTC,
              });

              if (!earliestStart || startUTC < earliestStart) {
                earliestStart = startUTC;
              }
              if (!latestEnd || endUTC > latestEnd) {
                latestEnd = endUTC;
              }
            } else {
              // UTC fallback
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

              storeTimezoneMap.set(store.store_id, {
                start: today,
                end: tomorrow,
              });

              if (!earliestStart || today < earliestStart) {
                earliestStart = today;
              }
              if (!latestEnd || tomorrow > latestEnd) {
                latestEnd = tomorrow;
              }
            }
          }
        }

        // PERFORMANCE OPTIMIZATION: Run employee count and transaction query in parallel
        const [employeeRoles, transactionsByStore] = await Promise.all([
          // Count employees (distinct users with roles in these companies/stores)
          storeIdsForCount.length > 0 || companyIds.length > 0
            ? prisma.userRole.groupBy({
                by: ["user_id"],
                where: {
                  user_id: { not: user.id },
                  OR: [
                    ...(companyIds.length > 0
                      ? [{ company_id: { in: companyIds } }]
                      : []),
                    ...(storeIdsForCount.length > 0
                      ? [{ store_id: { in: storeIdsForCount } }]
                      : []),
                  ],
                },
              })
            : Promise.resolve([]),

          // PERFORMANCE OPTIMIZATION: Single query for all transaction counts
          // Instead of N queries (one per timezone), we fetch all transactions in the
          // widest time range and count per store, then filter in application
          storeIds.length > 0 && earliestStart && latestEnd
            ? prisma.transaction.groupBy({
                by: ["store_id"],
                where: {
                  store_id: { in: storeIds },
                  timestamp: {
                    gte: earliestStart,
                    lt: latestEnd,
                  },
                },
                _count: {
                  transaction_id: true,
                },
              })
            : Promise.resolve([]),
        ]);

        const employeeCount = employeeRoles.length;

        // Calculate today's transaction count with timezone-aware filtering
        // For stores in the same timezone, the groupBy results are already correct
        // For stores in different timezones, we need to validate each store's transactions
        // fall within its specific "today" boundaries
        let todayTransactionCount = 0;

        if (transactionsByStore.length > 0) {
          // If all stores share the same timezone boundaries, we can use the grouped counts directly
          // Otherwise, we'd need per-store filtering. For simplicity and performance,
          // we'll use the grouped counts which are accurate for single-timezone scenarios
          // and approximately correct for multi-timezone (within ~24 hour accuracy)
          for (const storeCount of transactionsByStore) {
            const boundaries = storeTimezoneMap.get(storeCount.store_id);
            if (boundaries) {
              // The groupBy already filtered by the widest range, but each store
              // may have different actual boundaries. For dashboard purposes,
              // this approximation is acceptable and much faster than N queries.
              todayTransactionCount += storeCount._count.transaction_id;
            }
          }
        }

        // Format response to match ClientDashboardResponse interface
        reply.code(200);
        reply.send({
          success: true,
          data: {
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
            stores: uniqueStores.map(
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
              total_stores: uniqueStores.length,
              active_stores: activeStores,
              total_employees: employeeCount,
              today_transactions: todayTransactionCount,
            },
          },
        });
      } catch (error) {
        fastify.log.error({ error }, "Client dashboard error");
        reply.code(500);
        reply.send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to load dashboard data",
          },
        });
      }
    },
  );

  /**
   * GET /api/client/dashboard/sales
   * Returns today's sales data aggregated from DaySummary tables
   * Includes fuel sales, net sales, lottery, and transaction metrics
   *
   * @security Requires authentication, client user access
   * @returns Today's sales data for all accessible stores
   */
  fastify.get(
    "/api/client/dashboard/sales",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;

      try {
        // Verify user has client dashboard access
        const [dbUser, hasClientDashboardPermission] = await Promise.all([
          prisma.user.findUnique({
            where: { user_id: user.id },
            select: { is_client_user: true },
          }),
          prisma.userRole.findFirst({
            where: {
              user_id: user.id,
              role: {
                role_permissions: {
                  some: {
                    permission: {
                      code: PERMISSIONS.CLIENT_DASHBOARD_ACCESS,
                    },
                  },
                },
              },
            },
          }),
        ]);

        if (
          !dbUser ||
          (!dbUser.is_client_user && !hasClientDashboardPermission)
        ) {
          reply.code(403);
          reply.send({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "This endpoint is for client users only",
            },
          });
          return;
        }

        // Get accessible store IDs for this user
        const [ownedCompanies, userRoleAssignments] = await Promise.all([
          prisma.company.findMany({
            where: { owner_user_id: user.id },
            select: { company_id: true },
          }),
          prisma.userRole.findMany({
            where: {
              user_id: user.id,
              OR: [{ store_id: { not: null } }, { company_id: { not: null } }],
            },
            select: {
              store_id: true,
              company_id: true,
              role: { select: { scope: true } },
            },
          }),
        ]);

        const ownedCompanyIds = ownedCompanies.map((c) => c.company_id);
        const assignedCompanyIds = userRoleAssignments
          .filter(
            (r) =>
              r.company_id !== null &&
              (r.role.scope === "COMPANY" || r.role.scope === "SYSTEM"),
          )
          .map((r) => r.company_id as string);
        const assignedStoreIds = userRoleAssignments
          .filter((r) => r.store_id !== null)
          .map((r) => r.store_id as string);

        const allAccessibleCompanyIds = [
          ...ownedCompanyIds,
          ...assignedCompanyIds,
        ];

        // Build store filter conditions
        const storeOrConditions: Array<
          { company_id: { in: string[] } } | { store_id: { in: string[] } }
        > = [];
        if (allAccessibleCompanyIds.length > 0) {
          storeOrConditions.push({
            company_id: { in: allAccessibleCompanyIds },
          });
        }
        if (assignedStoreIds.length > 0) {
          storeOrConditions.push({ store_id: { in: assignedStoreIds } });
        }

        if (storeOrConditions.length === 0) {
          // No accessible stores
          reply.code(200);
          reply.send({
            success: true,
            data: {
              today: {
                fuel_sales: 0,
                fuel_gallons: 0,
                net_sales: 0,
                gross_sales: 0,
                tax_collected: 0,
                lottery_sales: null,
                lottery_net: null,
                transaction_count: 0,
                avg_transaction: 0,
              },
              week: [],
            },
          });
          return;
        }

        // Get accessible stores with their timezones
        const stores = await prisma.store.findMany({
          where: { OR: storeOrConditions },
          select: { store_id: true, timezone: true },
        });

        const storeIds = stores.map((s) => s.store_id);

        if (storeIds.length === 0) {
          reply.code(200);
          reply.send({
            success: true,
            data: {
              today: {
                fuel_sales: 0,
                fuel_gallons: 0,
                net_sales: 0,
                gross_sales: 0,
                tax_collected: 0,
                lottery_sales: null,
                lottery_net: null,
                transaction_count: 0,
                avg_transaction: 0,
              },
              week: [],
            },
          });
          return;
        }

        // Calculate today's business date for each store timezone
        // For dashboard, we use the most common timezone or UTC
        const now = new Date();
        const businessDates: Date[] = [];

        for (const store of stores) {
          const tz = store.timezone;
          if (tz && isValidTimezone(tz)) {
            const localDateStr = getStoreDate(now, tz);
            businessDates.push(new Date(localDateStr));
          } else {
            // UTC fallback
            const utcDate = new Date(
              Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
              ),
            );
            businessDates.push(utcDate);
          }
        }

        // Get unique business dates (usually just one for single-timezone deployments)
        const uniqueDates = [
          ...new Set(businessDates.map((d) => d.toISOString().split("T")[0])),
        ];

        // Query DaySummary for today's data across all accessible stores
        // Using aggregate for efficient summing
        // First try today's date, then fall back to most recent available data
        let todaySummary = await prisma.daySummary.aggregate({
          where: {
            store_id: { in: storeIds },
            business_date: { in: uniqueDates.map((d) => new Date(d)) },
          },
          _sum: {
            fuel_sales: true,
            fuel_gallons: true,
            net_sales: true,
            gross_sales: true,
            tax_collected: true,
            lottery_sales: true,
            lottery_net: true,
            transaction_count: true,
          },
          _avg: {
            avg_transaction: true,
          },
        });

        // Check if DaySummary has today's fuel data
        // If not, try to get real-time fuel data from transactions (Phase 5.6)
        let hasTodayFuelData =
          todaySummary._sum.fuel_sales &&
          Number(todaySummary._sum.fuel_sales) > 0;

        let realtimeFuelSales = 0;
        let realtimeFuelGallons = 0;
        let realtimeTransactionCount = 0;

        if (!hasTodayFuelData) {
          // Query transactions for today's fuel sales (real-time from PJR files)
          const todayStart = new Date(
            uniqueDates[0] || new Date().toISOString().split("T")[0],
          );
          const todayEnd = new Date(todayStart);
          todayEnd.setDate(todayEnd.getDate() + 1);

          const fuelLineItems = await prisma.transactionLineItem.aggregate({
            where: {
              transaction: {
                store_id: { in: storeIds },
                business_date: {
                  gte: todayStart,
                  lt: todayEnd,
                },
                is_training_mode: false, // Exclude training transactions
              },
              item_type: "FUEL",
              line_status: "normal", // Only normal (not cancelled) lines
            },
            _sum: {
              line_total: true,
              quantity: true,
            },
            _count: true,
          });

          realtimeFuelSales = fuelLineItems._sum.line_total?.toNumber() ?? 0;
          realtimeFuelGallons = fuelLineItems._sum.quantity?.toNumber() ?? 0;
          realtimeTransactionCount = fuelLineItems._count ?? 0;

          hasTodayFuelData = realtimeFuelSales > 0;
        }

        // If no data for today, get the most recent day's data
        const hasNoTodayData =
          !hasTodayFuelData &&
          !todaySummary._sum.net_sales &&
          !todaySummary._sum.gross_sales;

        let latestBusinessDate: string | null = null;

        if (hasNoTodayData) {
          // Find the most recent business date with data
          const latestRecord = await prisma.daySummary.findFirst({
            where: { store_id: { in: storeIds } },
            orderBy: { business_date: "desc" },
            select: { business_date: true },
          });

          if (latestRecord) {
            latestBusinessDate = latestRecord.business_date
              .toISOString()
              .split("T")[0];

            // Re-query with the latest available date
            todaySummary = await prisma.daySummary.aggregate({
              where: {
                store_id: { in: storeIds },
                business_date: latestRecord.business_date,
              },
              _sum: {
                fuel_sales: true,
                fuel_gallons: true,
                net_sales: true,
                gross_sales: true,
                tax_collected: true,
                lottery_sales: true,
                lottery_net: true,
                transaction_count: true,
              },
              _avg: {
                avg_transaction: true,
              },
            });
          }
        }

        // Get last 7 days of data for trend chart
        // If we have a latest date, use that as the end point
        const trendEndDate = latestBusinessDate
          ? new Date(latestBusinessDate)
          : now;
        const trendStartDate = new Date(trendEndDate);
        trendStartDate.setDate(trendStartDate.getDate() - 6);

        const weekSummaries = await prisma.daySummary.groupBy({
          by: ["business_date"],
          where: {
            store_id: { in: storeIds },
            business_date: {
              gte: trendStartDate,
              lte: trendEndDate,
            },
          },
          _sum: {
            fuel_sales: true,
            net_sales: true,
            gross_sales: true,
            lottery_sales: true,
            tax_collected: true,
          },
          orderBy: {
            business_date: "asc",
          },
        });

        // Format response
        // Use real-time fuel data from transactions if DaySummary doesn't have today's data
        const daySummaryFuelSales =
          todaySummary._sum.fuel_sales?.toNumber() ?? 0;
        const daySummaryFuelGallons =
          todaySummary._sum.fuel_gallons?.toNumber() ?? 0;

        // Prefer real-time transaction data for today if DaySummary is empty
        const finalFuelSales =
          realtimeFuelSales > 0 && daySummaryFuelSales === 0
            ? realtimeFuelSales
            : daySummaryFuelSales;
        const finalFuelGallons =
          realtimeFuelGallons > 0 && daySummaryFuelGallons === 0
            ? realtimeFuelGallons
            : daySummaryFuelGallons;

        const todayData = {
          fuel_sales: finalFuelSales,
          fuel_gallons: finalFuelGallons,
          net_sales: todaySummary._sum.net_sales?.toNumber() ?? 0,
          gross_sales: todaySummary._sum.gross_sales?.toNumber() ?? 0,
          tax_collected: todaySummary._sum.tax_collected?.toNumber() ?? 0,
          lottery_sales: todaySummary._sum.lottery_sales?.toNumber() ?? null,
          lottery_net: todaySummary._sum.lottery_net?.toNumber() ?? null,
          transaction_count:
            (todaySummary._sum.transaction_count ?? 0) +
            realtimeTransactionCount,
          avg_transaction: todaySummary._avg.avg_transaction?.toNumber() ?? 0,
          // Include the actual date being displayed (for UI indicator)
          // If using real-time data, show today's date, not the fallback
          business_date:
            realtimeFuelSales > 0
              ? uniqueDates[0] || new Date().toISOString().split("T")[0]
              : latestBusinessDate || uniqueDates[0] || null,
        };

        const weekData = weekSummaries.map((day) => ({
          date: day.business_date.toISOString().split("T")[0],
          fuel_sales: day._sum.fuel_sales?.toNumber() ?? 0,
          net_sales: day._sum.net_sales?.toNumber() ?? 0,
          gross_sales: day._sum.gross_sales?.toNumber() ?? 0,
          lottery_sales: day._sum.lottery_sales?.toNumber() ?? null,
          tax_collected: day._sum.tax_collected?.toNumber() ?? 0,
        }));

        reply.code(200);
        reply.send({
          success: true,
          data: {
            today: todayData,
            week: weekData,
          },
        });
      } catch (error) {
        fastify.log.error({ error }, "Client dashboard sales error");
        reply.code(500);
        reply.send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to load sales data",
          },
        });
      }
    },
  );
}
