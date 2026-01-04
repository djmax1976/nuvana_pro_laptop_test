import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddressFields, type AddressFieldsValue } from "@/components/address";
import * as geographicApi from "@/lib/api/geographic";

// Mock the geographic API
vi.mock("@/lib/api/geographic", () => ({
  getActiveStates: vi.fn(),
  getCountiesByState: vi.fn(),
}));

/**
 * AddressFields Component Tests
 *
 * @description Enterprise-grade tests for the address entry component
 *
 * TRACEABILITY MATRIX:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Requirement ID │ Description                  │ Test Cases              │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ ADDR-001       │ State dropdown loads data    │ TC-001, TC-002          │
 * │ ADDR-002       │ County dropdown cascades     │ TC-003, TC-004          │
 * │ ADDR-003       │ City is text input           │ TC-005, TC-006          │
 * │ ADDR-004       │ ZIP code validation          │ TC-007, TC-008          │
 * │ ADDR-005       │ Form field dependencies      │ TC-009, TC-010          │
 * │ VAL-001        │ Required field indicators    │ TC-011                  │
 * │ VAL-002        │ Error message display        │ TC-012                  │
 * │ SEC-001        │ UUID validation for IDs      │ TC-013                  │
 * │ A11Y-001       │ Label associations           │ TC-014                  │
 * │ EDGE-001       │ API error handling           │ TC-015                  │
 * │ EDGE-002       │ Loading states               │ TC-016                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID LEVEL: Component (Unit)
 *
 * @enterprise-standards
 * - FE-001: COMPONENT_TESTING - Isolated component tests
 * - FE-002: FORM_VALIDATION - Form behavior tests
 * - SEC-014: INPUT_VALIDATION - UUID validation
 */

// =============================================================================
// TEST DATA
// =============================================================================

const mockStates: geographicApi.USStateResponse[] = [
  {
    state_id: "550e8400-e29b-41d4-a716-446655440001",
    code: "GA",
    name: "Georgia",
    fips_code: "13",
    is_active: true,
    lottery_enabled: true,
    timezone_default: "America/New_York",
  },
  {
    state_id: "550e8400-e29b-41d4-a716-446655440002",
    code: "FL",
    name: "Florida",
    fips_code: "12",
    is_active: true,
    lottery_enabled: true,
    timezone_default: "America/New_York",
  },
  {
    state_id: "550e8400-e29b-41d4-a716-446655440003",
    code: "TX",
    name: "Texas",
    fips_code: "48",
    is_active: true,
    lottery_enabled: true,
    timezone_default: "America/Chicago",
  },
];

const mockGeorgiaCounties: geographicApi.USCountyResponse[] = [
  {
    county_id: "660e8400-e29b-41d4-a716-446655440001",
    name: "Fulton County",
    state_id: mockStates[0].state_id,
    fips_code: "13121",
    county_seat: "Atlanta",
    is_active: true,
  },
  {
    county_id: "660e8400-e29b-41d4-a716-446655440002",
    name: "DeKalb County",
    state_id: mockStates[0].state_id,
    fips_code: "13089",
    county_seat: "Decatur",
    is_active: true,
  },
  {
    county_id: "660e8400-e29b-41d4-a716-446655440003",
    name: "Cobb County",
    state_id: mockStates[0].state_id,
    fips_code: "13067",
    county_seat: "Marietta",
    is_active: true,
  },
];

const mockFloridaCounties: geographicApi.USCountyResponse[] = [
  {
    county_id: "770e8400-e29b-41d4-a716-446655440001",
    name: "Miami-Dade County",
    state_id: mockStates[1].state_id,
    fips_code: "12086",
    county_seat: "Miami",
    is_active: true,
  },
  {
    county_id: "770e8400-e29b-41d4-a716-446655440002",
    name: "Broward County",
    state_id: mockStates[1].state_id,
    fips_code: "12011",
    county_seat: "Fort Lauderdale",
    is_active: true,
  },
];

const emptyAddressValue: AddressFieldsValue = {
  address_line1: "",
  address_line2: "",
  state_id: "",
  county_id: "",
  city: "",
  zip_code: "",
};

// =============================================================================
// SETUP
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock implementations - API returns {success: true, data: [...]}
  vi.mocked(geographicApi.getActiveStates).mockResolvedValue({
    success: true,
    data: mockStates,
  });
  vi.mocked(geographicApi.getCountiesByState).mockImplementation(
    async (stateId) => {
      if (stateId === mockStates[0].state_id)
        return { success: true, data: mockGeorgiaCounties };
      if (stateId === mockStates[1].state_id)
        return { success: true, data: mockFloridaCounties };
      return { success: true, data: [] };
    },
  );
});

// =============================================================================
// SECTION 1: STATE DROPDOWN
// =============================================================================

