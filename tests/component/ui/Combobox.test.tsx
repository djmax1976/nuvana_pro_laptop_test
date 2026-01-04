import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

/**
 * Combobox Component Tests
 *
 * @description Enterprise-grade tests for the searchable dropdown component
 *
 * TRACEABILITY MATRIX:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Requirement ID │ Description                  │ Test Cases              │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ UI-001         │ Click to open dropdown       │ TC-001, TC-002          │
 * │ UI-002         │ Show all options on open     │ TC-003                  │
 * │ UI-003         │ Type to filter instantly     │ TC-004, TC-005          │
 * │ UI-004         │ Select option                │ TC-006, TC-007          │
 * │ UI-005         │ Keyboard navigation          │ TC-008, TC-009          │
 * │ A11Y-001       │ ARIA attributes              │ TC-010, TC-011          │
 * │ A11Y-002       │ Screen reader support        │ TC-012                  │
 * │ SEC-001        │ XSS prevention in options    │ TC-013                  │
 * │ EDGE-001       │ Empty options handling       │ TC-014                  │
 * │ EDGE-002       │ Loading state                │ TC-015                  │
 * │ EDGE-003       │ Disabled state               │ TC-016                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID LEVEL: Component (Unit)
 *
 * @enterprise-standards
 * - FE-001: COMPONENT_TESTING - Isolated component tests
 * - A11Y-001: ACCESSIBILITY - WCAG 2.1 AA compliance
 * - SEC-014: INPUT_VALIDATION - XSS prevention
 */

// =============================================================================
// TEST DATA
// =============================================================================

const mockStates: ComboboxOption[] = [
  { value: "state-ga", label: "Georgia" },
  { value: "state-fl", label: "Florida" },
  { value: "state-tx", label: "Texas" },
  { value: "state-ca", label: "California" },
  { value: "state-ny", label: "New York" },
];

const mockCounties: ComboboxOption[] = [
  { value: "county-fulton", label: "Fulton County" },
  { value: "county-dekalb", label: "DeKalb County" },
  { value: "county-cobb", label: "Cobb County" },
];

// =============================================================================
// SECTION 1: BASIC RENDERING
// =============================================================================

describe("Combobox - Basic Rendering", () => {
  it("TC-001: renders with placeholder when no value selected", () => {
    // GIVEN: A combobox with no initial value
    const onValueChange = vi.fn();

    // WHEN: Component is rendered
    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    // THEN: Placeholder is displayed
    expect(screen.getByText("Select a state...")).toBeInTheDocument();
  });

  it("TC-002: renders with selected value label", () => {
    // GIVEN: A combobox with a pre-selected value
    const onValueChange = vi.fn();

    // WHEN: Component is rendered with a value
    render(
      <Combobox
        value="state-ga"
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    // THEN: Selected option label is displayed
    expect(screen.getByText("Georgia")).toBeInTheDocument();
  });

  it("TC-003: displays all options when dropdown opens", async () => {
    // GIVEN: A combobox with multiple options
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    // WHEN: User clicks to open dropdown
    await user.click(screen.getByRole("combobox"));

    // THEN: All options are visible
    await waitFor(() => {
      expect(screen.getByText("Georgia")).toBeInTheDocument();
      expect(screen.getByText("Florida")).toBeInTheDocument();
      expect(screen.getByText("Texas")).toBeInTheDocument();
      expect(screen.getByText("California")).toBeInTheDocument();
      expect(screen.getByText("New York")).toBeInTheDocument();
    });
  });
});

// =============================================================================
// SECTION 2: FILTERING BEHAVIOR
// =============================================================================

describe("Combobox - Instant Filtering", () => {
  it("TC-004: filters options instantly as user types", async () => {
    // GIVEN: An open combobox with multiple options
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    // WHEN: User opens dropdown and types a filter
    await user.click(screen.getByRole("combobox"));
    const searchInput = screen.getByRole("textbox");
    await user.type(searchInput, "geo");

    // THEN: Only matching options are shown (instant, no debounce)
    await waitFor(() => {
      expect(screen.getByText("Georgia")).toBeInTheDocument();
      expect(screen.queryByText("Florida")).not.toBeInTheDocument();
      expect(screen.queryByText("Texas")).not.toBeInTheDocument();
    });
  });

  it("TC-005: filter is case-insensitive", async () => {
    // GIVEN: An open combobox
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    // WHEN: User types lowercase search for uppercase option
    await user.click(screen.getByRole("combobox"));
    const searchInput = screen.getByRole("textbox");
    await user.type(searchInput, "NEW YORK");

    // THEN: Match is found (case-insensitive)
    await waitFor(() => {
      expect(screen.getByText("New York")).toBeInTheDocument();
    });
  });

  it("TC-005b: shows empty message when no matches found", async () => {
    // GIVEN: An open combobox
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
        emptyMessage="No states found"
      />,
    );

    // WHEN: User types a non-matching search
    await user.click(screen.getByRole("combobox"));
    const searchInput = screen.getByRole("textbox");
    await user.type(searchInput, "xyz");

    // THEN: Empty message is shown
    await waitFor(() => {
      expect(screen.getByText("No states found")).toBeInTheDocument();
    });
  });
});

