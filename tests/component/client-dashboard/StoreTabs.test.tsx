/**
 * Component Tests: StoreTabs
 *
 * Tests StoreTabs component rendering and interactions:
 * - Displays tabs for all accessible stores
 * - Handles tab switching
 * - Highlights active tab
 * - Keyboard navigation (arrow keys)
 * - Accessibility (ARIA attributes, roles)
 *
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P2 (Medium - Navigation)
 * @enhanced-by workflow-9 on 2025-01-28
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreTabs } from "@/components/lottery/StoreTabs";
import type { OwnedStore } from "@/lib/api/client-dashboard";

// Helper to create mock OwnedStore with all required fields
const createMockStore = (props: { store_id: string; name: string }): OwnedStore => ({
  store_id: props.store_id,
  company_id: "company-1",
  company_name: "Test Company",
  name: props.name,
  location_json: { address: "123 Test St" },
  timezone: "America/New_York",
  status: "ACTIVE",
  created_at: new Date().toISOString(),
});

describe("6.10.1-COMPONENT: StoreTabs", () => {
  const mockStores: OwnedStore[] = [
    createMockStore({ store_id: "store-1", name: "Store 1" }),
    createMockStore({ store_id: "store-2", name: "Store 2" }),
    createMockStore({ store_id: "store-3", name: "Store 3" }),
  ];

  // Test isolation: Clean up after each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("6.10.1-COMPONENT-001: [P2] should display tabs for all accessible stores (AC #1)", async () => {
    // GIVEN: StoreTabs component with multiple stores
    // WHEN: Component is rendered
    render(
      <StoreTabs
        stores={mockStores}
        selectedStoreId="store-1"
        onStoreSelect={vi.fn()}
      />,
    );

    // THEN: All store tabs are displayed
    expect(
      screen.getByText("Store 1"),
      "Store 1 tab should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Store 2"),
      "Store 2 tab should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Store 3"),
      "Store 3 tab should be displayed",
    ).toBeInTheDocument();

    // AND: All tabs have data-testid attributes
    expect(
      screen.getByTestId("store-tab-store-1"),
      "Store 1 tab should have data-testid",
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("store-tab-store-2"),
      "Store 2 tab should have data-testid",
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("store-tab-store-3"),
      "Store 3 tab should have data-testid",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-002: [P2] should highlight active tab (AC #1)", async () => {
    // GIVEN: StoreTabs component with selected store
    // WHEN: Component is rendered with selectedStoreId="store-2"
    render(
      <StoreTabs
        stores={mockStores}
        selectedStoreId="store-2"
        onStoreSelect={vi.fn()}
      />,
    );

    // THEN: Store 2 tab has aria-selected="true"
    const store2Tab = screen.getByTestId("store-tab-store-2");
    expect(
      store2Tab,
      "Active tab should have aria-selected=true",
    ).toHaveAttribute("aria-selected", "true");

    // AND: Other tabs have aria-selected="false"
    const store1Tab = screen.getByTestId("store-tab-store-1");
    expect(
      store1Tab,
      "Inactive tab should have aria-selected=false",
    ).toHaveAttribute("aria-selected", "false");

    // AND: Active tab has correct tabIndex (0 for keyboard focus)
    expect(store2Tab, "Active tab should have tabIndex=0").toHaveAttribute(
      "tabIndex",
      "0",
    );

    // AND: Inactive tabs have tabIndex=-1 (not in tab order)
    expect(store1Tab, "Inactive tab should have tabIndex=-1").toHaveAttribute(
      "tabIndex",
      "-1",
    );
  });

  it("6.10.1-COMPONENT-003: [P2] should call onStoreSelect when tab is clicked (AC #1)", async () => {
    // GIVEN: StoreTabs component with onStoreSelect handler
    const user = userEvent.setup();
    const onStoreSelect = vi.fn();

    // WHEN: User clicks on Store 2 tab
    render(
      <StoreTabs
        stores={mockStores}
        selectedStoreId="store-1"
        onStoreSelect={onStoreSelect}
      />,
    );
    await user.click(screen.getByText("Store 2"));

    // THEN: onStoreSelect is called with store-2
    expect(
      onStoreSelect,
      "onStoreSelect should be called with clicked store ID",
    ).toHaveBeenCalledWith("store-2");
    expect(
      onStoreSelect,
      "onStoreSelect should be called exactly once",
    ).toHaveBeenCalledTimes(1);
  });

  it("6.10.1-COMPONENT-004: [P2] should handle single store (AC #1)", async () => {
    // GIVEN: StoreTabs component with single store
    const singleStore = [createMockStore({ store_id: "store-1", name: "Store 1" })];

    // WHEN: Component is rendered
    render(
      <StoreTabs
        stores={singleStore}
        selectedStoreId="store-1"
        onStoreSelect={vi.fn()}
      />,
    );

    // THEN: Single store name is displayed (no tabs)
    expect(
      screen.getByText("Store 1"),
      "Single store name should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("store-tab-store-1"),
      "Single store should not render as tab",
    ).not.toBeInTheDocument();

    // AND: Component has data-testid for testing
    expect(
      screen.getByTestId("store-tabs"),
      "Component should have store-tabs data-testid",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-005: [P2] should handle keyboard navigation with arrow keys (AC #1)", async () => {
    // GIVEN: StoreTabs component
    const user = userEvent.setup();
    const onStoreSelect = vi.fn();

    render(
      <StoreTabs
        stores={mockStores}
        selectedStoreId="store-2"
        onStoreSelect={onStoreSelect}
      />,
    );

    // WHEN: User presses ArrowRight key on Store 2 tab
    const store2Tab = screen.getByTestId("store-tab-store-2");
    store2Tab.focus();
    await user.keyboard("{ArrowRight}");

    // THEN: onStoreSelect is called with store-3 (next store)
    expect(
      onStoreSelect,
      "ArrowRight should select next store",
    ).toHaveBeenCalledWith("store-3");

    // WHEN: User presses ArrowLeft key
    await user.keyboard("{ArrowLeft}");

    // THEN: onStoreSelect is called with store-1 (previous store)
    expect(
      onStoreSelect,
      "ArrowLeft should select previous store",
    ).toHaveBeenCalledWith("store-1");
  });

  it("6.10.1-COMPONENT-006: [P2] should return null when stores array is empty (AC #1)", async () => {
    // GIVEN: StoreTabs component with empty stores array
    // WHEN: Component is rendered
    const { container } = render(
      <StoreTabs stores={[]} selectedStoreId={null} onStoreSelect={vi.fn()} />,
    );

    // THEN: Component returns null (nothing rendered)
    expect(
      container.firstChild,
      "Component should return null for empty stores array",
    ).toBeNull();
  });

  // ============ ACCESSIBILITY TESTS ============

  it("6.10.1-COMPONENT-A11Y-001: [P2] should have proper ARIA attributes for tab navigation", async () => {
    // GIVEN: StoreTabs component
    // WHEN: Component is rendered
    render(
      <StoreTabs
        stores={mockStores}
        selectedStoreId="store-2"
        onStoreSelect={vi.fn()}
      />,
    );

    // THEN: Tablist has proper ARIA label
    const tablist = screen.getByRole("tablist");
    expect(tablist, "Tablist should have aria-label").toHaveAttribute(
      "aria-label",
      "Store tabs",
    );

    // AND: Each tab has proper role and aria-controls
    const store2Tab = screen.getByTestId("store-tab-store-2");
    expect(store2Tab, "Tab should have role=tab").toHaveAttribute(
      "role",
      "tab",
    );
    expect(
      store2Tab,
      "Tab should have aria-controls pointing to controlled panel",
    ).toHaveAttribute("aria-controls", "lottery-table-store-2");
  });

  it("6.10.1-COMPONENT-A11Y-002: [P2] should support keyboard focus management", async () => {
    // GIVEN: StoreTabs component
    const user = userEvent.setup();

    render(
      <StoreTabs
        stores={mockStores}
        selectedStoreId="store-1"
        onStoreSelect={vi.fn()}
      />,
    );

    // WHEN: User focuses on active tab
    const store1Tab = screen.getByTestId("store-tab-store-1");
    store1Tab.focus();

    // THEN: Active tab is focusable (tabIndex=0)
    expect(store1Tab, "Active tab should be focusable").toHaveAttribute(
      "tabIndex",
      "0",
    );

    // AND: Inactive tabs are not in tab order (tabIndex=-1)
    const store2Tab = screen.getByTestId("store-tab-store-2");
    expect(
      store2Tab,
      "Inactive tab should not be in tab order",
    ).toHaveAttribute("tabIndex", "-1");
  });

  // ============ EDGE CASES ============

  it("6.10.1-COMPONENT-EDGE-016: [P2] should handle keyboard navigation at boundaries (first/last tab)", async () => {
    // GIVEN: StoreTabs component
    const user = userEvent.setup();
    const onStoreSelect = vi.fn();

    render(
      <StoreTabs
        stores={mockStores}
        selectedStoreId="store-1"
        onStoreSelect={onStoreSelect}
      />,
    );

    // WHEN: User presses ArrowLeft on first tab
    const store1Tab = screen.getByTestId("store-tab-store-1");
    store1Tab.focus();
    await user.keyboard("{ArrowLeft}");

    // THEN: Should wrap to last tab (store-3)
    expect(
      onStoreSelect,
      "ArrowLeft on first tab should wrap to last tab",
    ).toHaveBeenCalledWith("store-3");

    // WHEN: User presses ArrowRight on last tab
    vi.clearAllMocks();
    cleanup(); // Clean up previous render
    render(
      <StoreTabs
        stores={mockStores}
        selectedStoreId="store-3"
        onStoreSelect={onStoreSelect}
      />,
    );
    const store3Tab = screen.getByTestId("store-tab-store-3");
    store3Tab.focus();
    await user.keyboard("{ArrowRight}");

    // THEN: Should wrap to first tab (store-1)
    expect(
      onStoreSelect,
      "ArrowRight on last tab should wrap to first tab",
    ).toHaveBeenCalledWith("store-1");
  });
});
