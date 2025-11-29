/**
 * Integration Tests: Timezone-Aware Shift Management
 *
 * Tests end-to-end scenarios for shift management with timezone handling:
 * - Cross-midnight shifts
 * - Business day calculation
 * - Transaction assignment to shifts
 * - DST transitions
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createDateInTimezone,
  createCrossMidnightShift,
  createDSTFallBackShift,
  createDSTSpringForwardShift,
  TEST_TIMEZONES,
} from "../support/helpers/timezone-helpers";
import {
  createStore,
  createShift,
  createTransaction,
  createCompany,
} from "../support/helpers";

// TODO: Re-enable when shift transaction, daily reports, and shift close endpoints are implemented
// These tests require endpoints that don't exist yet:
// - GET /api/shifts/:shiftId/transactions
// - GET /api/reports/daily/:storeId
// - POST /api/shifts/:shiftId/close
test.describe.skip("Timezone-Aware Shift Management", () => {
  test.describe("Cross-Midnight Shift Assignment", () => {
    test("should assign transactions to correct shift across midnight", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // Create company for superadmin
      const company = await createCompany(prismaClient);
      // Create store in Denver timezone
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Denver Store",
        timezone: TEST_TIMEZONES.DENVER,
      });

      // Create night shift: 10 PM Monday - 6 AM Tuesday
      const shift = await createShift({
        store_id: store.store_id,
        start_time: createDateInTimezone(
          "2025-11-25 22:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        end_time: createDateInTimezone(
          "2025-11-26 06:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        status: "OPEN",
      });

      // Create transactions at different times during shift
      const tx1 = await createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        timestamp: createDateInTimezone(
          "2025-11-25 22:30:00",
          TEST_TIMEZONES.DENVER,
        ), // 10:30 PM Mon
        total_amount: 10.0,
      });

      const tx2 = await createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        timestamp: createDateInTimezone(
          "2025-11-26 00:30:00",
          TEST_TIMEZONES.DENVER,
        ), // 12:30 AM Tue
        total_amount: 20.0,
      });

      const tx3 = await createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        timestamp: createDateInTimezone(
          "2025-11-26 05:30:00",
          TEST_TIMEZONES.DENVER,
        ), // 5:30 AM Tue
        total_amount: 30.0,
      });

      // Query shift transactions via API
      const response = await superadminApiRequest.get(
        `/api/shifts/${shift.shift_id}/transactions`,
      );
      const data = await response.json();

      // All three transactions should be in this shift
      expect(data.transactions).toHaveLength(3);
      expect(data.transactions.map((t: any) => t.transaction_id)).toEqual(
        expect.arrayContaining([
          tx1.transaction_id,
          tx2.transaction_id,
          tx3.transaction_id,
        ]),
      );
    });

    test("should exclude transactions outside shift boundaries", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        timezone: TEST_TIMEZONES.DENVER,
      });

      const shift = await createShift({
        store_id: store.store_id,
        start_time: createDateInTimezone(
          "2025-11-25 22:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        end_time: createDateInTimezone(
          "2025-11-26 06:00:00",
          TEST_TIMEZONES.DENVER,
        ),
      });

      // Transaction before shift (create a dummy shift for transactions outside shift boundaries)
      const dummyShiftBefore = await createShift({
        store_id: store.store_id,
        start_time: createDateInTimezone(
          "2025-11-25 20:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        end_time: createDateInTimezone(
          "2025-11-25 21:00:00",
          TEST_TIMEZONES.DENVER,
        ),
      });
      const txBefore = await createTransaction({
        store_id: store.store_id,
        shift_id: dummyShiftBefore.shift_id,
        timestamp: createDateInTimezone(
          "2025-11-25 21:30:00",
          TEST_TIMEZONES.DENVER,
        ),
        total_amount: 10.0,
      });

      // Transaction after shift (create a dummy shift for transactions outside shift boundaries)
      const dummyShiftAfter = await createShift({
        store_id: store.store_id,
        start_time: createDateInTimezone(
          "2025-11-26 07:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        end_time: createDateInTimezone(
          "2025-11-26 08:00:00",
          TEST_TIMEZONES.DENVER,
        ),
      });
      const txAfter = await createTransaction({
        store_id: store.store_id,
        shift_id: dummyShiftAfter.shift_id,
        timestamp: createDateInTimezone(
          "2025-11-26 06:30:00",
          TEST_TIMEZONES.DENVER,
        ),
        total_amount: 20.0,
      });

      // Query shift transactions
      const response = await superadminApiRequest.get(
        `/api/shifts/${shift.shift_id}/transactions`,
      );
      const data = await response.json();

      // Should NOT include transactions outside shift
      expect(data.transactions.map((t: any) => t.transaction_id)).not.toContain(
        txBefore.transaction_id,
      );
      expect(data.transactions.map((t: any) => t.transaction_id)).not.toContain(
        txAfter.transaction_id,
      );
    });
  });

  test.describe("Business Day Calculation", () => {
    test("should report night shift on correct business day", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        timezone: TEST_TIMEZONES.DENVER,
      });

      // Night shift: 10 PM Monday - 6 AM Tuesday
      const shift = await createShift({
        store_id: store.store_id,
        start_time: createDateInTimezone(
          "2025-11-25 22:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        end_time: createDateInTimezone(
          "2025-11-26 06:00:00",
          TEST_TIMEZONES.DENVER,
        ),
      });

      // Create transactions during shift
      await createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        timestamp: createDateInTimezone(
          "2025-11-26 00:30:00",
          TEST_TIMEZONES.DENVER,
        ),
        total_amount: 50.0,
      });

      // Query Monday's business day report
      const response = await superadminApiRequest.get(
        `/api/reports/daily/${store.store_id}?date=2025-11-25`,
      );
      const report = await response.json();

      // Shift should appear in Monday's report
      expect(report.shifts).toContainEqual(
        expect.objectContaining({
          shift_id: shift.shift_id,
        }),
      );

      // Transaction at 12:30 AM Tuesday should appear in Monday's report
      expect(report.transactions).toContainEqual(
        expect.objectContaining({
          timestamp: expect.any(String),
        }),
      );
      expect(report.total_sales).toBe(50.0);
    });

    test("should not include shift in next business day", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        timezone: TEST_TIMEZONES.DENVER,
      });

      // Night shift belongs to Monday
      const shift = await createShift({
        store_id: store.store_id,
        start_time: createDateInTimezone(
          "2025-11-25 22:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        end_time: createDateInTimezone(
          "2025-11-26 06:00:00",
          TEST_TIMEZONES.DENVER,
        ),
      });

      // Query Tuesday's business day report
      const response = await superadminApiRequest.get(
        `/api/reports/daily/${store.store_id}?date=2025-11-26`,
      );
      const report = await response.json();

      // Shift should NOT appear in Tuesday's report
      expect(report.shifts.map((s: any) => s.shift_id)).not.toContain(
        shift.shift_id,
      );
    });
  });

  test.describe("DST Transition Handling", () => {
    test("should calculate correct duration for DST fall back shift", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        timezone: TEST_TIMEZONES.DENVER,
      });

      // DST ends Nov 3, 2024 at 2 AM (falls back to 1 AM)
      const shift = await createShift({
        store_id: store.store_id,
        start_time: createDateInTimezone(
          "2024-11-02 22:00:00",
          TEST_TIMEZONES.DENVER,
        ), // 10 PM Sat
        end_time: createDateInTimezone(
          "2024-11-03 06:00:00",
          TEST_TIMEZONES.DENVER,
        ), // 6 AM Sun
      });

      // Query shift details
      const response = await superadminApiRequest.get(
        `/api/shifts/${shift.shift_id}`,
      );
      const data = await response.json();

      // Shift duration should be 9 hours (not 8) due to fall back
      expect(data.duration_hours).toBe(9);
    });

    test("should calculate correct duration for DST spring forward shift", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        timezone: TEST_TIMEZONES.DENVER,
      });

      // DST begins Mar 10, 2024 at 2 AM (springs forward to 3 AM)
      const shift = await createShift({
        store_id: store.store_id,
        start_time: createDateInTimezone(
          "2024-03-09 22:00:00",
          TEST_TIMEZONES.DENVER,
        ), // 10 PM Sat
        end_time: createDateInTimezone(
          "2024-03-10 06:00:00",
          TEST_TIMEZONES.DENVER,
        ), // 6 AM Sun
      });

      const response = await superadminApiRequest.get(
        `/api/shifts/${shift.shift_id}`,
      );
      const data = await response.json();

      // Shift duration should be 7 hours (not 8) due to spring forward
      expect(data.duration_hours).toBe(7);
    });

    test("should not trigger false cash variance during DST transition", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        timezone: TEST_TIMEZONES.DENVER,
      });

      // Shift during DST fall back
      const shift = await createShift({
        store_id: store.store_id,
        start_time: createDateInTimezone(
          "2024-11-02 22:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        end_time: createDateInTimezone(
          "2024-11-03 06:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        opening_amount: 100.0,
      });

      // Add transactions totaling $200
      await createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        timestamp: createDateInTimezone(
          "2024-11-03 01:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        total_amount: 100.0,
      });

      await createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        timestamp: createDateInTimezone(
          "2024-11-03 04:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        total_amount: 100.0,
      });

      // Close shift with correct cash
      const closeResponse = await superadminApiRequest.post(
        `/api/shifts/${shift.shift_id}/close`,
        {
          data: {
            closing_cash: 300.0, // opening + sales
          },
        },
      );

      const closeData = await closeResponse.json();

      // Should NOT detect variance despite 9-hour shift
      expect(closeData.variance_detected).toBe(false);
      expect(closeData.cash_variance).toBe(0);
    });
  });

  test.describe("Multi-Timezone Stores", () => {
    test("should handle multiple stores in different timezones correctly", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      const company = await createCompany(prismaClient);
      // Create stores in different timezones
      const denverStore = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Denver Store",
        timezone: TEST_TIMEZONES.DENVER,
      });

      const tokyoStore = await createStore(prismaClient, {
        company_id: company.company_id,
        name: "Tokyo Store",
        timezone: TEST_TIMEZONES.TOKYO,
      });

      // Create shifts at "10 PM local time" for each store
      const denverShift = await createShift({
        store_id: denverStore.store_id,
        start_time: createDateInTimezone(
          "2025-11-25 22:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        end_time: createDateInTimezone(
          "2025-11-26 06:00:00",
          TEST_TIMEZONES.DENVER,
        ),
      });

      const tokyoShift = await createShift({
        store_id: tokyoStore.store_id,
        start_time: createDateInTimezone(
          "2025-11-25 22:00:00",
          TEST_TIMEZONES.TOKYO,
        ),
        end_time: createDateInTimezone(
          "2025-11-26 06:00:00",
          TEST_TIMEZONES.TOKYO,
        ),
      });

      // Both shifts should be 8 hours
      const denverResponse = await superadminApiRequest.get(
        `/api/shifts/${denverShift.shift_id}`,
      );
      const tokyoResponse = await superadminApiRequest.get(
        `/api/shifts/${tokyoShift.shift_id}`,
      );

      const denverData = await denverResponse.json();
      const tokyoData = await tokyoResponse.json();

      expect(denverData.duration_hours).toBe(8);
      expect(tokyoData.duration_hours).toBe(8);

      // Both should appear on Nov 25 business day report for their respective stores
      const denverReport = await superadminApiRequest.get(
        `/api/reports/daily/${denverStore.store_id}?date=2025-11-25`,
      );
      const tokyoReport = await superadminApiRequest.get(
        `/api/reports/daily/${tokyoStore.store_id}?date=2025-11-25`,
      );

      const denverReportData = await denverReport.json();
      const tokyoReportData = await tokyoReport.json();

      expect(denverReportData.shifts).toContainEqual(
        expect.objectContaining({ shift_id: denverShift.shift_id }),
      );
      expect(tokyoReportData.shifts).toContainEqual(
        expect.objectContaining({ shift_id: tokyoShift.shift_id }),
      );
    });
  });

  test.describe("Hourly Trends in Store Timezone", () => {
    test("should aggregate transactions by hour in store timezone", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
        timezone: TEST_TIMEZONES.DENVER,
      });

      // Create a shift for the transactions
      const shift = await createShift({
        store_id: store.store_id,
        start_time: createDateInTimezone(
          "2025-11-25 19:00:00",
          TEST_TIMEZONES.DENVER,
        ),
        end_time: createDateInTimezone(
          "2025-11-25 22:00:00",
          TEST_TIMEZONES.DENVER,
        ),
      });

      // Create transactions at different hours (Denver time)
      await createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        timestamp: createDateInTimezone(
          "2025-11-25 20:00:00",
          TEST_TIMEZONES.DENVER,
        ), // 8 PM
        total_amount: 100.0,
      });

      await createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        timestamp: createDateInTimezone(
          "2025-11-25 20:30:00",
          TEST_TIMEZONES.DENVER,
        ), // 8:30 PM
        total_amount: 50.0,
      });

      await createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        timestamp: createDateInTimezone(
          "2025-11-25 21:00:00",
          TEST_TIMEZONES.DENVER,
        ), // 9 PM
        total_amount: 75.0,
      });

      // Query hourly trends
      const response = await superadminApiRequest.get(
        `/api/reports/daily/${store.store_id}?date=2025-11-25`,
      );
      const report = await response.json();

      // Should show sales at 8 PM hour (not 3 AM UTC)
      const hour20 = report.hourly_trends.find((h: any) => h.hour === 20);
      expect(hour20).toBeDefined();
      expect(hour20.total_sales).toBe(150.0); // $100 + $50
      expect(hour20.transaction_count).toBe(2);

      // Should show sales at 9 PM hour
      const hour21 = report.hourly_trends.find((h: any) => h.hour === 21);
      expect(hour21).toBeDefined();
      expect(hour21.total_sales).toBe(75.0);
      expect(hour21.transaction_count).toBe(1);
    });
  });
});
