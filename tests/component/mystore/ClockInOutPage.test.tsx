/**
 * @test-level Component
 * @justification Component tests for Clock In/Out placeholder page - validates "Coming Soon" message display
 * @story 4-9-mystore-terminal-dashboard
 */

import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import ClockInOutPage from "@/app/(mystore)/mystore/clock-in-out/page";

// Mock Next.js Link component
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe("4.9-COMPONENT: Clock In/Out Page", () => {
  it("[P0] 4.9-COMPONENT-020: should display 'Coming Soon' placeholder message", () => {
    // GIVEN: Page is rendered
    renderWithProviders(<ClockInOutPage />);

    // THEN: "Coming Soon" message should be visible
    expect(screen.getByTestId("coming-soon-message")).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /the clock in\/out feature is currently under development/i,
      ),
    ).toBeInTheDocument();
  });

  it("[P1] 4.9-COMPONENT-021: should display navigation back to dashboard", () => {
    // GIVEN: Page is rendered
    renderWithProviders(<ClockInOutPage />);

    // THEN: Back navigation link should be visible
    // Link contains a button with icon, so find by href attribute
    const backLink = screen.getByRole("link", { name: "" });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/mystore");
  });

  it("[P1] 4.9-COMPONENT-022: should display page title", () => {
    // GIVEN: Page is rendered
    renderWithProviders(<ClockInOutPage />);

    // THEN: Page title should be visible (use getByRole to get the heading specifically)
    expect(
      screen.getByRole("heading", { name: /clock in\/out/i }),
    ).toBeInTheDocument();
  });
});
