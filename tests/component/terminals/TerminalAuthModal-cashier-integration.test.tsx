/**
 * @test-level Component
 * @justification Component tests for TerminalAuthModal with real cashier API integration (AC #9)
 * @story 4-91-cashier-management-backend
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { TerminalAuthModal } from "@/components/terminals/TerminalAuthModal";
import userEvent from "@testing-library/user-event";

/**
 * Component Tests: TerminalAuthModal - Real Cashier Integration
 *
 * Tests AC #9 requirements:
 * - Fetches cashiers from GET /api/stores/:storeId/cashiers?is_active=true
 * - Removes static placeholder data
 * - Displays cashier name only in dropdown
 * - Calls POST /api/stores/:storeId/cashiers/authenticate on submit
 * - Handles authentication success/failure
 *
 * Story: 4.91 - Cashier Management Backend
 * Priority: P3 (Low - UI integration)
 */

describe("4.91-COMPONENT: TerminalAuthModal - Real Cashier Integration", () => {
  const mockTerminalId = "550e8400-e29b-41d4-a716-446655440011";
  const mockTerminalName = "Terminal 1";
  const mockStoreId = "store-uuid-123";
  const mockOnOpenChange = vi.fn();

  // Mock cashier data
  const mockCashiers = [
    { cashier_id: "cashier-1", employee_id: "0001", name: "John Smith" },
    { cashier_id: "cashier-2", employee_id: "0002", name: "Jane Doe" },
    { cashier_id: "cashier-3", employee_id: "0003", name: "Mike Johnson" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  it("[P3] 4.91-COMPONENT-001: should fetch cashiers from API on mount", async () => {
    // GIVEN: API returns cashiers
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockCashiers }),
    });

    // WHEN: Component is rendered with storeId
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: API is called to fetch cashiers
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          `/api/stores/${mockStoreId}/cashiers?is_active=true`,
        ),
        expect.any(Object),
      );
    });
  });

  it("[P3] 4.91-COMPONENT-002: should display real cashier names in dropdown (not static placeholders)", async () => {
    // GIVEN: API returns cashiers
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockCashiers }),
    });

    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // Wait for cashiers to load
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // WHEN: Cashier Name dropdown is clicked
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);

    // THEN: Real cashier names are displayed (not static placeholders)
    // Note: Radix Select renders both a hidden native select and a visible dropdown,
    // so we use getAllByText and check that at least one exists
    await waitFor(() => {
      expect(screen.getAllByText("John Smith").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Mike Johnson").length).toBeGreaterThan(0);

      // AND: Static placeholders are NOT displayed
      // (Old static data: "John Doe", "Jane Smith", "Mike Johnson" should not appear)
      const oldJohnDoe = screen.queryByText("John Doe");
      const oldJaneSmith = screen.queryByText("Jane Smith");
      expect(oldJohnDoe).not.toBeInTheDocument();
      expect(oldJaneSmith).not.toBeInTheDocument();
    });
  });

  it("[P3] 4.91-COMPONENT-003: should display cashier name only (not employee_id)", async () => {
    // GIVEN: API returns cashiers with employee_id
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockCashiers }),
    });

    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // WHEN: Cashier Name dropdown is clicked
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);

    // THEN: Only cashier name is displayed (not employee_id)
    // Note: Radix Select renders both a hidden native select and a visible dropdown
    await waitFor(() => {
      expect(screen.getAllByText("John Smith").length).toBeGreaterThan(0);
      // Employee ID should NOT be displayed
      expect(screen.queryByText("0001")).not.toBeInTheDocument();
    });
  });

  it("[P3] 4.91-COMPONENT-004: should call authenticate endpoint on form submit", async () => {
    // GIVEN: API returns cashiers and authenticate endpoint exists
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCashiers }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cashier_id: "cashier-1",
          employee_id: "0001",
          name: "John Smith",
        }),
      });

    const user = userEvent.setup();
    // NOTE: Do NOT pass onSubmit to test the internal authentication mutation
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // Wait for cashiers to load
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // WHEN: Form is filled and submitted
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);
    await waitFor(() => {
      expect(screen.getAllByText("John Smith").length).toBeGreaterThan(0);
    });
    // Click the SelectItem (role="option") in the dropdown
    const selectItems = screen.getAllByRole("option", { name: "John Smith" });
    await user.click(selectItems[0]);

    // Wait for the select to update with the selected value
    await waitFor(() => {
      expect(selectTrigger).toHaveTextContent("John Smith");
    });

    const pinInput = screen.getByTestId("pin-number-input");
    await user.type(pinInput, "1234");

    const submitButton = screen.getByTestId("terminal-auth-submit-button");
    await user.click(submitButton);

    // THEN: Authenticate endpoint is called
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          `/api/stores/${mockStoreId}/cashiers/authenticate`,
        ),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("1234"),
        }),
      );
    });
  });

  it("[P3] 4.91-COMPONENT-005: should handle authentication success and proceed to shift operations", async () => {
    // GIVEN: Authentication succeeds (no onSubmit prop = uses internal mutation)
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCashiers }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cashier_id: "cashier-1",
          employee_id: "0001",
          name: "John Smith",
        }),
      });

    const user = userEvent.setup();
    // NOTE: Do NOT pass onSubmit to test the internal authentication flow
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // WHEN: Form is submitted with valid credentials
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);
    await waitFor(() => {
      expect(screen.getAllByText("John Smith").length).toBeGreaterThan(0);
    });
    const selectItems = screen.getAllByRole("option", { name: "John Smith" });
    await user.click(selectItems[0]);

    // Wait for the select to update with the selected value
    await waitFor(() => {
      expect(selectTrigger).toHaveTextContent("John Smith");
    });

    const pinInput = screen.getByTestId("pin-number-input");
    await user.type(pinInput, "1234");

    const submitButton = screen.getByTestId("terminal-auth-submit-button");
    await user.click(submitButton);

    // THEN: Authenticate endpoint is called
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          `/api/stores/${mockStoreId}/cashiers/authenticate`,
        ),
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    // AND: Modal closes on success (proceeds to shift operations)
    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("[P3] 4.91-COMPONENT-006: should display error message on authentication failure", async () => {
    // GIVEN: Authentication fails
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCashiers }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Invalid credentials" }),
      });

    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // WHEN: Form is submitted with invalid credentials
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);
    await waitFor(() => {
      expect(screen.getAllByText("John Smith").length).toBeGreaterThan(0);
    });
    const selectItems = screen.getAllByRole("option", { name: "John Smith" });
    await user.click(selectItems[0]);

    // Wait for the select to update with the selected value
    await waitFor(() => {
      expect(selectTrigger).toHaveTextContent("John Smith");
    });

    const pinInput = screen.getByTestId("pin-number-input");
    await user.type(pinInput, "9999"); // Wrong PIN

    const submitButton = screen.getByTestId("terminal-auth-submit-button");
    await user.click(submitButton);

    // THEN: Error message is displayed
    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });

    // AND: Modal does NOT close
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("[P3] 4.91-COMPONENT-007: should handle API error when fetching cashiers", async () => {
    // GIVEN: API returns error when fetching cashiers
    (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

    // WHEN: Component is rendered
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Error is handled gracefully (component doesn't crash)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // AND: Component still renders (fallback to empty state or error message)
    expect(screen.getByTestId("terminal-auth-modal")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("[P0] 4.91-COMPONENT-SEC-001: should prevent XSS in cashier names", async () => {
    // GIVEN: API returns cashiers with potentially malicious names
    const maliciousCashiers = [
      {
        cashier_id: "cashier-1",
        employee_id: "0001",
        name: "<script>alert('XSS')</script>",
      },
      {
        cashier_id: "cashier-2",
        employee_id: "0002",
        name: "John<img src=x onerror=alert('XSS')>",
      },
    ];
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: maliciousCashiers }),
    });

    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // WHEN: Opening cashier dropdown
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);

    // THEN: Malicious content is escaped (not executed as script)
    // React renders the text content safely - we verify by checking the text appears
    // as displayable text (not executed). The native select shows HTML entities,
    // while Radix dropdown shows raw text safely.
    await waitFor(() => {
      // First: Assert that at least one representation of each malicious string exists
      // (either as escaped HTML entities or as literal-safe text)
      const scriptTexts = screen.queryAllByText(/<script>alert/i);
      const scriptEscaped = screen.queryByText(/&lt;script&gt;/i);
      const imgTexts = screen.queryAllByText(/John<img/i);
      const imgEscaped = screen.queryByText(/John&lt;img/i);

      // Assert presence: at least one representation must exist for script tag
      // This ensures the test fails if the malicious content is completely absent
      const hasScriptRepresentation =
        scriptTexts.length > 0 || scriptEscaped !== null;
      expect(hasScriptRepresentation).toBe(true);

      // Assert presence: at least one representation must exist for img tag
      // This ensures the test fails if the malicious content is completely absent
      const hasImgRepresentation = imgTexts.length > 0 || imgEscaped !== null;
      expect(hasImgRepresentation).toBe(true);

      // Second: Assert that no actual executable HTML elements were created
      // Query for actual <script> elements in the DOM
      const actualScriptElements = document.querySelectorAll("script");
      // Filter to only scripts that match our malicious content (not framework scripts)
      const maliciousScripts = Array.from(actualScriptElements).filter(
        (script) => script.textContent?.includes("alert('XSS')"),
      );
      // This ensures the test fails if real script elements were injected
      expect(maliciousScripts.length).toBe(0);

      // Query for actual <img> elements that might have been injected
      const actualImgElements = document.querySelectorAll("img");
      // Filter to only images that match our malicious content
      const maliciousImages = Array.from(actualImgElements).filter(
        (img) => img.getAttribute("src") === "x" || img.getAttribute("onerror"),
      );
      // This ensures the test fails if real img elements with malicious attributes were injected
      expect(maliciousImages.length).toBe(0);
    });

    // AND: Component doesn't crash
    expect(screen.getByTestId("terminal-auth-modal")).toBeInTheDocument();
  });

  it("[P0] 4.91-COMPONENT-SEC-002: should validate PIN format client-side", async () => {
    // GIVEN: API returns cashiers
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockCashiers }),
    });

    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // WHEN: Selecting a cashier and entering invalid PIN (3 digits)
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);
    await waitFor(() => {
      expect(screen.getAllByText("John Smith").length).toBeGreaterThan(0);
    });
    const selectItems = screen.getAllByRole("option", { name: "John Smith" });
    await user.click(selectItems[0]);

    // Wait for the select to update with the selected value
    await waitFor(() => {
      expect(selectTrigger).toHaveTextContent("John Smith");
    });

    const pinInput = screen.getByTestId("pin-number-input");
    await user.type(pinInput, "123"); // Invalid: only 3 digits

    // THEN: PIN input accepts the value
    expect(pinInput).toHaveValue("123");

    // WHEN: Attempting to submit the form
    const submitButton = screen.getByTestId("terminal-auth-submit-button");
    await user.click(submitButton);

    // THEN: Client-side validation error is displayed
    await waitFor(() => {
      expect(
        screen.getByText(/pin must be exactly 4 numeric digits/i),
      ).toBeInTheDocument();
    });

    // AND: Form submission is prevented (API is not called)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only the initial cashiers fetch
    });
  });

  it("[P0] 4.91-COMPONENT-SEC-003: should not expose sensitive data in error messages", async () => {
    // GIVEN: Authentication fails with detailed error
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockCashiers }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: "Invalid credentials",
          // Should NOT include: "Cashier not found", "PIN incorrect", etc.
        }),
      });

    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // WHEN: Submitting form with invalid credentials
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);
    await waitFor(() => {
      expect(screen.getAllByText("John Smith").length).toBeGreaterThan(0);
    });
    const selectItems = screen.getAllByRole("option", { name: "John Smith" });
    await user.click(selectItems[0]);

    // Wait for the select to update with the selected value
    await waitFor(() => {
      expect(selectTrigger).toHaveTextContent("John Smith");
    });

    const pinInput = screen.getByTestId("pin-number-input");
    await user.type(pinInput, "9999"); // Wrong PIN

    const submitButton = screen.getByTestId("terminal-auth-submit-button");
    await user.click(submitButton);

    // THEN: Error message is generic (doesn't reveal if cashier exists)
    await waitFor(() => {
      const errorMessage = screen.getByText(/invalid credentials/i);
      expect(
        errorMessage,
        "Error message should be displayed",
      ).toBeInTheDocument();

      // Verify error doesn't leak sensitive info
      expect(screen.queryByText(/cashier not found/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/pin incorrect/i)).not.toBeInTheDocument();
    });
  });

  it("[P3] 4.91-COMPONENT-008: should handle empty cashiers list gracefully", async () => {
    // GIVEN: API returns empty cashiers list
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // WHEN: Opening cashier dropdown
    const user = userEvent.setup();
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);

    // THEN: Component handles empty state gracefully
    await waitFor(() => {
      expect(screen.getByTestId("terminal-auth-modal")).toBeInTheDocument();
    });

    // AND: No cashiers are displayed (empty dropdown)
    expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
  });

  it("[P3] 4.91-COMPONENT-009: should handle very long cashier names", async () => {
    // GIVEN: API returns cashier with very long name
    const longNameCashiers = [
      {
        cashier_id: "cashier-1",
        employee_id: "0001",
        name: "A".repeat(300), // Very long name (exceeds 255 char limit)
      },
    ];
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: longNameCashiers }),
    });

    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        terminalName={mockTerminalName}
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // WHEN: Opening cashier dropdown
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);

    // THEN: Component handles long name (may truncate or wrap)
    await waitFor(() => {
      // Component should render without crashing
      expect(screen.getByTestId("terminal-auth-modal")).toBeInTheDocument();
    });
  });
});
