/**
 * Query Optimizer Utilities
 *
 * Phase 7.2: Query Performance Tuning
 *
 * Enterprise coding standards applied:
 * - DB-001: ORM usage with Prisma
 * - DB-006: Tenant isolation through scope validation
 * - DB-008: Query logging for performance analysis
 *
 * Provides optimized query patterns for common data access patterns
 * in the shift/day summary system.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Date range query options
 */
export interface DateRangeOptions {
  from_date?: Date;
  to_date?: Date;
  include_boundaries?: boolean;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number;
  page_size?: number;
  cursor?: string;
}

/**
 * Query performance result
 */
export interface QueryPerformanceResult<T> {
  data: T;
  query_time_ms: number;
  row_count: number;
}

/**
 * Build optimized date range filter for Prisma
 *
 * Uses proper date boundaries to ensure index usage:
 * - from_date: >= start of day
 * - to_date: < start of next day
 *
 * @param field - The date field to filter on
 * @param options - Date range options
 * @returns Prisma where clause for date range
 */
export function buildDateRangeFilter(
  options: DateRangeOptions,
): Prisma.DateTimeFilter | undefined {
  if (!options.from_date && !options.to_date) {
    return undefined;
  }

  const filter: Prisma.DateTimeFilter = {};

  if (options.from_date) {
    // Normalize to start of day
    const fromDate = new Date(options.from_date);
    fromDate.setHours(0, 0, 0, 0);
    filter.gte = fromDate;
  }

  if (options.to_date) {
    // Normalize to end of day (or start of next day for exclusive)
    const toDate = new Date(options.to_date);
    if (options.include_boundaries !== false) {
      // Include the end date (up to 23:59:59.999)
      toDate.setHours(23, 59, 59, 999);
      filter.lte = toDate;
    } else {
      // Exclude the end date (less than start of that day)
      toDate.setHours(0, 0, 0, 0);
      filter.lt = toDate;
    }
  }

  return filter;
}

/**
 * Build optimized pagination parameters
 *
 * Uses cursor-based pagination for large datasets when cursor provided,
 * falls back to offset pagination for smaller datasets.
 *
 * @param options - Pagination options
 * @returns Prisma pagination parameters
 */
export function buildPaginationParams(options: PaginationOptions = {}): {
  skip?: number;
  take: number;
  cursor?: { [key: string]: string };
} {
  const page_size = Math.min(options.page_size || 50, 100); // Max 100 items per page

  if (options.cursor) {
    // Cursor-based pagination for large datasets
    return {
      take: page_size,
      skip: 1, // Skip the cursor item
      cursor: { id: options.cursor },
    };
  }

  // Offset-based pagination for smaller datasets
  const page = Math.max(options.page || 1, 1);
  return {
    skip: (page - 1) * page_size,
    take: page_size,
  };
}

/**
 * Execute a query with performance timing
 *
 * Wraps any Prisma query to measure execution time.
 * Useful for identifying slow queries in development.
 *
 * @param queryFn - The async query function to execute
 * @param queryName - Name for logging purposes
 * @returns Query result with performance metrics
 */
export async function withQueryTiming<T>(
  queryFn: () => Promise<T>,
  queryName: string,
): Promise<QueryPerformanceResult<T>> {
  const start = performance.now();

  try {
    const data = await queryFn();
    const query_time_ms = Math.round(performance.now() - start);

    // Log slow queries (> 100ms)
    if (query_time_ms > 100) {
      console.warn(
        `[SLOW QUERY] ${queryName}: ${query_time_ms}ms`,
        Array.isArray(data) ? `(${data.length} rows)` : "",
      );
    }

    return {
      data,
      query_time_ms,
      row_count: Array.isArray(data) ? data.length : 1,
    };
  } catch (error) {
    const query_time_ms = Math.round(performance.now() - start);
    console.error(`[QUERY ERROR] ${queryName}: ${query_time_ms}ms`, error);
    throw error;
  }
}

/**
 * Optimized batch query helper
 *
 * Executes multiple queries in parallel with proper batching
 * to avoid overwhelming the database connection pool.
 *
 * @param queries - Array of query functions
 * @param batchSize - Number of queries to run in parallel (default: 5)
 * @returns Array of query results in order
 */
export async function batchQueries<T>(
  queries: (() => Promise<T>)[],
  batchSize: number = 5,
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
  }

  return results;
}

