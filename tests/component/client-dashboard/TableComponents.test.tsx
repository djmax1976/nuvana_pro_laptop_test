/**
 * @test-level Component
 * @justification Tests for dashboard table and feed components
 * @story Client Owner Dashboard - Tables and Activity Feed
 *
 * Table Components Tests
 *
 * CRITICAL TEST COVERAGE:
 * - RecentTransactionsTable: rendering, payment types, empty state
 * - RecentActivityFeed: activity items, avatars, empty state
 * - LotteryPacksTable: progress bars, status badges, empty state
 * - ShiftHistoryTable: variance indicators, status, empty state
 * - Accessibility (ARIA, roles, semantic HTML)
 * - Security (XSS prevention)
 *
 * Requirements Traceability Matrix:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Test ID                    │ Requirement         │ Priority    │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ TXN-001                    │ Render transactions │ P0          │
 * │ TXN-002                    │ Payment type badges │ P0          │
 * │ TXN-003                    │ Empty state         │ P1          │
 * │ TXN-004                    │ View all action     │ P0          │
 * │ ACT-001                    │ Render activities   │ P0          │
 * │ ACT-002                    │ Activity avatars    │ P1          │
 * │ ACT-003                    │ Empty state         │ P1          │
 * │ LOT-001                    │ Render lottery packs│ P0          │
 * │ LOT-002                    │ Progress bars       │ P0          │
 * │ LOT-003                    │ Status badges       │ P0          │
 * │ LOT-004                    │ Empty state         │ P1          │
 * │ SHIFT-001                  │ Render shift history│ P0          │
 * │ SHIFT-002                  │ Variance indicators │ P0          │
 * │ SHIFT-003                  │ Status badges       │ P0          │
 * │ SHIFT-004                  │ Empty state         │ P1          │
 * │ A11Y-001                   │ ARIA attributes     │ P0          │
 * │ SEC-001                    │ XSS prevention      │ P0          │
 * └─────────────────────────────────────────────────────────────────┘
 */

import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import {
  RecentTransactionsTable,
  RecentTransactionsTableSkeleton,
  type Transaction,
} from "@/components/client-dashboard/recent-transactions-table";
import {
  RecentActivityFeed,
  RecentActivityFeedSkeleton,
  type ActivityItem,
} from "@/components/client-dashboard/recent-activity-feed";
import {
  LotteryPacksTable,
  LotteryPacksTableSkeleton,
  type LotteryPack,
} from "@/components/client-dashboard/lottery-packs-table";
import {
  ShiftHistoryTable,
  ShiftHistoryTableSkeleton,
  type Shift,
} from "@/components/client-dashboard/shift-history-table";