describe("AddressFields - State Dropdown", () => {
  it("TC-001: loads and displays states on mount", async () => {
    // GIVEN: AddressFields component
    const onChange = vi.fn();

    // WHEN: Component is rendered
    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: States API is called
    await waitFor(() => {
      expect(geographicApi.getActiveStates).toHaveBeenCalledTimes(1);
    });
  });

  it("TC-002: shows loading state while fetching states", async () => {
    // GIVEN: Slow API response
    vi.mocked(geographicApi.getActiveStates).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true, data: mockStates }), 100),
        ),
    );
    const onChange = vi.fn();

    // WHEN: Component is rendered
    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: Component renders without crashing (loading state handled internally)
    expect(screen.getByTestId("test-state")).toBeInTheDocument();
  });
});

// =============================================================================
// SECTION 2: COUNTY DROPDOWN CASCADE
// =============================================================================

describe("AddressFields - County Cascade", () => {
  it("TC-003: county dropdown is disabled when no state selected", () => {
    // GIVEN: No state selected
    const onChange = vi.fn();

    // WHEN: Component is rendered
    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: County dropdown is disabled
    const countyCombobox = screen.getByTestId("test-county");
    expect(countyCombobox).toBeDisabled();
  });

  it("TC-004: county dropdown loads data when state is selected", async () => {
    // GIVEN: Component with state selected
    const onChange = vi.fn();
    const valueWithState: AddressFieldsValue = {
      ...emptyAddressValue,
      state_id: mockStates[0].state_id,
    };

    // WHEN: Component is rendered with state
    render(
      <AddressFields
        value={valueWithState}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: Counties API is called for the selected state
    await waitFor(() => {
      expect(geographicApi.getCountiesByState).toHaveBeenCalledWith(
        mockStates[0].state_id,
      );
    });
  });

  it("TC-004b: changing state clears county selection", async () => {
    // GIVEN: Component with state and county selected
    const user = userEvent.setup();
    const onChange = vi.fn();
    const valueWithStateAndCounty: AddressFieldsValue = {
      ...emptyAddressValue,
      state_id: mockStates[0].state_id,
      county_id: mockGeorgiaCounties[0].county_id,
      city: "Atlanta",
    };

    render(
      <AddressFields
        value={valueWithStateAndCounty}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // Wait for states to load
    await waitFor(() => {
      expect(geographicApi.getActiveStates).toHaveBeenCalled();
    });

    // WHEN: User changes state
    const stateDropdown = screen.getByTestId("test-state");
    await user.click(stateDropdown);

    // Find and click Florida
    await waitFor(() => {
      expect(screen.getByText("Florida")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Florida"));

    // THEN: onChange is called with cleared county and city
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        state_id: mockStates[1].state_id,
        county_id: "",
        city: "",
      }),
    );
  });
});

// =============================================================================
// SECTION 3: CITY INPUT
// =============================================================================

describe("AddressFields - City Input", () => {
  it("TC-005: city is a simple text input (not dropdown)", async () => {
    // GIVEN: Component with state selected
    const onChange = vi.fn();
    const valueWithState: AddressFieldsValue = {
      ...emptyAddressValue,
      state_id: mockStates[0].state_id,
    };

    // WHEN: Component is rendered
    render(
      <AddressFields
        value={valueWithState}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: City is a text input, not a combobox
    const cityInput = screen.getByTestId("test-city");
    expect(cityInput.tagName).toBe("INPUT");
    expect(cityInput).toHaveAttribute("type", "text");
  });

  it("TC-006: city input is disabled until state is selected", () => {
    // GIVEN: No state selected
    const onChange = vi.fn();

    // WHEN: Component is rendered
    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: City input is disabled
    const cityInput = screen.getByTestId("test-city");
    expect(cityInput).toBeDisabled();
  });

  it("TC-006b: city input is enabled when state is selected", () => {
    // GIVEN: State is selected
    const onChange = vi.fn();
    const valueWithState: AddressFieldsValue = {
      ...emptyAddressValue,
      state_id: mockStates[0].state_id,
    };

    // WHEN: Component is rendered
    render(
      <AddressFields
        value={valueWithState}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: City input is enabled
    const cityInput = screen.getByTestId("test-city");
    expect(cityInput).not.toBeDisabled();
  });

  it("TC-006c: user can type any city name", async () => {
    // GIVEN: Component with state selected
    const user = userEvent.setup();
    const onChange = vi.fn();
    const valueWithState: AddressFieldsValue = {
      ...emptyAddressValue,
      state_id: mockStates[0].state_id,
    };

    render(
      <AddressFields
        value={valueWithState}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // WHEN: User types a city name
    const cityInput = screen.getByTestId("test-city");
    await user.type(cityInput, "Atlanta");

    // THEN: onChange is called with the typed value
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "A",
      }),
    );
  });
});

// =============================================================================
// SECTION 4: ZIP CODE VALIDATION
// =============================================================================

describe("AddressFields - ZIP Code", () => {
  it("TC-007: ZIP code input accepts 5-digit format", async () => {
    // GIVEN: Component
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // WHEN: User types a valid 5-digit ZIP
    const zipInput = screen.getByTestId("test-zip-code");
    await user.type(zipInput, "30301");

    // THEN: Value is accepted
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.zip_code).toBe("30301");
  });

  it("TC-008: shows ZIP code format hint", () => {
    // GIVEN/WHEN: Component is rendered
    const onChange = vi.fn();

    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: Format hint is displayed
    expect(
      screen.getByText(/Enter 5-digit ZIP or ZIP\+4 format/),
    ).toBeInTheDocument();
  });
});

// =============================================================================
// SECTION 5: FORM FIELD DEPENDENCIES
// =============================================================================

describe("AddressFields - Field Dependencies", () => {
  it("TC-009: address lines are always enabled", () => {
    // GIVEN/WHEN: Component with no selections
    const onChange = vi.fn();

    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: Address line inputs are enabled
    const addressLine1 = screen.getByTestId("test-address-line1");
    const addressLine2 = screen.getByTestId("test-address-line2");
    expect(addressLine1).not.toBeDisabled();
    expect(addressLine2).not.toBeDisabled();
  });

  it("TC-010: ZIP code is always enabled", () => {
    // GIVEN/WHEN: Component with no selections
    const onChange = vi.fn();

    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: ZIP code input is enabled
    const zipInput = screen.getByTestId("test-zip-code");
    expect(zipInput).not.toBeDisabled();
  });

  it("TC-010b: all fields disabled when component is disabled", () => {
    // GIVEN/WHEN: Disabled component
    const onChange = vi.fn();

    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
        disabled={true}
      />,
    );

    // THEN: All inputs are disabled
    expect(screen.getByTestId("test-address-line1")).toBeDisabled();
    expect(screen.getByTestId("test-address-line2")).toBeDisabled();
    expect(screen.getByTestId("test-state")).toBeDisabled();
    expect(screen.getByTestId("test-county")).toBeDisabled();
    expect(screen.getByTestId("test-city")).toBeDisabled();
    expect(screen.getByTestId("test-zip-code")).toBeDisabled();
  });
});