// =============================================================================
// SECTION 3: SELECTION BEHAVIOR
// =============================================================================

describe("Combobox - Selection", () => {
  it("TC-006: calls onValueChange when option is selected", async () => {
    // GIVEN: An open combobox
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    // WHEN: User selects an option
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Georgia"));

    // THEN: onValueChange is called with the value
    expect(onValueChange).toHaveBeenCalledWith("state-ga");
  });

  it("TC-007: closes dropdown after selection", async () => {
    // GIVEN: An open combobox
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    // WHEN: User selects an option
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Florida"));

    // THEN: Dropdown is closed
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("TC-007b: clears selection when clicking already selected option", async () => {
    // GIVEN: A combobox with a selected value
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value="state-ga"
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    // WHEN: User clicks the already selected option
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Georgia"));

    // THEN: onValueChange is called with empty string (deselection)
    expect(onValueChange).toHaveBeenCalledWith("");
  });
});

// =============================================================================
// SECTION 4: KEYBOARD NAVIGATION
// =============================================================================

describe("Combobox - Keyboard Navigation", () => {
  it("TC-008: closes dropdown on Escape key", async () => {
    // GIVEN: An open combobox
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    // WHEN: User opens dropdown and presses Escape
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    // THEN: Dropdown is closed
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("TC-009: selects single match on Enter key", async () => {
    // GIVEN: An open combobox with filtered single result
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    // WHEN: User filters to single result and presses Enter
    await user.click(screen.getByRole("combobox"));
    const searchInput = screen.getByRole("textbox");
    await user.type(searchInput, "georgia");
    await user.keyboard("{Enter}");

    // THEN: Single match is selected
    expect(onValueChange).toHaveBeenCalledWith("state-ga");
  });
});

// =============================================================================
// SECTION 5: ACCESSIBILITY
// =============================================================================

describe("Combobox - Accessibility", () => {
  it("TC-010: has correct ARIA role and attributes", () => {
    // GIVEN/WHEN: Component is rendered
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
        testId="state-select"
      />,
    );

    // THEN: Correct ARIA attributes are present
    const combobox = screen.getByRole("combobox");
    expect(combobox).toHaveAttribute("aria-expanded", "false");
    expect(combobox).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("TC-011: aria-expanded updates when dropdown opens", async () => {
    // GIVEN: A closed combobox
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    const combobox = screen.getByRole("combobox");
    expect(combobox).toHaveAttribute("aria-expanded", "false");

    // WHEN: User opens dropdown
    await user.click(combobox);

    // THEN: aria-expanded is true
    expect(combobox).toHaveAttribute("aria-expanded", "true");
  });

  it("TC-012: dropdown has listbox role for screen readers", async () => {
    // GIVEN: An open combobox
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select a state..."
      />,
    );

    // WHEN: Dropdown is opened
    await user.click(screen.getByRole("combobox"));

    // THEN: Dropdown has listbox role
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});

// =============================================================================
// SECTION 6: SECURITY
// =============================================================================

describe("Combobox - Security", () => {
  it("TC-013: XSS prevention - HTML in option labels is escaped", async () => {
    // GIVEN: Options with potential XSS content
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const xssOptions: ComboboxOption[] = [
      { value: "xss", label: "<script>alert('xss')</script>" },
      { value: "normal", label: "Normal Option" },
    ];

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={xssOptions}
        placeholder="Select..."
      />,
    );

    // WHEN: Dropdown is opened
    await user.click(screen.getByRole("combobox"));

    // THEN: XSS content is rendered as text, not executed
    // React automatically escapes content, so the script tag appears as text
    const xssElement = screen.getByText("<script>alert('xss')</script>");
    expect(xssElement).toBeInTheDocument();
    expect(xssElement.tagName).not.toBe("SCRIPT");
  });
});

// =============================================================================
// SECTION 7: EDGE CASES
// =============================================================================

describe("Combobox - Edge Cases", () => {
  it("TC-014: handles empty options array", async () => {
    // GIVEN: A combobox with no options
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={[]}
        placeholder="Select..."
        emptyMessage="No options available"
      />,
    );

    // WHEN: Dropdown is opened
    await user.click(screen.getByRole("combobox"));

    // THEN: Empty message is shown
    expect(screen.getByText("No options available")).toBeInTheDocument();
  });

  it("TC-015: displays loading state correctly", async () => {
    // GIVEN: A combobox in loading state
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={[]}
        placeholder="Select..."
        isLoading={true}
      />,
    );

    // WHEN: Dropdown is opened
    await user.click(screen.getByRole("combobox"));

    // THEN: Loading indicator is shown
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("TC-016: disabled state prevents interaction", async () => {
    // GIVEN: A disabled combobox
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select..."
        disabled={true}
      />,
    );

    // WHEN: User tries to click
    await user.click(screen.getByRole("combobox"));

    // THEN: Dropdown does not open
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("TC-017: closes on click outside", async () => {
    // GIVEN: An open combobox
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <div>
        <Combobox
          value=""
          onValueChange={onValueChange}
          options={mockStates}
          placeholder="Select..."
        />
        <button data-testid="outside-element">Outside</button>
      </div>,
    );

    // WHEN: Dropdown is opened and user clicks outside
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // Click outside using mousedown event (matches component behavior)
    fireEvent.mouseDown(screen.getByTestId("outside-element"));

    // THEN: Dropdown closes
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("TC-018: handles disabled options", async () => {
    // GIVEN: Options with some disabled
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const optionsWithDisabled: ComboboxOption[] = [
      { value: "a", label: "Option A" },
      { value: "b", label: "Option B (Disabled)", disabled: true },
      { value: "c", label: "Option C" },
    ];

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={optionsWithDisabled}
        placeholder="Select..."
      />,
    );

    // WHEN: Dropdown is opened
    await user.click(screen.getByRole("combobox"));

    // THEN: Disabled option is visible but has disabled styling
    const disabledButton = screen
      .getByText("Option B (Disabled)")
      .closest("button");
    expect(disabledButton).toBeDisabled();
  });

  it("TC-019: applies custom className", () => {
    // GIVEN: A combobox with custom className
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select..."
        className="custom-class"
        testId="custom-combobox"
      />,
    );

    // THEN: Custom class is applied
    const combobox = screen.getByTestId("custom-combobox");
    expect(combobox).toHaveClass("custom-class");
  });

  it("TC-020: search clears when dropdown closes", async () => {
    // GIVEN: An open combobox with search text
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select..."
      />,
    );

    // WHEN: User opens, types, then closes
    await user.click(screen.getByRole("combobox"));
    const searchInput = screen.getByRole("textbox");
    await user.type(searchInput, "geo");
    await user.keyboard("{Escape}");

    // THEN: Re-opening shows all options (search was cleared)
    await user.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByText("Georgia")).toBeInTheDocument();
      expect(screen.getByText("Florida")).toBeInTheDocument();
    });
  });
});

// =============================================================================
// SECTION 8: TEST ID SUPPORT
// =============================================================================

describe("Combobox - Test IDs", () => {
  it("TC-021: applies testId to trigger button", () => {
    // GIVEN/WHEN: Component with testId
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select..."
        testId="my-combobox"
      />,
    );

    // THEN: testId is applied
    expect(screen.getByTestId("my-combobox")).toBeInTheDocument();
  });

  it("TC-022: applies testId to search input when open", async () => {
    // GIVEN: Component with testId
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select..."
        testId="my-combobox"
      />,
    );

    // WHEN: Dropdown is opened
    await user.click(screen.getByRole("combobox"));

    // THEN: Input has derived testId
    expect(screen.getByTestId("my-combobox-input")).toBeInTheDocument();
  });

  it("TC-023: applies testId to option buttons", async () => {
    // GIVEN: Component with testId
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Combobox
        value=""
        onValueChange={onValueChange}
        options={mockStates}
        placeholder="Select..."
        testId="my-combobox"
      />,
    );

    // WHEN: Dropdown is opened
    await user.click(screen.getByRole("combobox"));

    // THEN: Options have derived testIds
    expect(
      screen.getByTestId("my-combobox-option-state-ga"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("my-combobox-option-state-fl"),
    ).toBeInTheDocument();
  });
});