/**
 * Optimized summary aggregation query
 *
 * Uses raw SQL with proper index hints for complex aggregations
 * that can't be efficiently expressed in Prisma ORM.
 *
 * @param storeId - Store ID for tenant isolation
 * @param fromDate - Start date for aggregation
 * @param toDate - End date for aggregation
 * @returns Aggregated summary data
 */
export async function getOptimizedPeriodSummary(
  storeId: string,
  fromDate: Date,
  toDate: Date,
): Promise<{
  day_count: number;
  shift_count: number;
  gross_sales: number;
  net_sales: number;
  tax_collected: number;
  transaction_count: number;
  total_cash_variance: number;
}> {
  const result = await prisma.$queryRaw<
    Array<{
      day_count: bigint;
      shift_count: bigint;
      gross_sales: Prisma.Decimal;
      net_sales: Prisma.Decimal;
      tax_collected: Prisma.Decimal;
      transaction_count: bigint;
      total_cash_variance: Prisma.Decimal;
    }>
  >`
    SELECT
      COUNT(DISTINCT business_date) as day_count,
      SUM(shift_count) as shift_count,
      COALESCE(SUM(gross_sales), 0) as gross_sales,
      COALESCE(SUM(net_sales), 0) as net_sales,
      COALESCE(SUM(tax_collected), 0) as tax_collected,
      COALESCE(SUM(transaction_count), 0) as transaction_count,
      COALESCE(SUM(total_cash_variance), 0) as total_cash_variance
    FROM day_summaries
    WHERE store_id = ${storeId}::uuid
      AND business_date >= ${fromDate}
      AND business_date <= ${toDate}
  `;

  const row = result[0];
  return {
    day_count: Number(row?.day_count || 0),
    shift_count: Number(row?.shift_count || 0),
    gross_sales: Number(row?.gross_sales || 0),
    net_sales: Number(row?.net_sales || 0),
    tax_collected: Number(row?.tax_collected || 0),
    transaction_count: Number(row?.transaction_count || 0),
    total_cash_variance: Number(row?.total_cash_variance || 0),
  };
}

/**
 * Optimized tender breakdown query
 *
 * Aggregates tender summaries across a date range with proper
 * index usage for the day_tender_summaries table.
 *
 * @param storeId - Store ID for tenant isolation
 * @param fromDate - Start date for aggregation
 * @param toDate - End date for aggregation
 * @returns Array of tender totals
 */
export async function getOptimizedTenderBreakdown(
  storeId: string,
  fromDate: Date,
  toDate: Date,
): Promise<
  Array<{
    tender_code: string;
    tender_display_name: string;
    total_amount: number;
    transaction_count: number;
    net_amount: number;
  }>
> {
  const result = await prisma.$queryRaw<
    Array<{
      tender_code: string;
      tender_display_name: string;
      total_amount: Prisma.Decimal;
      transaction_count: bigint;
      net_amount: Prisma.Decimal;
    }>
  >`
    SELECT
      dts.tender_code,
      dts.tender_display_name,
      COALESCE(SUM(dts.total_amount), 0) as total_amount,
      COALESCE(SUM(dts.transaction_count), 0) as transaction_count,
      COALESCE(SUM(dts.net_amount), 0) as net_amount
    FROM day_tender_summaries dts
    INNER JOIN day_summaries ds ON dts.day_summary_id = ds.day_summary_id
    WHERE ds.store_id = ${storeId}::uuid
      AND ds.business_date >= ${fromDate}
      AND ds.business_date <= ${toDate}
    GROUP BY dts.tender_code, dts.tender_display_name
    ORDER BY SUM(dts.total_amount) DESC
  `;

  return result.map((row) => ({
    tender_code: row.tender_code,
    tender_display_name: row.tender_display_name,
    total_amount: Number(row.total_amount),
    transaction_count: Number(row.transaction_count),
    net_amount: Number(row.net_amount),
  }));
}

/**
 * Optimized department breakdown query
 *
 * Aggregates department summaries across a date range with proper
 * index usage for the day_department_summaries table.
 *
 * @param storeId - Store ID for tenant isolation
 * @param fromDate - Start date for aggregation
 * @param toDate - End date for aggregation
 * @returns Array of department totals
 */
export async function getOptimizedDepartmentBreakdown(
  storeId: string,
  fromDate: Date,
  toDate: Date,
): Promise<
  Array<{
    department_code: string;
    department_name: string;
    gross_sales: number;
    net_sales: number;
    tax_collected: number;
    items_sold_count: number;
  }>
