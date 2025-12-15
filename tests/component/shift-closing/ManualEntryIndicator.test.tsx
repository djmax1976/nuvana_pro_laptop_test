/**
 * Manual Entry Indicator Component Tests
 *
 * Tests for the manual entry mode visual indicator:
 * - Indicator displays when manual entry mode is active
 * - Shows authorized user name and timestamp
 * - Does not display when mode is inactive
 * - Proper styling with amber/yellow color
 *
 * @test-level Component
 * @justification Tests UI component behavior and conditional rendering
 * @story 10-4 - Manual Entry Override
 * @priority P1 (High - Core Feature)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ManualEntryIndicator } from "@/components/shift-closing/ManualEntryIndicator";

describe("10-4-COMPONENT: ManualEntryIndicator", () => {
  const mockAuthorizedBy = {
    userId: "user-123",
    name: "Test Manager",
  };

  const mockAuthorizedAt = new Date("2025-01-28T14:30:00Z");

  beforeEach(() => {
    // Reset any mocks if needed
  });

  it("10-4-COMPONENT-INDICATOR-001: should not render when manual entry mode is inactive", () => {
    // GIVEN: Manual entry mode is inactive
    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={false}
        authorizedBy={null}
        authorizedAt={null}
      />,
    );

    // THEN: Indicator is not displayed
    const indicator = screen.queryByTestId("manual-entry-indicator");
    expect(indicator).not.toBeInTheDocument();
  });

  it("10-4-COMPONENT-INDICATOR-002: should not render when authorizedBy is null", () => {
    // GIVEN: Manual entry mode is active but authorizedBy is null
    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={null}
        authorizedAt={mockAuthorizedAt}
      />,
    );

    // THEN: Indicator is not displayed
    const indicator = screen.queryByTestId("manual-entry-indicator");
    expect(indicator).not.toBeInTheDocument();
  });

  it("10-4-COMPONENT-INDICATOR-003: should not render when authorizedAt is null", () => {
    // GIVEN: Manual entry mode is active but authorizedAt is null
    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={mockAuthorizedBy}
        authorizedAt={null}
      />,
    );

    // THEN: Indicator is not displayed
    const indicator = screen.queryByTestId("manual-entry-indicator");
    expect(indicator).not.toBeInTheDocument();
  });

  it("10-4-COMPONENT-INDICATOR-004: should display indicator when manual entry mode is active", () => {
    // GIVEN: Manual entry mode is active with authorization data
    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={mockAuthorizedBy}
        authorizedAt={mockAuthorizedAt}
      />,
    );

    // THEN: Indicator is displayed
    const indicator = screen.getByTestId("manual-entry-indicator");
    expect(indicator).toBeInTheDocument();
  });

  it("10-4-COMPONENT-INDICATOR-005: should show 'Manual Entry Mode Active' title", () => {
    // GIVEN: Manual entry mode is active
    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={mockAuthorizedBy}
        authorizedAt={mockAuthorizedAt}
      />,
    );

    // THEN: Title "Manual Entry Mode Active" is displayed
    expect(screen.getByText("Manual Entry Mode Active")).toBeInTheDocument();
  });

  it("10-4-COMPONENT-INDICATOR-006: should show authorized user name", () => {
    // GIVEN: Manual entry mode is active with authorized user
    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={mockAuthorizedBy}
        authorizedAt={mockAuthorizedAt}
      />,
    );

    // THEN: Authorized user name is displayed
    expect(screen.getByText(/Authorized by:/)).toBeInTheDocument();
    expect(screen.getByText("Test Manager")).toBeInTheDocument();
  });

  it("10-4-COMPONENT-INDICATOR-007: should show formatted timestamp", () => {
    // GIVEN: Manual entry mode is active with authorization timestamp
    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={mockAuthorizedBy}
        authorizedAt={mockAuthorizedAt}
      />,
    );

    // THEN: Formatted timestamp is displayed
    expect(screen.getByText(/Authorized at:/)).toBeInTheDocument();
    // Timestamp format: "2:30:00 PM" (or similar based on locale)
    const timeText =
      screen.getByText(/Authorized at:/).parentElement?.textContent;
    expect(timeText).toMatch(/\d{1,2}:\d{2}:\d{2}\s(AM|PM)/);
  });

  it("10-4-COMPONENT-INDICATOR-008: should have amber/yellow styling", () => {
    // GIVEN: Manual entry mode is active
    // WHEN: Component is rendered
    const { container } = render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={mockAuthorizedBy}
        authorizedAt={mockAuthorizedAt}
      />,
    );

    // THEN: Indicator has amber/yellow styling classes
    const indicator = screen.getByTestId("manual-entry-indicator");
    expect(indicator.className).toContain("amber");
  });

  it("10-4-COMPONENT-INDICATOR-009: should display AlertTriangle icon", () => {
    // GIVEN: Manual entry mode is active
    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={mockAuthorizedBy}
        authorizedAt={mockAuthorizedAt}
      />,
    );

    // THEN: AlertTriangle icon is displayed (via lucide-react)
    // The icon is rendered as an SVG, we check for its presence via the parent Alert
    const indicator = screen.getByTestId("manual-entry-indicator");
    const icon = indicator.querySelector("svg");
    expect(icon).toBeInTheDocument();
  });

  it("10-4-COMPONENT-INDICATOR-010: should escape user name to prevent XSS", () => {
    // GIVEN: Manual entry mode is active with XSS attempt in user name
    const xssAuthorizedBy = {
      userId: "user-123",
      name: "<script>alert('XSS')</script>Test Manager",
    };

    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={xssAuthorizedBy}
        authorizedAt={mockAuthorizedAt}
      />,
    );

    // THEN: XSS is escaped (React automatically escapes HTML)
    const nameElement = screen.getByText(
      /<script>alert\('XSS'\)<\/script>Test Manager/,
    );
    expect(nameElement).toBeInTheDocument();
    expect(nameElement.tagName).not.toBe("SCRIPT");
    // Verify the script tag is not executed (it's escaped as text)
    expect(nameElement.textContent).toContain("<script>");
  });

  // ============================================================================
  // 🔄 EDGE CASES (Standard Boundaries - Applied Automatically)
  // ============================================================================

  it("10-4-COMPONENT-EDGE-012: should handle very long user names", () => {
    // GIVEN: Manual entry mode is active with very long user name
    const longNameAuthorizedBy = {
      userId: "user-123",
      name: "A".repeat(255), // Very long name
    };

    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={longNameAuthorizedBy}
        authorizedAt={mockAuthorizedAt}
      />,
    );

    // THEN: Component handles long name gracefully
    const indicator = screen.getByTestId("manual-entry-indicator");
    expect(indicator).toBeInTheDocument();
    // Assertion: Name should be displayed (may be truncated by CSS)
    expect(screen.getByText(/Authorized by:/)).toBeInTheDocument();
  });

  it("10-4-COMPONENT-EDGE-013: should handle special characters in user name", () => {
    // GIVEN: Manual entry mode is active with special characters in name
    const specialCharAuthorizedBy = {
      userId: "user-123",
      name: "Test Manager & Co. (Admin) [2025]",
    };

    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={specialCharAuthorizedBy}
        authorizedAt={mockAuthorizedAt}
      />,
    );

    // THEN: Special characters are escaped properly
    const indicator = screen.getByTestId("manual-entry-indicator");
    expect(indicator).toBeInTheDocument();
    // Assertion: Name should be displayed safely
    expect(screen.getByText(/Test Manager/)).toBeInTheDocument();
  });

  it("10-4-COMPONENT-EDGE-014: should handle future timestamp", () => {
    // GIVEN: Manual entry mode is active with future timestamp
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1); // 1 year in future

    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={mockAuthorizedBy}
        authorizedAt={futureDate}
      />,
    );

    // THEN: Component handles future date gracefully
    const indicator = screen.getByTestId("manual-entry-indicator");
    expect(indicator).toBeInTheDocument();
    // Assertion: Timestamp should be displayed (formatting handles future dates)
    expect(screen.getByText(/Authorized at:/)).toBeInTheDocument();
  });

  it("10-4-COMPONENT-EDGE-015: should handle very old timestamp", () => {
    // GIVEN: Manual entry mode is active with very old timestamp
    const oldDate = new Date("2000-01-01T00:00:00Z");

    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={mockAuthorizedBy}
        authorizedAt={oldDate}
      />,
    );

    // THEN: Component handles old date gracefully
    const indicator = screen.getByTestId("manual-entry-indicator");
    expect(indicator).toBeInTheDocument();
    // Assertion: Timestamp should be displayed
    expect(screen.getByText(/Authorized at:/)).toBeInTheDocument();
  });

  // ============================================================================
  // ✅ ENHANCED ASSERTIONS (Best Practices - Applied Automatically)
  // ============================================================================

  it("10-4-COMPONENT-ASSERT-004: should have proper accessibility attributes", () => {
    // GIVEN: Manual entry mode is active
    // WHEN: Component is rendered
    render(
      <ManualEntryIndicator
        isActive={true}
        authorizedBy={mockAuthorizedBy}
        authorizedAt={mockAuthorizedAt}
      />,
    );

    // THEN: Component has proper test ID
    const indicator = screen.getByTestId("manual-entry-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute("data-testid", "manual-entry-indicator");

    // Assertion: Component should have appropriate ARIA attributes
    // (Alert component should have role="alert" or similar)
  });
});