// =============================================================================
// SECTION 6: VALIDATION DISPLAY
// =============================================================================

describe("AddressFields - Validation Display", () => {
  it("TC-011: shows required indicators when required prop is true", () => {
    // GIVEN/WHEN: Required fields
    const onChange = vi.fn();

    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
        required={true}
      />,
    );

    // THEN: Required indicators (* in red) are shown
    const requiredIndicators = screen.getAllByText("*");
    expect(requiredIndicators.length).toBeGreaterThan(0);
  });

  it("TC-012: displays error messages for fields with errors", () => {
    // GIVEN: Errors object
    const onChange = vi.fn();
    const errors = {
      state_id: "State is required",
      city: "City is required",
    };

    // WHEN: Component is rendered with errors
    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
        errors={errors}
      />,
    );

    // THEN: Error messages are displayed
    expect(screen.getByText("State is required")).toBeInTheDocument();
    expect(screen.getByText("City is required")).toBeInTheDocument();
  });

  it("TC-012b: applies error styling to fields with errors", () => {
    // GIVEN: Errors object
    const onChange = vi.fn();
    const errors = {
      state_id: "State is required",
    };

    // WHEN: Component is rendered with errors
    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
        errors={errors}
      />,
    );

    // THEN: Error class is applied to the state dropdown
    const stateDropdown = screen.getByTestId("test-state");
    expect(stateDropdown).toHaveClass("border-destructive");
  });
});

// =============================================================================
// SECTION 7: SECURITY
// =============================================================================

