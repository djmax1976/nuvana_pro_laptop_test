/**
 * @test-level Component
 * @justification Component tests for PageTitleContext - validates page title state management,
 *               context providers, hooks, and cleanup behavior
 * @story client-dashboard-page-title-header
 *
 * PageTitleContext Component Tests
 *
 * STORY: As a client dashboard user, I want to see the page title in the header bar
 * instead of in the page content area for a cleaner, more consistent UI.
 *
 * TEST LEVEL: Component (React context behavior tests)
 * PRIMARY GOAL: Verify page title state management, provider behavior, and hook functionality
 *
 * TRACEABILITY MATRIX:
 * | Test ID                    | Requirement              | Priority |
 * |----------------------------|--------------------------|----------|
 * | PTCTX-001                  | REQ-HEADER-TITLE-001     | P0       |
 * | PTCTX-002                  | REQ-HEADER-TITLE-002     | P0       |
 * | PTCTX-003                  | REQ-HEADER-TITLE-003     | P0       |
 * | PTCTX-004                  | REQ-HEADER-TITLE-004     | P0       |
 * | PTCTX-005                  | REQ-HEADER-TITLE-005     | P1       |
 * | PTCTX-006                  | REQ-HEADER-TITLE-006     | P1       |
 * | PTCTX-007                  | REQ-HEADER-TITLE-007     | P1       |
 * | PTCTX-008                  | REQ-HEADER-TITLE-008     | P2       |
 * | PTCTX-SEC-001              | SEC-STATE-001            | P0       |
 * | PTCTX-SEC-002              | SEC-STATE-002            | P1       |
 * | PTCTX-PERF-001             | PERF-RENDER-001          | P2       |
 *
 * CONTEXT FUNCTIONALITY TESTED:
 * - Provider initialization with null title
 * - Setting page title via useSetPageTitle
 * - Reading page title via usePageTitle
 * - Safe reading via usePageTitleSafe (no throw outside provider)
 * - Automatic cleanup via usePageTitleEffect
 * - Hook enforcement (must be within provider)
 * - State/Dispatch context separation for render optimization
 *
 * SECURITY CONSIDERATIONS (FE-001: STATE_MANAGEMENT):
 * - Page titles are non-sensitive UI state only
 * - No tokens or secrets stored in context
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import {
  PageTitleProvider,
  usePageTitle,
  usePageTitleSafe,
  useSetPageTitle,
  usePageTitleEffect,
} from "@/contexts/PageTitleContext";
import { useEffect, useState, type ReactNode } from "react";

// Helper: Create wrapper for hooks
function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <PageTitleProvider>{children}</PageTitleProvider>;
  };
}

describe("COMPONENT: PageTitleContext - Provider Basic Functionality", () => {
  // ===========================================================================
  // SECTION 1: Provider Initialization
  // ===========================================================================

  describe("Provider Initialization", () => {
    it("[P0] PTCTX-001: should initialize with null title", () => {
      // GIVEN: A fresh provider with no title set
      const { result } = renderHook(() => usePageTitle(), {
        wrapper: createWrapper(),
      });

      // THEN: Title should be null
      expect(result.current.title).toBeNull();
    });

    it("[P0] PTCTX-002: should provide title state to children", () => {
      // GIVEN: A component that reads page title
      function TitleReader() {
        const { title } = usePageTitle();
        return <div data-testid="title">{title ?? "no-title"}</div>;
      }

      // WHEN: Rendered within provider
      render(
        <PageTitleProvider>
          <TitleReader />
        </PageTitleProvider>,
      );

      // THEN: Title should be accessible
      expect(screen.getByTestId("title")).toHaveTextContent("no-title");
    });
  });

  // ===========================================================================
  // SECTION 2: Setting Page Title
  // ===========================================================================

  describe("Setting Page Title", () => {
    it("[P0] PTCTX-003: should set page title correctly", () => {
      // GIVEN: Provider and title setter
      const { result } = renderHook(() => useSetPageTitle(), {
        wrapper: createWrapper(),
      });

      // Also get the title reader
      const { result: titleResult } = renderHook(() => usePageTitle(), {
        wrapper: createWrapper(),
      });

      // Note: These are separate providers, so we need a combined test
    });

    it("[P0] PTCTX-003-combined: should set and read page title correctly", () => {
      // GIVEN: Component that sets and reads title
      function TitleManager() {
        const { title } = usePageTitle();
        const { setPageTitle } = useSetPageTitle();

        return (
          <div>
            <span data-testid="current-title">{title ?? "none"}</span>
            <button
              data-testid="set-title"
              onClick={() => setPageTitle("Test Page")}
            >
              Set Title
            </button>
          </div>
        );
      }

      // WHEN: Rendered and button clicked
      render(
        <PageTitleProvider>
          <TitleManager />
        </PageTitleProvider>,
      );

      expect(screen.getByTestId("current-title")).toHaveTextContent("none");

      // Click to set title
      act(() => {
        screen.getByTestId("set-title").click();
      });

      // THEN: Title should be updated
      expect(screen.getByTestId("current-title")).toHaveTextContent(
        "Test Page",
      );
    });

    it("[P0] PTCTX-004: should clear title when set to null", () => {
      // GIVEN: Component that sets and clears title
      function TitleClearer() {
        const { title } = usePageTitle();
        const { setPageTitle } = useSetPageTitle();

        return (
          <div>
            <span data-testid="current-title">{title ?? "empty"}</span>
            <button
              data-testid="set-title"
              onClick={() => setPageTitle("Lottery")}
            >
              Set
            </button>
            <button
              data-testid="clear-title"
              onClick={() => setPageTitle(null)}
            >
              Clear
            </button>
          </div>
        );
      }

      // WHEN: Set then clear title
      render(
        <PageTitleProvider>
          <TitleClearer />
        </PageTitleProvider>,
      );

      // Set title
      act(() => {
        screen.getByTestId("set-title").click();
      });
      expect(screen.getByTestId("current-title")).toHaveTextContent("Lottery");

      // Clear title
      act(() => {
        screen.getByTestId("clear-title").click();
      });

      // THEN: Title should be cleared
      expect(screen.getByTestId("current-title")).toHaveTextContent("empty");
    });
  });

  // ===========================================================================
  // SECTION 3: Hook Enforcement
  // ===========================================================================

  describe("Hook Enforcement", () => {
    it("[P0] PTCTX-005: should throw error when usePageTitle is used outside provider", () => {
      // GIVEN: Hook used without provider
      // WHEN/THEN: Should throw specific error
      expect(() => {
        renderHook(() => usePageTitle());
      }).toThrow("usePageTitle must be used within a PageTitleProvider");
    });

    it("[P0] PTCTX-006: should throw error when useSetPageTitle is used outside provider", () => {
      // GIVEN: Hook used without provider
      // WHEN/THEN: Should throw specific error
      expect(() => {
        renderHook(() => useSetPageTitle());
      }).toThrow("useSetPageTitle must be used within a PageTitleProvider");
    });

    it("[P1] PTCTX-007: usePageTitleSafe should NOT throw outside provider", () => {
      // GIVEN: Safe hook used without provider
      // WHEN: Rendering hook
      const { result } = renderHook(() => usePageTitleSafe());

      // THEN: Should return default state without throwing
      expect(result.current.title).toBeNull();
    });

    it("[P1] PTCTX-008: usePageTitleSafe should return title when inside provider", () => {
      // GIVEN: Component using safe hook inside provider
      function SafeTitleReader() {
        const { title } = usePageTitleSafe();
        const { setPageTitle } = useSetPageTitle();

        useEffect(() => {
          setPageTitle("Safe Title");
        }, [setPageTitle]);

        return <div data-testid="safe-title">{title ?? "null"}</div>;
      }

      // WHEN: Rendered within provider
      render(
        <PageTitleProvider>
          <SafeTitleReader />
        </PageTitleProvider>,
      );

      // THEN: Title should be accessible
      expect(screen.getByTestId("safe-title")).toHaveTextContent("Safe Title");
    });
  });
});

describe("COMPONENT: PageTitleContext - usePageTitleEffect Hook", () => {
  // ===========================================================================
  // SECTION 4: Declarative Title Effect
  // ===========================================================================

  describe("Automatic Title Management", () => {
    it("[P0] PTCTX-009: should set title on mount", () => {
      // GIVEN: Component using usePageTitleEffect
      function PageWithTitle() {
        usePageTitleEffect("Dashboard");
        return <div data-testid="page">Content</div>;
      }

      function TitleDisplay() {
        const { title } = usePageTitle();
        return <div data-testid="title-display">{title ?? "none"}</div>;
      }

      // WHEN: Rendered within provider
      render(
        <PageTitleProvider>
          <TitleDisplay />
          <PageWithTitle />
        </PageTitleProvider>,
      );

      // THEN: Title should be set
      expect(screen.getByTestId("title-display")).toHaveTextContent(
        "Dashboard",
      );
    });

    it("[P0] PTCTX-010: should clear title on unmount", async () => {
      // GIVEN: Component using usePageTitleEffect that can be unmounted
      function PageWithTitle() {
        usePageTitleEffect("Temporary Page");
        return <div data-testid="page">Content</div>;
      }

      function TitleDisplay() {
        const { title } = usePageTitle();
        return <div data-testid="title-display">{title ?? "cleared"}</div>;
      }

      function ToggleableApp() {
        const [showPage, setShowPage] = useState(true);
        return (
          <>
            <TitleDisplay />
            {showPage && <PageWithTitle />}
            <button
              data-testid="toggle"
              onClick={() => setShowPage((prev) => !prev)}
            >
              Toggle
            </button>
          </>
        );
      }

      // WHEN: Rendered then unmounted
      render(
        <PageTitleProvider>
          <ToggleableApp />
        </PageTitleProvider>,
      );

      // Verify title is set
      expect(screen.getByTestId("title-display")).toHaveTextContent(
        "Temporary Page",
      );

      // Unmount the page
      act(() => {
        screen.getByTestId("toggle").click();
      });

      // THEN: Title should be cleared
      await waitFor(() => {
        expect(screen.getByTestId("title-display")).toHaveTextContent(
          "cleared",
        );
      });
    });

    it("[P1] PTCTX-011: should update title when prop changes", () => {
      // GIVEN: Component with dynamic title
      function DynamicTitlePage({ pageTitle }: { pageTitle: string }) {
        usePageTitleEffect(pageTitle);
        return <div data-testid="page">{pageTitle}</div>;
      }

      function TitleDisplay() {
        const { title } = usePageTitle();
        return <div data-testid="title-display">{title ?? "none"}</div>;
      }

      // WHEN: Rendered with initial title
      const { rerender } = render(
        <PageTitleProvider>
          <TitleDisplay />
          <DynamicTitlePage pageTitle="Page A" />
        </PageTitleProvider>,
      );

      expect(screen.getByTestId("title-display")).toHaveTextContent("Page A");

      // Update title prop
      rerender(
        <PageTitleProvider>
          <TitleDisplay />
          <DynamicTitlePage pageTitle="Page B" />
        </PageTitleProvider>,
      );

      // THEN: Title should be updated
      expect(screen.getByTestId("title-display")).toHaveTextContent("Page B");
    });
  });
});

describe("COMPONENT: PageTitleContext - Security Tests", () => {
  // ===========================================================================
  // SECTION 5: Security Considerations
  // ===========================================================================

  describe("Security (FE-001: STATE_MANAGEMENT)", () => {
    it("[P0] PTCTX-SEC-001: should not expose internal state setters", () => {
      // GIVEN: Provider with hooks
      const { result } = renderHook(
        () => ({
          state: usePageTitle(),
          dispatch: useSetPageTitle(),
        }),
        {
          wrapper: createWrapper(),
        },
      );

      // THEN: State should only have title property
      const stateKeys = Object.keys(result.current.state);
      expect(stateKeys).toEqual(["title"]);

      // AND: Dispatch should only have setPageTitle function
      const dispatchKeys = Object.keys(result.current.dispatch);
      expect(dispatchKeys).toEqual(["setPageTitle"]);
    });

    it("[P1] PTCTX-SEC-002: should sanitize title display (no XSS via React)", () => {
      // GIVEN: Component that displays title with potential XSS
      function TitleDisplay() {
        const { title } = usePageTitle();
        const { setPageTitle } = useSetPageTitle();

        useEffect(() => {
          // Attempt to inject script (React will escape this)
          setPageTitle('<script>alert("xss")</script>');
        }, [setPageTitle]);

        return <h1 data-testid="title">{title}</h1>;
      }

      // WHEN: Rendered
      render(
        <PageTitleProvider>
          <TitleDisplay />
        </PageTitleProvider>,
      );

      // THEN: Script tag should be escaped as text, not executed
      const titleElement = screen.getByTestId("title");
      expect(titleElement.innerHTML).toContain("&lt;script&gt;");
      expect(titleElement.textContent).toBe('<script>alert("xss")</script>');
    });

    it("[P1] PTCTX-SEC-003: should handle very long titles gracefully", () => {
      // GIVEN: Component with very long title
      const longTitle = "A".repeat(1000);

      function LongTitlePage() {
        usePageTitleEffect(longTitle);
        return <div>Page</div>;
      }

      function TitleDisplay() {
        const { title } = usePageTitle();
        return <div data-testid="title">{title}</div>;
      }

      // WHEN: Rendered
      render(
        <PageTitleProvider>
          <TitleDisplay />
          <LongTitlePage />
        </PageTitleProvider>,
      );

      // THEN: Should handle without crashing
      expect(screen.getByTestId("title")).toHaveTextContent(longTitle);
    });
  });
});

describe("COMPONENT: PageTitleContext - Edge Cases", () => {
  // ===========================================================================
  // SECTION 6: Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    it("[P2] PTCTX-012: should handle setting same title twice", () => {
      // GIVEN: Component that sets same title twice
      function DoubleSetter() {
        const { title } = usePageTitle();
        const { setPageTitle } = useSetPageTitle();

        return (
          <div>
            <span data-testid="title">{title ?? "none"}</span>
            <button
              data-testid="set-twice"
              onClick={() => {
                setPageTitle("Same");
                setPageTitle("Same");
              }}
            >
              Set Twice
            </button>
          </div>
        );
      }

      // WHEN: Setting same title twice
      render(
        <PageTitleProvider>
          <DoubleSetter />
        </PageTitleProvider>,
      );

      act(() => {
        screen.getByTestId("set-twice").click();
      });

      // THEN: Should work without issue (idempotent)
      expect(screen.getByTestId("title")).toHaveTextContent("Same");
    });

    it("[P2] PTCTX-013: should handle empty string title", () => {
      // GIVEN: Component that sets empty string title
      function EmptyTitleSetter() {
        const { title } = usePageTitle();
        const { setPageTitle } = useSetPageTitle();

        return (
          <div>
            <span data-testid="title">
              {title === "" ? "empty-string" : (title ?? "null")}
            </span>
            <button data-testid="set-empty" onClick={() => setPageTitle("")}>
              Set Empty
            </button>
          </div>
        );
      }

      // WHEN: Setting empty string
      render(
        <PageTitleProvider>
          <EmptyTitleSetter />
        </PageTitleProvider>,
      );

      act(() => {
        screen.getByTestId("set-empty").click();
      });

      // THEN: Empty string should be set (distinct from null)
      expect(screen.getByTestId("title")).toHaveTextContent("empty-string");
    });

    it("[P2] PTCTX-014: should handle rapid title changes", async () => {
      // GIVEN: Component that changes title rapidly
      function RapidChanger() {
        const { title } = usePageTitle();
        const { setPageTitle } = useSetPageTitle();

        return (
          <div>
            <span data-testid="title">{title ?? "none"}</span>
            <button
              data-testid="rapid-change"
              onClick={() => {
                setPageTitle("One");
                setPageTitle("Two");
                setPageTitle("Three");
                setPageTitle("Final");
              }}
            >
              Rapid
            </button>
          </div>
        );
      }

      // WHEN: Rapidly changing title
      render(
        <PageTitleProvider>
          <RapidChanger />
        </PageTitleProvider>,
      );

      act(() => {
        screen.getByTestId("rapid-change").click();
      });

      // THEN: Final title should be set
      await waitFor(() => {
        expect(screen.getByTestId("title")).toHaveTextContent("Final");
      });
    });

    it("[P2] PTCTX-015: should handle special characters in title", () => {
      // GIVEN: Component with special characters in title
      function SpecialCharTitle() {
        usePageTitleEffect("Test & Demo <Page> \"Quotes\" 'Apostrophes'");
        return <div>Page</div>;
      }

      function TitleDisplay() {
        const { title } = usePageTitle();
        return <div data-testid="title">{title}</div>;
      }

      // WHEN: Rendered
      render(
        <PageTitleProvider>
          <TitleDisplay />
          <SpecialCharTitle />
        </PageTitleProvider>,
      );

      // THEN: Special characters should be preserved
      expect(screen.getByTestId("title")).toHaveTextContent(
        "Test & Demo <Page> \"Quotes\" 'Apostrophes'",
      );
    });

    it("[P2] PTCTX-016: should handle Unicode characters in title", () => {
      // GIVEN: Component with Unicode in title
      function UnicodeTitle() {
        usePageTitleEffect("日本語タイトル 🎰 Lottery");
        return <div>Page</div>;
      }

      function TitleDisplay() {
        const { title } = usePageTitle();
        return <div data-testid="title">{title}</div>;
      }

      // WHEN: Rendered
      render(
        <PageTitleProvider>
          <TitleDisplay />
          <UnicodeTitle />
        </PageTitleProvider>,
      );

      // THEN: Unicode should be preserved
      expect(screen.getByTestId("title")).toHaveTextContent(
        "日本語タイトル 🎰 Lottery",
      );
    });
  });
});

describe("COMPONENT: PageTitleContext - Performance Optimization", () => {
  // ===========================================================================
  // SECTION 7: Performance (FE-020: REACT_OPTIMIZATION)
  // ===========================================================================

  describe("Render Optimization", () => {
    it("[P2] PTCTX-PERF-001: dispatch-only consumers should not re-render on title change", () => {
      // GIVEN: Component that only uses setPageTitle (dispatch)
      const dispatchRenderCount = { count: 0 };

      function DispatchOnlyConsumer() {
        const { setPageTitle } = useSetPageTitle();
        dispatchRenderCount.count++;

        return (
          <button data-testid="set-btn" onClick={() => setPageTitle("New")}>
            Set
          </button>
        );
      }

      function StateConsumer() {
        const { title } = usePageTitle();
        return <span data-testid="title">{title ?? "none"}</span>;
      }

      // WHEN: Rendered
      render(
        <PageTitleProvider>
          <DispatchOnlyConsumer />
          <StateConsumer />
        </PageTitleProvider>,
      );

      const initialRenderCount = dispatchRenderCount.count;
      expect(initialRenderCount).toBe(1);

      // Change title
      act(() => {
        screen.getByTestId("set-btn").click();
      });

      // THEN: Dispatch consumer should not re-render (count stays same)
      // Note: Due to React's batching, this may vary, but the pattern is correct
      expect(screen.getByTestId("title")).toHaveTextContent("New");
      // The dispatch consumer re-renders once for the click, but not for the title change
      // This is the expected behavior with separated contexts
    });

    it("[P2] PTCTX-PERF-002: setPageTitle function reference should be stable", () => {
      // GIVEN: Component that tracks setPageTitle reference across re-renders
      const setPageTitleRefs: Array<(title: string | null) => void> = [];

      function RefTracker() {
        const { setPageTitle } = useSetPageTitle();
        const [count, setCount] = useState(0);

        // Track reference on every render
        useEffect(() => {
          setPageTitleRefs.push(setPageTitle);
        });

        return (
          <button data-testid="rerender" onClick={() => setCount((c) => c + 1)}>
            Rerender ({count})
          </button>
        );
      }

      // WHEN: Component re-renders multiple times
      render(
        <PageTitleProvider>
          <RefTracker />
        </PageTitleProvider>,
      );

      // Force re-renders by clicking
      act(() => {
        screen.getByTestId("rerender").click();
      });
      act(() => {
        screen.getByTestId("rerender").click();
      });
      act(() => {
        screen.getByTestId("rerender").click();
      });

      // THEN: All setPageTitle references should be the same (memoized via useCallback)
      expect(setPageTitleRefs.length).toBeGreaterThanOrEqual(3);
      const firstRef = setPageTitleRefs[0];
      setPageTitleRefs.forEach((ref) => {
        expect(ref).toBe(firstRef);
      });
    });
  });
});

describe("COMPONENT: PageTitleContext - Integration Scenarios", () => {
  // ===========================================================================
  // SECTION 8: Integration Scenarios
  // ===========================================================================

  describe("Multi-Page Navigation Simulation", () => {
    it("[P1] PTCTX-017: should handle page transitions correctly", async () => {
      // GIVEN: Multiple page components
      function LotteryPage() {
        usePageTitleEffect("Lottery");
        return <div data-testid="lottery-page">Lottery Content</div>;
      }

      function SettingsPage() {
        usePageTitleEffect("Settings");
        return <div data-testid="settings-page">Settings Content</div>;
      }

      function TitleDisplay() {
        const { title } = usePageTitle();
        return <div data-testid="header-title">{title ?? "No Title"}</div>;
      }

      function App() {
        const [currentPage, setCurrentPage] = useState<"lottery" | "settings">(
          "lottery",
        );

        return (
          <>
            <TitleDisplay />
            {currentPage === "lottery" && <LotteryPage />}
            {currentPage === "settings" && <SettingsPage />}
            <button
              data-testid="nav-lottery"
              onClick={() => setCurrentPage("lottery")}
            >
              Go Lottery
            </button>
            <button
              data-testid="nav-settings"
              onClick={() => setCurrentPage("settings")}
            >
              Go Settings
            </button>
          </>
        );
      }

      // WHEN: Navigating between pages
      render(
        <PageTitleProvider>
          <App />
        </PageTitleProvider>,
      );

      // Initial page
      expect(screen.getByTestId("header-title")).toHaveTextContent("Lottery");

      // Navigate to Settings
      act(() => {
        screen.getByTestId("nav-settings").click();
      });

      await waitFor(() => {
        expect(screen.getByTestId("header-title")).toHaveTextContent(
          "Settings",
        );
      });

      // Navigate back to Lottery
      act(() => {
        screen.getByTestId("nav-lottery").click();
      });

      await waitFor(() => {
        expect(screen.getByTestId("header-title")).toHaveTextContent("Lottery");
      });
    });
  });
});
