/**
 * @test-level Component
 * @justification Component tests for ShiftAndDayPage - validates page title and description
 * @story 4-8-cashier-shift-start-flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import ShiftAndDayPage from "@/app/(client-dashboard)/client-dashboard/shift-and-day/page";

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
  usePathname: () => "/client-dashboard/shift-and-day",
  useSearchParams: () => new URLSearchParams(),
}));

describe("4.8-COMPONENT: ShiftAndDayPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P0] 4.8-COMPONENT-030: should display 'Shift and Day' as page title", () => {
    // GIVEN: ShiftAndDayPage is rendered
    renderWithProviders(<ShiftAndDayPage />);

    // THEN: Page title should be "Shift and Day"
    expect(screen.getByText("Shift and Day")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: /shift and day/i });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H1");
  });

  it("[P1] 4.8-COMPONENT-035: should display page description", () => {
    // GIVEN: ShiftAndDayPage is rendered
    renderWithProviders(<ShiftAndDayPage />);

    // THEN: Page description should be visible
    expect(
      screen.getByText(
        /view day reconciliations, daily summaries, and shift totals/i,
      ),
    ).toBeInTheDocument();
  });

  it("[P1] should display coming soon placeholder", () => {
    // GIVEN: ShiftAndDayPage is rendered
    renderWithProviders(<ShiftAndDayPage />);

    // THEN: Coming soon message should be visible
    expect(
      screen.getByText(/shift and day reconciliation view coming soon/i),
    ).toBeInTheDocument();
  });
});