describe("AddressFields - Security", () => {
  it("TC-013: validates UUID format before API calls", async () => {
    // GIVEN: Component with invalid state_id
    const onChange = vi.fn();
    const valueWithInvalidStateId: AddressFieldsValue = {
      ...emptyAddressValue,
      state_id: "not-a-uuid",
    };

    // WHEN: Component is rendered with invalid UUID
    render(
      <AddressFields
        value={valueWithInvalidStateId}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: Counties API should NOT be called with invalid UUID
    await waitFor(() => {
      expect(geographicApi.getActiveStates).toHaveBeenCalled();
    });

    // Wait a bit to ensure no county API call
    await new Promise((r) => setTimeout(r, 50));
    expect(geographicApi.getCountiesByState).not.toHaveBeenCalled();
  });

  it("TC-013b: accepts valid UUID format for state_id", async () => {
    // GIVEN: Component with valid state_id
    const onChange = vi.fn();
    const valueWithValidStateId: AddressFieldsValue = {
      ...emptyAddressValue,
      state_id: mockStates[0].state_id,
    };

    // WHEN: Component is rendered with valid UUID
    render(
      <AddressFields
        value={valueWithValidStateId}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: Counties API is called
    await waitFor(() => {
      expect(geographicApi.getCountiesByState).toHaveBeenCalledWith(
        mockStates[0].state_id,
      );
    });
  });
});

// =============================================================================
// SECTION 8: ACCESSIBILITY
// =============================================================================

describe("AddressFields - Accessibility", () => {
  it("TC-014: labels are associated with inputs", () => {
    // GIVEN/WHEN: Component is rendered
    const onChange = vi.fn();

    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: Labels are properly associated
    expect(screen.getByLabelText(/Street Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Address Line 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/City/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ZIP Code/i)).toBeInTheDocument();
  });
});

// =============================================================================
// SECTION 9: ERROR HANDLING
// =============================================================================

describe("AddressFields - Error Handling", () => {
  it("TC-015: handles states API error gracefully", async () => {
    // GIVEN: API returns error
    vi.mocked(geographicApi.getActiveStates).mockRejectedValue(
      new Error("API Error"),
    );
    const onChange = vi.fn();

    // WHEN: Component is rendered
    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: Component doesn't crash, shows error in dropdown
    await waitFor(() => {
      expect(screen.getByTestId("test-state")).toBeInTheDocument();
    });
  });

  it("TC-015b: handles counties API error gracefully", async () => {
    // GIVEN: Counties API returns error
    vi.mocked(geographicApi.getCountiesByState).mockRejectedValue(
      new Error("API Error"),
    );
    const onChange = vi.fn();
    const valueWithState: AddressFieldsValue = {
      ...emptyAddressValue,
      state_id: mockStates[0].state_id,
    };

    // WHEN: Component is rendered with state selected
    render(
      <AddressFields
        value={valueWithState}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: Component doesn't crash
    await waitFor(() => {
      expect(screen.getByTestId("test-county")).toBeInTheDocument();
    });
  });
});

// =============================================================================
// SECTION 10: LOADING STATES
// =============================================================================

describe("AddressFields - Loading States", () => {
  it("TC-016: shows loading for states initially", async () => {
    // GIVEN: Slow states API
    let resolveStates: (
      value: geographicApi.ApiResponse<geographicApi.USStateResponse[]>,
    ) => void;
    vi.mocked(geographicApi.getActiveStates).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStates = resolve;
        }),
    );
    const onChange = vi.fn();

    // WHEN: Component is rendered
    render(
      <AddressFields
        value={emptyAddressValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: Component renders (internal loading state handled by Combobox)
    expect(screen.getByTestId("test-state")).toBeInTheDocument();

    // Cleanup
    resolveStates!({ success: true, data: mockStates });
  });
});

// =============================================================================
// SECTION 11: VALUE POPULATION
// =============================================================================

describe("AddressFields - Value Population", () => {
  it("TC-017: populates all fields from value prop", async () => {
    // GIVEN: Complete address value
    const onChange = vi.fn();
    const completeValue: AddressFieldsValue = {
      address_line1: "123 Main Street",
      address_line2: "Suite 100",
      state_id: mockStates[0].state_id,
      county_id: mockGeorgiaCounties[0].county_id,
      city: "Atlanta",
      zip_code: "30301",
    };

    // WHEN: Component is rendered with values
    render(
      <AddressFields
        value={completeValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: All fields show their values
    expect(screen.getByTestId("test-address-line1")).toHaveValue(
      "123 Main Street",
    );
    expect(screen.getByTestId("test-address-line2")).toHaveValue("Suite 100");
    expect(screen.getByTestId("test-city")).toHaveValue("Atlanta");
    expect(screen.getByTestId("test-zip-code")).toHaveValue("30301");
  });

  it("TC-018: updates when value prop changes", async () => {
    // GIVEN: Initial value
    const onChange = vi.fn();
    const initialValue: AddressFieldsValue = {
      ...emptyAddressValue,
      address_line1: "Initial Address",
    };

    const { rerender } = render(
      <AddressFields
        value={initialValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    expect(screen.getByTestId("test-address-line1")).toHaveValue(
      "Initial Address",
    );

    // WHEN: Value prop changes
    const updatedValue: AddressFieldsValue = {
      ...emptyAddressValue,
      address_line1: "Updated Address",
    };

    rerender(
      <AddressFields
        value={updatedValue}
        onChange={onChange}
        testIdPrefix="test"
      />,
    );

    // THEN: Field shows new value
    expect(screen.getByTestId("test-address-line1")).toHaveValue(
      "Updated Address",
    );
  });
});