> {
  const result = await prisma.$queryRaw<
    Array<{
      department_code: string;
      department_name: string;
      gross_sales: Prisma.Decimal;
      net_sales: Prisma.Decimal;
      tax_collected: Prisma.Decimal;
      items_sold_count: bigint;
    }>
  >`
    SELECT
      dds.department_code,
      dds.department_name,
      COALESCE(SUM(dds.gross_sales), 0) as gross_sales,
      COALESCE(SUM(dds.net_sales), 0) as net_sales,
      COALESCE(SUM(dds.tax_collected), 0) as tax_collected,
      COALESCE(SUM(dds.items_sold_count), 0) as items_sold_count
    FROM day_department_summaries dds
    INNER JOIN day_summaries ds ON dds.day_summary_id = ds.day_summary_id
    WHERE ds.store_id = ${storeId}::uuid
      AND ds.business_date >= ${fromDate}
      AND ds.business_date <= ${toDate}
    GROUP BY dds.department_code, dds.department_name
    ORDER BY SUM(dds.net_sales) DESC
  `;

  return result.map((row) => ({
    department_code: row.department_code,
    department_name: row.department_name,
    gross_sales: Number(row.gross_sales),
    net_sales: Number(row.net_sales),
    tax_collected: Number(row.tax_collected),
    items_sold_count: Number(row.items_sold_count),
  }));
}

/**
 * Optimized hourly traffic query
 *
 * Aggregates hourly summaries across a date range for traffic analysis.
 *
 * @param storeId - Store ID for tenant isolation
 * @param fromDate - Start date for aggregation
 * @param toDate - End date for aggregation
 * @returns Array of hourly totals (0-23)
 */
export async function getOptimizedHourlyTraffic(
  storeId: string,
  fromDate: Date,
  toDate: Date,
): Promise<
  Array<{
    hour_number: number;
    transaction_count: number;
    net_sales: number;
    avg_transaction: number;
  }>
> {
  const result = await prisma.$queryRaw<
    Array<{
      hour_number: number;
      transaction_count: bigint;
      net_sales: Prisma.Decimal;
    }>
  >`
    SELECT
      dhs.hour_number,
      COALESCE(SUM(dhs.transaction_count), 0) as transaction_count,
      COALESCE(SUM(dhs.net_sales), 0) as net_sales
    FROM day_hourly_summaries dhs
    INNER JOIN day_summaries ds ON dhs.day_summary_id = ds.day_summary_id
    WHERE ds.store_id = ${storeId}::uuid
      AND ds.business_date >= ${fromDate}
      AND ds.business_date <= ${toDate}
    GROUP BY dhs.hour_number
    ORDER BY dhs.hour_number ASC
  `;

  return result.map((row) => {
    const transaction_count = Number(row.transaction_count);
    const net_sales = Number(row.net_sales);
    return {
      hour_number: row.hour_number,
      transaction_count,
      net_sales,
      avg_transaction:
        transaction_count > 0 ? net_sales / transaction_count : 0,
    };
  });
}

/**
 * Validate store scope for tenant isolation
 *
 * Ensures the user has access to the requested store before
 * executing a query. Throws if unauthorized.
 *
 * @param storeId - Store ID to validate
 * @param userStoreIds - Array of store IDs the user has access to
 * @throws Error if user doesn't have access to the store
 */
export function validateStoreScope(
  storeId: string,
  userStoreIds: string[],
): void {
  if (!userStoreIds.includes(storeId)) {
    throw new Error("Access denied: User does not have access to this store");
  }
}

/**
 * Validate date range for query optimization
 *
 * Ensures the date range is reasonable to prevent
 * expensive full-table scans.
 *
 * @param fromDate - Start date
 * @param toDate - End date
 * @param maxDays - Maximum allowed days in range (default: 365)
 * @throws Error if date range exceeds maximum
 */
export function validateDateRange(
  fromDate: Date,
  toDate: Date,
  maxDays: number = 365,
): void {
  const diffMs = toDate.getTime() - fromDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > maxDays) {
    throw new Error(
      `Date range too large: ${diffDays} days exceeds maximum of ${maxDays} days`,
    );
  }

  if (diffDays < 0) {
    throw new Error("Invalid date range: from_date must be before to_date");
  }
}
