/**
 * PageTitleContext Tests
 *
 * Test file for PageTitleContext hooks and provider.
 * Tests the page title management context used for header display.
 *
 * @test-level Unit
 * @justification Unit tests for React context hooks ensuring correct state management
 * @story Header Page Title Display
 * @priority P1 (Core UI Infrastructure)
 *
 * Traceability Matrix:
 * | Test ID | Requirement | Priority | Coverage |
 * |---------|-------------|----------|----------|
 * | PTX-001 | usePageTitle throws outside provider | P0 | Error Handling |
 * | PTX-002 | useSetPageTitle throws outside provider | P0 | Error Handling |
 * | PTX-003 | usePageTitleSafe returns default state outside provider | P0 | Safe Hook |
 * | PTX-004 | usePageTitle returns title from provider | P1 | Core Functionality |
 * | PTX-005 | useSetPageTitle updates title | P1 | Core Functionality |
 * | PTX-006 | usePageTitleEffect sets title on mount | P1 | Convenience Hook |
 * | PTX-007 | usePageTitleEffect clears title on unmount | P1 | Cleanup |
 * | PTX-008 | Provider can be nested (innermost wins) | P2 | Edge Case |
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import {
  PageTitleProvider,
  usePageTitle,
  useSetPageTitle,
  usePageTitleSafe,
  usePageTitleEffect,
} from "@/contexts/PageTitleContext";

// Helper component that displays the current title
function TitleDisplay() {
  const { title } = usePageTitle();
  return <div data-testid="title-display">{title ?? "No title"}</div>;
}

// Helper component that displays title using safe hook
function SafeTitleDisplay() {
  const { title } = usePageTitleSafe();
  return <div data-testid="safe-title-display">{title ?? "No title"}</div>;
}

// Helper component that sets a title
function TitleSetter({ title }: { title: string }) {
  const { setPageTitle } = useSetPageTitle();
  return (
    <button data-testid="title-setter" onClick={() => setPageTitle(title)}>
      Set Title
    </button>
  );
}

// Helper component using usePageTitleEffect
function TitleEffectComponent({ title }: { title: string }) {
  usePageTitleEffect(title);
  return <div data-testid="effect-component">Effect Component</div>;
}

describe("PageTitleContext", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // Error Handling - Hooks outside Provider
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Hooks outside Provider", () => {
    it("PTX-001: [P0] usePageTitle should throw when used outside PageTitleProvider", () => {
      // Suppress console.error for this test since we expect an error
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        render(<TitleDisplay />);
      }).toThrow("usePageTitle must be used within a PageTitleProvider");

      consoleSpy.mockRestore();
    });

    it("PTX-002: [P0] useSetPageTitle should throw when used outside PageTitleProvider", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        render(<TitleSetter title="Test" />);
      }).toThrow("useSetPageTitle must be used within a PageTitleProvider");

      consoleSpy.mockRestore();
    });

    it("PTX-003: [P0] usePageTitleSafe should return default state when used outside PageTitleProvider", () => {
      // GIVEN: SafeTitleDisplay is rendered without a provider
      // WHEN: The component renders
      render(<SafeTitleDisplay />);

      // THEN: It should display "No title" (null converted to string)
      expect(screen.getByTestId("safe-title-display")).toHaveTextContent(
        "No title",
      );
    });

    it("PTX-003b: [P0] usePageTitleSafe hook should return null title outside provider", () => {
      // GIVEN: We call usePageTitleSafe outside any provider
      const { result } = renderHook(() => usePageTitleSafe());

      // THEN: The title should be null
      expect(result.current.title).toBe(null);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Core Functionality - Within Provider
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Within Provider", () => {
    it("PTX-004: [P1] usePageTitle should return title from provider context", () => {
      // GIVEN: TitleDisplay is rendered within a PageTitleProvider
      // AND: A TitleSetter is available to set the title
      render(
        <PageTitleProvider>
          <TitleDisplay />
          <TitleSetter title="Test Page" />
        </PageTitleProvider>,
      );

      // WHEN: Initial render
      // THEN: Title should be null initially
      expect(screen.getByTestId("title-display")).toHaveTextContent("No title");

      // WHEN: We click the button to set the title
      act(() => {
        screen.getByTestId("title-setter").click();
      });

      // THEN: Title should be updated
      expect(screen.getByTestId("title-display")).toHaveTextContent(
        "Test Page",
      );
    });

    it("PTX-005: [P1] useSetPageTitle should update title in context", () => {
      // GIVEN: A provider with display and setter
      render(
        <PageTitleProvider>
          <TitleDisplay />
          <TitleSetter title="New Title" />
        </PageTitleProvider>,
      );

      // WHEN: We set the title
      act(() => {
        screen.getByTestId("title-setter").click();
      });

      // THEN: The displayed title should update
      expect(screen.getByTestId("title-display")).toHaveTextContent(
        "New Title",
      );
    });

    it("PTX-005b: [P1] setPageTitle should accept null to clear title", () => {
      // GIVEN: A provider with a custom setter that can set null
      function NullSetter() {
        const { setPageTitle } = useSetPageTitle();
        return (
          <>
            <button
              data-testid="set-title"
              onClick={() => setPageTitle("Has Title")}
            >
              Set
            </button>
            <button
              data-testid="clear-title"
              onClick={() => setPageTitle(null)}
            >
              Clear
            </button>
          </>
        );
      }

      render(
        <PageTitleProvider>
          <TitleDisplay />
          <NullSetter />
        </PageTitleProvider>,
      );

      // WHEN: We set a title then clear it
      act(() => {
        screen.getByTestId("set-title").click();
      });
      expect(screen.getByTestId("title-display")).toHaveTextContent(
        "Has Title",
      );

      act(() => {
        screen.getByTestId("clear-title").click();
      });

      // THEN: Title should be null again
      expect(screen.getByTestId("title-display")).toHaveTextContent("No title");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // usePageTitleEffect Hook
  // ═══════════════════════════════════════════════════════════════════════════

  describe("usePageTitleEffect", () => {
    it("PTX-006: [P1] usePageTitleEffect should set title on mount", () => {
      // GIVEN: A provider with a title effect component
      render(
        <PageTitleProvider>
          <TitleDisplay />
          <TitleEffectComponent title="Effect Title" />
        </PageTitleProvider>,
      );

      // THEN: The title should be set immediately
      expect(screen.getByTestId("title-display")).toHaveTextContent(
        "Effect Title",
      );
    });

    it("PTX-007: [P1] usePageTitleEffect should clear title on unmount", () => {
      // GIVEN: A provider with a conditionally rendered effect component
      function ConditionalEffect({ show }: { show: boolean }) {
        return show ? <TitleEffectComponent title="Conditional Title" /> : null;
      }

      const { rerender } = render(
        <PageTitleProvider>
          <TitleDisplay />
          <ConditionalEffect show={true} />
        </PageTitleProvider>,
      );

      // WHEN: Component is mounted
      expect(screen.getByTestId("title-display")).toHaveTextContent(
        "Conditional Title",
      );

      // WHEN: Component is unmounted
      rerender(
        <PageTitleProvider>
          <TitleDisplay />
          <ConditionalEffect show={false} />
        </PageTitleProvider>,
      );

      // THEN: Title should be cleared (null)
      expect(screen.getByTestId("title-display")).toHaveTextContent("No title");
    });

    it("PTX-007b: [P1] usePageTitleEffect should update title when title prop changes", () => {
      // GIVEN: A provider with an effect component
      const { rerender } = render(
        <PageTitleProvider>
          <TitleDisplay />
          <TitleEffectComponent title="First Title" />
        </PageTitleProvider>,
      );

      // THEN: Initial title is set
      expect(screen.getByTestId("title-display")).toHaveTextContent(
        "First Title",
      );

      // WHEN: Title prop changes
      rerender(
        <PageTitleProvider>
          <TitleDisplay />
          <TitleEffectComponent title="Second Title" />
        </PageTitleProvider>,
      );

      // THEN: Title should update
      expect(screen.getByTestId("title-display")).toHaveTextContent(
        "Second Title",
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Safe Hook within Provider
  // ═══════════════════════════════════════════════════════════════════════════

  describe("usePageTitleSafe within Provider", () => {
    it("PTX-009: [P1] usePageTitleSafe should work within provider and reflect updates", () => {
      // GIVEN: A provider with safe title display and setter
      render(
        <PageTitleProvider>
          <SafeTitleDisplay />
          <TitleSetter title="Safe Test" />
        </PageTitleProvider>,
      );

      // WHEN: Initial render
      expect(screen.getByTestId("safe-title-display")).toHaveTextContent(
        "No title",
      );

      // WHEN: We set the title
      act(() => {
        screen.getByTestId("title-setter").click();
      });

      // THEN: Safe display should also reflect the update
      expect(screen.getByTestId("safe-title-display")).toHaveTextContent(
        "Safe Test",
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Edge Cases", () => {
    it("PTX-008: [P2] Nested providers should work independently (innermost wins)", () => {
      // GIVEN: Nested providers with different components
      render(
        <PageTitleProvider>
          <TitleDisplay />
          <TitleSetter title="Outer Title" />
          <PageTitleProvider>
            <div data-testid="inner-section">
              <TitleDisplay />
              <TitleSetter title="Inner Title" />
            </div>
          </PageTitleProvider>
        </PageTitleProvider>,
      );

      // Get the inner section elements
      const innerSection = screen.getByTestId("inner-section");
      const innerDisplay = innerSection.querySelector(
        '[data-testid="title-display"]',
      );
      const innerSetter = innerSection.querySelector(
        '[data-testid="title-setter"]',
      );

      // WHEN: We set the inner title
      act(() => {
        (innerSetter as HTMLElement).click();
      });

      // THEN: Only inner display should show "Inner Title"
      expect(innerDisplay).toHaveTextContent("Inner Title");

      // AND: Outer display should still show "No title" (unchanged)
      const allDisplays = screen.getAllByTestId("title-display");
      expect(allDisplays[0]).toHaveTextContent("No title"); // outer
    });

    it("PTX-010: [P2] Multiple setPageTitle calls should use the last value", () => {
      // GIVEN: A provider with a multi-setter
      function MultiSetter() {
        const { setPageTitle } = useSetPageTitle();
        return (
          <button
            data-testid="multi-setter"
            onClick={() => {
              setPageTitle("First");
              setPageTitle("Second");
              setPageTitle("Third");
            }}
          >
            Set Multiple
          </button>
        );
      }

      render(
        <PageTitleProvider>
          <TitleDisplay />
          <MultiSetter />
        </PageTitleProvider>,
      );

      // WHEN: We click the multi-setter
      act(() => {
        screen.getByTestId("multi-setter").click();
      });

      // THEN: The last value should be displayed
      expect(screen.getByTestId("title-display")).toHaveTextContent("Third");
    });

    it("PTX-011: [P2] Empty string title should be preserved (not treated as null)", () => {
      // GIVEN: A provider with a setter that sets empty string
      function EmptySetter() {
        const { setPageTitle } = useSetPageTitle();
        return (
          <button data-testid="empty-setter" onClick={() => setPageTitle("")}>
            Set Empty
          </button>
        );
      }

      function EmptyAwareDisplay() {
        const { title } = usePageTitle();
        return (
          <div data-testid="empty-aware-display">
            {title === null ? "NULL" : title === "" ? "EMPTY" : title}
          </div>
        );
      }

      render(
        <PageTitleProvider>
          <EmptyAwareDisplay />
          <EmptySetter />
        </PageTitleProvider>,
      );

      // WHEN: We set an empty string
      act(() => {
        screen.getByTestId("empty-setter").click();
      });

      // THEN: Empty string should be preserved
      expect(screen.getByTestId("empty-aware-display")).toHaveTextContent(
        "EMPTY",
      );
    });
  });
});