// ============================================
// RECENT TRANSACTIONS TABLE TESTS
// ============================================
describe("CLIENT-DASHBOARD: RecentTransactionsTable Component", () => {
  describe("Rendering", () => {
    it("[P0] TXN-001: should render title and default transactions", () => {
      // GIVEN: RecentTransactionsTable
      renderWithProviders(<RecentTransactionsTable />);

      // THEN: Title is displayed
      expect(screen.getByText("Recent Transactions")).toBeInTheDocument();

      // AND: Default transactions are rendered
      expect(screen.getByText("TXN-8847291")).toBeInTheDocument();
      expect(screen.getByText("$47.85")).toBeInTheDocument();
    });

    it("[P0] TXN-001b: should render custom transactions", () => {
      // GIVEN: Custom transactions
      const transactions: Transaction[] = [
        { id: "CUSTOM-001", type: "cash", time: "1:00 PM", amount: 100.0 },
      ];

      renderWithProviders(
        <RecentTransactionsTable transactions={transactions} />,
      );

      // THEN: Custom transaction is displayed
      expect(screen.getByText("CUSTOM-001")).toBeInTheDocument();
      expect(screen.getByText("$100.00")).toBeInTheDocument();
    });

    it("[P0] TXN-002: should render payment type badges", () => {
      // GIVEN: Transactions with different payment types
      const transactions: Transaction[] = [
        { id: "T1", type: "credit", time: "1:00 PM", amount: 10 },
        { id: "T2", type: "cash", time: "1:05 PM", amount: 20 },
        { id: "T3", type: "debit", time: "1:10 PM", amount: 30 },
        { id: "T4", type: "ebt", time: "1:15 PM", amount: 40 },
      ];

      renderWithProviders(
        <RecentTransactionsTable transactions={transactions} />,
      );

      // THEN: All payment type badges are displayed
      expect(screen.getByText("Credit")).toBeInTheDocument();
      expect(screen.getByText("Cash")).toBeInTheDocument();
      expect(screen.getByText("Debit")).toBeInTheDocument();
      expect(screen.getByText("EBT")).toBeInTheDocument();
    });

    it("[P1] TXN-003: should render empty state", () => {
      // GIVEN: Empty transactions
      renderWithProviders(<RecentTransactionsTable transactions={[]} />);

      // THEN: Empty state message is displayed
      expect(screen.getByText("No transactions found")).toBeInTheDocument();
    });
  });

  describe("Actions", () => {
    it("[P0] TXN-004: should call onViewAll when button clicked", async () => {
      // GIVEN: Callback handler
      const onViewAll = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<RecentTransactionsTable onViewAll={onViewAll} />);

      // WHEN: User clicks View All button
      await user.click(screen.getByTestId("view-all-transactions"));

      // THEN: Callback is invoked
      expect(onViewAll).toHaveBeenCalledOnce();
    });
  });

  describe("Accessibility", () => {
    it("[P0] A11Y-001a: should have correct ARIA attributes", () => {
      // GIVEN: RecentTransactionsTable
      renderWithProviders(<RecentTransactionsTable />);

      // THEN: Card has proper ARIA attributes
      const card = screen.getByTestId("recent-transactions-card");
      expect(card).toHaveAttribute("role", "region");
      expect(card).toHaveAttribute(
        "aria-labelledby",
        "recent-transactions-title",
      );
    });
  });

  describe("Skeleton", () => {
    it("[P1] TXN-005: should render loading skeleton", () => {
      // GIVEN: RecentTransactionsTableSkeleton
      renderWithProviders(<RecentTransactionsTableSkeleton />);

      // THEN: Skeleton has animation class
      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });
});

// ============================================
// RECENT ACTIVITY FEED TESTS
// ============================================
describe("CLIENT-DASHBOARD: RecentActivityFeed Component", () => {
  describe("Rendering", () => {
    it("[P0] ACT-001: should render title and default activities", () => {
      // GIVEN: RecentActivityFeed
      renderWithProviders(<RecentActivityFeed />);

      // THEN: Title is displayed
      expect(screen.getByText("Recent Activity")).toBeInTheDocument();

      // AND: Default activities are rendered
      expect(
        screen.getByText("John Davis closed Shift #445"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Sarah Miller opened current shift"),
      ).toBeInTheDocument();
    });

    it("[P0] ACT-001b: should render custom activities", () => {
      // GIVEN: Custom activities
      const activities: ActivityItem[] = [
        {
          id: "1",
          type: "lottery",
          initials: "TC",
          title: "Test activity",
          time: "5 minutes ago",
          meta: "$50.00",
        },
      ];

      renderWithProviders(<RecentActivityFeed activities={activities} />);

      // THEN: Custom activity is displayed
      expect(screen.getByText("Test activity")).toBeInTheDocument();
      expect(screen.getByText("$50.00")).toBeInTheDocument();
    });

    it("[P1] ACT-002: should render activity avatars with initials", () => {
      // GIVEN: Activities with initials
      const activities: ActivityItem[] = [
        {
          id: "1",
          type: "shift-open",
          initials: "AB",
          title: "Test",
          time: "now",
        },
      ];

      renderWithProviders(<RecentActivityFeed activities={activities} />);

      // THEN: Avatar with initials is displayed
      expect(screen.getByText("AB")).toBeInTheDocument();
    });

    it("[P1] ACT-003: should render empty state", () => {
      // GIVEN: Empty activities
      renderWithProviders(<RecentActivityFeed activities={[]} />);

      // THEN: Empty state message is displayed
      expect(screen.getByText("No recent activity")).toBeInTheDocument();
    });

    it("[P1] ACT-004: should render custom time label", () => {
      // GIVEN: Custom time label
      renderWithProviders(<RecentActivityFeed timeLabel="Last 24 hours" />);

      // THEN: Custom time label is displayed
      expect(screen.getByText("Last 24 hours")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("[P0] A11Y-001b: should have correct ARIA attributes", () => {
      // GIVEN: RecentActivityFeed
      renderWithProviders(<RecentActivityFeed />);

      // THEN: Card has proper ARIA attributes
      const card = screen.getByTestId("recent-activity-card");
      expect(card).toHaveAttribute("role", "region");
      expect(card).toHaveAttribute("aria-labelledby", "recent-activity-title");

      // AND: Activity list has proper semantics
      expect(
        screen.getByRole("list", { name: "Recent activities" }),
      ).toBeInTheDocument();
    });
  });

  describe("Skeleton", () => {
    it("[P1] ACT-005: should render loading skeleton", () => {
      // GIVEN: RecentActivityFeedSkeleton
      renderWithProviders(<RecentActivityFeedSkeleton />);

      // THEN: Skeleton has animation class
      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });
});

// ============================================
// LOTTERY PACKS TABLE TESTS
// ============================================
describe("CLIENT-DASHBOARD: LotteryPacksTable Component", () => {
  describe("Rendering", () => {
    it("[P0] LOT-001: should render title and default packs", () => {
      // GIVEN: LotteryPacksTable
      renderWithProviders(<LotteryPacksTable />);

      // THEN: Title is displayed
      expect(screen.getByText("Active Lottery Packs")).toBeInTheDocument();

      // AND: Default packs are rendered
      expect(screen.getByText("PKG-004821")).toBeInTheDocument();
      expect(screen.getByText("Lucky 7s")).toBeInTheDocument();
    });

    it("[P0] LOT-001b: should render custom packs", () => {
      // GIVEN: Custom packs
      const packs: LotteryPack[] = [
        {
          id: "1",
          packNumber: "CUSTOM-001",
          game: "Test Game",
          price: 5,
          binLocation: "Bin Z-1",
          remaining: 50,
          total: 100,
          status: "active",
        },
      ];

      renderWithProviders(<LotteryPacksTable packs={packs} />);

      // THEN: Custom pack is displayed
      expect(screen.getByText("CUSTOM-001")).toBeInTheDocument();
      expect(screen.getByText("Test Game")).toBeInTheDocument();
      expect(screen.getByText("Bin Z-1")).toBeInTheDocument();
    });

    it("[P0] LOT-002: should render progress bars with remaining counts", () => {
      // GIVEN: Pack with specific remaining/total
      const packs: LotteryPack[] = [
        {
          id: "1",
          packNumber: "PKG-001",
          game: "Game",
          price: 1,
          binLocation: "Bin A",
          remaining: 75,
          total: 100,
          status: "active",
        },
      ];

      renderWithProviders(<LotteryPacksTable packs={packs} />);

      // THEN: Remaining count is displayed
      expect(screen.getByText("75/100")).toBeInTheDocument();

      // AND: Progress bar has aria-label
      expect(screen.getByLabelText("75% remaining")).toBeInTheDocument();
    });

    it("[P0] LOT-003: should render status badges", () => {
      // GIVEN: Packs with different statuses
      const packs: LotteryPack[] = [
        {
          id: "1",
          packNumber: "P1",
          game: "G1",
          price: 1,
          binLocation: "B1",
          remaining: 50,
          total: 100,
          status: "active",
        },
        {
          id: "2",
          packNumber: "P2",
          game: "G2",
          price: 2,
          binLocation: "B2",
          remaining: 10,
          total: 100,
          status: "low-stock",
        },
        {
          id: "3",
          packNumber: "P3",
          game: "G3",
          price: 3,
          binLocation: "B3",
          remaining: 2,
          total: 100,
          status: "critical",
        },
      ];

      renderWithProviders(<LotteryPacksTable packs={packs} />);

      // THEN: All status badges are displayed
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Low Stock")).toBeInTheDocument();
      expect(screen.getByText("Critical")).toBeInTheDocument();
    });

    it("[P1] LOT-004: should render empty state", () => {
      // GIVEN: Empty packs
      renderWithProviders(<LotteryPacksTable packs={[]} />);

      // THEN: Empty state message is displayed
      expect(
        screen.getByText("No active lottery packs found"),
      ).toBeInTheDocument();
    });
  });

  describe("Actions", () => {
    it("[P0] LOT-005: should call onViewAll when button clicked", async () => {
      // GIVEN: Callback handler
      const onViewAll = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<LotteryPacksTable onViewAll={onViewAll} />);

      // WHEN: User clicks View All Packs button
      await user.click(screen.getByTestId("view-all-packs"));

      // THEN: Callback is invoked
      expect(onViewAll).toHaveBeenCalledOnce();
    });
  });

  describe("Accessibility", () => {
    it("[P0] A11Y-001c: should have correct ARIA attributes", () => {
      // GIVEN: LotteryPacksTable
      renderWithProviders(<LotteryPacksTable />);

      // THEN: Card has proper ARIA attributes
      const card = screen.getByTestId("lottery-packs-card");
      expect(card).toHaveAttribute("role", "region");
      expect(card).toHaveAttribute("aria-labelledby", "lottery-packs-title");
    });
  });

  describe("Skeleton", () => {
    it("[P1] LOT-006: should render loading skeleton", () => {
      // GIVEN: LotteryPacksTableSkeleton
      renderWithProviders(<LotteryPacksTableSkeleton />);

      // THEN: Skeleton has animation class
      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });
});

// ============================================
// SHIFT HISTORY TABLE TESTS
// ============================================
describe("CLIENT-DASHBOARD: ShiftHistoryTable Component", () => {
  describe("Rendering", () => {
    it("[P0] SHIFT-001: should render title and default shifts", () => {
      // GIVEN: ShiftHistoryTable
      renderWithProviders(<ShiftHistoryTable />);

      // THEN: Title is displayed
      expect(screen.getByText("Recent Shift History")).toBeInTheDocument();

      // AND: Default shifts are rendered
      expect(screen.getByText("SFT-000446")).toBeInTheDocument();
      expect(screen.getByText("Sarah Miller")).toBeInTheDocument();
    });

    it("[P0] SHIFT-001b: should render custom shifts", () => {
      // GIVEN: Custom shifts
      const shifts: Shift[] = [
        {
          id: "1",
          shiftId: "CUSTOM-SHIFT-001",
          cashier: "Test Cashier",
          time: "9:00 AM - 5:00 PM",
          totalSales: 5000,
          transactions: 200,
          cashVariance: { value: "$0.00", status: "ok" },
          lotteryVariance: { value: "0", status: "ok" },
          status: "closed",
        },
      ];

      renderWithProviders(<ShiftHistoryTable shifts={shifts} />);

      // THEN: Custom shift is displayed
      expect(screen.getByText("CUSTOM-SHIFT-001")).toBeInTheDocument();
      expect(screen.getByText("Test Cashier")).toBeInTheDocument();
      expect(screen.getByText("$5,000.00")).toBeInTheDocument();
    });

    it("[P0] SHIFT-002: should render variance indicators", () => {
      // GIVEN: Shifts with different variance statuses
      const shifts: Shift[] = [
        {
          id: "1",
          shiftId: "S1",
          cashier: "C1",
          time: "T1",
          totalSales: 1000,
          transactions: 50,
          cashVariance: { value: "$0.00", status: "ok" },
          lotteryVariance: { value: "0", status: "ok" },
          status: "closed",
        },
        {
          id: "2",
          shiftId: "S2",
          cashier: "C2",
          time: "T2",
          totalSales: 2000,
          transactions: 100,
          cashVariance: { value: "-$5.00", status: "warning" },
          lotteryVariance: { value: "-1", status: "warning" },
          status: "review",
        },
        {
          id: "3",
          shiftId: "S3",
          cashier: "C3",
          time: "T3",
          totalSales: 3000,
          transactions: 150,
          cashVariance: { value: "-$20.00", status: "critical" },
          lotteryVariance: { value: "-5", status: "critical" },
          status: "flagged",
        },
      ];

      renderWithProviders(<ShiftHistoryTable shifts={shifts} />);

      // THEN: All variance values are displayed
      expect(screen.getByText("$0.00")).toBeInTheDocument();
      expect(screen.getByText("-$5.00")).toBeInTheDocument();
      expect(screen.getByText("-$20.00")).toBeInTheDocument();
    });

    it("[P0] SHIFT-003: should render status badges", () => {
      // GIVEN: Shifts with different statuses
      const shifts: Shift[] = [
        {
          id: "1",
          shiftId: "S1",
          cashier: "C1",
          time: "T1",
          totalSales: 100,
          transactions: 10,
          cashVariance: { value: "$0", status: "ok" },
          lotteryVariance: { value: "0", status: "ok" },
          status: "active",
        },
        {
          id: "2",
          shiftId: "S2",
          cashier: "C2",
          time: "T2",
          totalSales: 200,
          transactions: 20,
          cashVariance: { value: "$0", status: "ok" },
          lotteryVariance: { value: "0", status: "ok" },
          status: "closed",
        },
        {
          id: "3",
          shiftId: "S3",
          cashier: "C3",
          time: "T3",
          totalSales: 300,
          transactions: 30,
          cashVariance: { value: "$0", status: "ok" },
          lotteryVariance: { value: "0", status: "ok" },
          status: "review",
        },
        {
          id: "4",
          shiftId: "S4",
          cashier: "C4",
          time: "T4",
          totalSales: 400,
          transactions: 40,
          cashVariance: { value: "$0", status: "ok" },
          lotteryVariance: { value: "0", status: "ok" },
          status: "flagged",
        },
      ];

      renderWithProviders(<ShiftHistoryTable shifts={shifts} />);

      // THEN: All status badges are displayed
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Closed")).toBeInTheDocument();
      expect(screen.getByText("Review")).toBeInTheDocument();
      expect(screen.getByText("Flagged")).toBeInTheDocument();
    });

    it("[P1] SHIFT-004: should render empty state", () => {
      // GIVEN: Empty shifts
      renderWithProviders(<ShiftHistoryTable shifts={[]} />);

      // THEN: Empty state message is displayed
      expect(screen.getByText("No shift history found")).toBeInTheDocument();
    });
  });

  describe("Actions", () => {
    it("[P0] SHIFT-005: should call onViewAll when button clicked", async () => {
      // GIVEN: Callback handler
      const onViewAll = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<ShiftHistoryTable onViewAll={onViewAll} />);

      // WHEN: User clicks View All Shifts button
      await user.click(screen.getByTestId("view-all-shifts"));

      // THEN: Callback is invoked
      expect(onViewAll).toHaveBeenCalledOnce();
    });
  });

  describe("Accessibility", () => {
    it("[P0] A11Y-001d: should have correct ARIA attributes", () => {
      // GIVEN: ShiftHistoryTable
      renderWithProviders(<ShiftHistoryTable />);

      // THEN: Card has proper ARIA attributes
      const card = screen.getByTestId("shift-history-card");
      expect(card).toHaveAttribute("role", "region");
      expect(card).toHaveAttribute("aria-labelledby", "shift-history-title");
    });
  });

  describe("Skeleton", () => {
    it("[P1] SHIFT-006: should render loading skeleton", () => {
      // GIVEN: ShiftHistoryTableSkeleton
      renderWithProviders(<ShiftHistoryTableSkeleton />);

      // THEN: Skeleton has animation class
      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });
});

// ============================================
// SECURITY TESTS (Cross-component)
// ============================================
describe("CLIENT-DASHBOARD: Table Components Security", () => {
  it("[P0] SEC-001a: RecentTransactionsTable should escape XSS in transaction ID", () => {
    // GIVEN: Transaction with malicious ID
    const transactions: Transaction[] = [
      {
        id: '<script>alert("xss")</script>',
        type: "cash",
        time: "1:00 PM",
        amount: 50,
      },
    ];

    renderWithProviders(
      <RecentTransactionsTable transactions={transactions} />,
    );

    // THEN: Script is rendered as text, not executed
    expect(
      screen.getByText('<script>alert("xss")</script>'),
    ).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("[P0] SEC-001b: RecentActivityFeed should escape XSS in title", () => {
    // GIVEN: Activity with malicious title
    const activities: ActivityItem[] = [
      {
        id: "1",
        type: "lottery",
        initials: "XS",
        title: '<img src="x" onerror="alert(1)">',
        time: "now",
      },
    ];

    renderWithProviders(<RecentActivityFeed activities={activities} />);

    // THEN: Image tag is rendered as text
    expect(
      screen.getByText('<img src="x" onerror="alert(1)">'),
    ).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("[P0] SEC-001c: LotteryPacksTable should escape XSS in game name", () => {
    // GIVEN: Pack with malicious game name
    const packs: LotteryPack[] = [
      {
        id: "1",
        packNumber: "PKG-001",
        game: "<script>document.cookie</script>",
        price: 1,
        binLocation: "Bin A",
        remaining: 50,
        total: 100,
        status: "active",
      },
    ];

    renderWithProviders(<LotteryPacksTable packs={packs} />);

    // THEN: Script is rendered as text
    expect(
      screen.getByText("<script>document.cookie</script>"),
    ).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("[P0] SEC-001d: ShiftHistoryTable should escape XSS in cashier name", () => {
    // GIVEN: Shift with malicious cashier name
    const shifts: Shift[] = [
      {
        id: "1",
        shiftId: "S1",
        cashier: '<a href="javascript:void(0)" onclick="alert(1)">Click</a>',
        time: "T1",
        totalSales: 100,
        transactions: 10,
        cashVariance: { value: "$0", status: "ok" },
        lotteryVariance: { value: "0", status: "ok" },
        status: "closed",
      },
    ];

    renderWithProviders(<ShiftHistoryTable shifts={shifts} />);

    // THEN: Anchor tag is rendered as text
    expect(
      screen.getByText(
        '<a href="javascript:void(0)" onclick="alert(1)">Click</a>',
      ),
    ).toBeInTheDocument();
    // Check no anchor tag with javascript href
    const anchors = document.querySelectorAll("a");
    anchors.forEach((anchor) => {
      expect(anchor.getAttribute("href")).not.toContain("javascript:");
    });
  });
});
