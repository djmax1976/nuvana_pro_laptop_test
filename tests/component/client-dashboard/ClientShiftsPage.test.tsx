/**
 * @test-level Component
 * @justification Component tests for ClientShiftsPage - validates page title displays "Shifts"
 * @story 4-8-cashier-shift-start-flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import ClientShiftsPage from "@/app/(client-dashboard)/client-dashboard/shifts/page";
import * as shiftsApi from "@/lib/api/shifts";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/client-dashboard/shifts",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock ShiftList component
vi.mock("@/components/shifts/ShiftList", () => ({
  ShiftList: ({ onMetaChange }: { onMetaChange: (meta: any) => void }) => {
    // Simulate meta change on mount
    if (onMetaChange) {
      // Call onMetaChange immediately for test purposes
      setTimeout(() => {
        onMetaChange({
          total: 10,
          limit: 50,
          offset: 0,
          has_more: false,
        });
      }, 0);
    }
    return <div data-testid="shift-list">Shift List</div>;
  },
}));

describe("4.8-COMPONENT: ClientShiftsPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P0] 4.8-COMPONENT-027: should display 'Shifts' as page title", () => {
    // GIVEN: ClientShiftsPage is rendered
    renderWithProviders(<ClientShiftsPage />);

    // THEN: Page title should be "Shifts"
    expect(screen.getByText("Shifts")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: /^shifts$/i });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H1");
  });

  it("[P1] 4.8-COMPONENT-028: should display page description", () => {
    // GIVEN: ClientShiftsPage is rendered
    renderWithProviders(<ClientShiftsPage />);

    // THEN: Page description should be visible
    expect(
      screen.getByText(
        /view and manage shifts, open new shifts, and reconcile cash/i,
      ),
    ).toBeInTheDocument();
  });

  it("[P1] 4.8-COMPONENT-029: should render ShiftList component", () => {
    // GIVEN: ClientShiftsPage is rendered
    renderWithProviders(<ClientShiftsPage />);

    // THEN: ShiftList component should be rendered
    expect(screen.getByTestId("shift-list")).toBeInTheDocument();
  });
});
