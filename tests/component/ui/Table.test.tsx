import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  useTableContext,
  type TableSize,
} from "@/components/ui/table";

/**
 * Table Component Tests
 *
 * @description Enterprise-grade tests for the Table component with size variants
 *
 * TRACEABILITY MATRIX:
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ Requirement ID │ Description                  │ Test Cases                   │
 * ├──────────────────────────────────────────────────────────────────────────────┤
 * │ DS-001         │ Default size rendering       │ TC-001, TC-002, TC-002b      │
 * │ DS-002         │ Compact size rendering       │ TC-003, TC-004               │
 * │ DS-003         │ Dense size rendering         │ TC-005, TC-006               │
 * │ DS-004         │ Context propagation          │ TC-007, TC-008               │
 * │ DS-005         │ Custom className support     │ TC-009, TC-010               │
 * │ DS-006         │ Nested table independence    │ TC-011, TC-011b, TC-011c     │
 * │ A11Y-001       │ Table accessibility          │ TC-012, TC-013, TC-013b      │
 * │ TOKEN-001      │ Design token application     │ TC-014, TC-015, TC-016       │
 * │ STRUCT-001     │ Table structure components   │ TC-017, TC-018, TC-019, TC-020│
 * │ EDGE-001       │ Edge cases & error handling  │ TC-021 to TC-028             │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID LEVEL: Component (Unit)
 * TEST COUNT: 35 tests
 *
 * @enterprise-standards
 * - FE-001: COMPONENT_TESTING - Isolated component tests
 * - DS-001: DESIGN_SYSTEM - Semantic token usage
 * - A11Y-001: ACCESSIBILITY - WCAG 2.1 AA compliance
 * - EDGE-001: ERROR_HANDLING - Edge case coverage
 */

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Helper component to test context value
 */
function ContextReader({ onSize }: { onSize: (size: TableSize) => void }) {
  const { size } = useTableContext();
  onSize(size);
  return <td data-testid="context-reader">{size}</td>;
}

/**
 * Renders a basic table structure for testing
 */
function renderTable(
  size?: TableSize,
  additionalProps?: Record<string, unknown>,
) {
  return render(
    <Table size={size} {...additionalProps}>
      <TableHeader>
        <TableRow>
          <TableHead data-testid="table-head">Header</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell data-testid="table-cell">Cell</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

// =============================================================================
// SECTION 1: DEFAULT SIZE RENDERING
// =============================================================================

describe("Table - Default Size", () => {
  it("TC-001: renders with default size when no size prop provided", () => {
    // GIVEN/WHEN: Table is rendered without size prop
    renderTable();

    // THEN: Table renders successfully
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByTestId("table-head")).toBeInTheDocument();
    expect(screen.getByTestId("table-cell")).toBeInTheDocument();
  });

  it("TC-002: applies default size token classes to TableHead", () => {
    // GIVEN/WHEN: Table is rendered with default size
    renderTable("default");

    // THEN: TableHead has default size classes
    const head = screen.getByTestId("table-head");
    expect(head).toHaveClass("h-table-header-default");
    expect(head).toHaveClass("px-table-cell-x-default");
    expect(head).toHaveClass("py-table-cell-y-default");
  });

  it("TC-002b: applies default size token classes to TableCell", () => {
    // GIVEN/WHEN: Table is rendered with default size
    renderTable("default");

    // THEN: TableCell has default size classes
    const cell = screen.getByTestId("table-cell");
    expect(cell).toHaveClass("py-table-cell-y-default");
    expect(cell).toHaveClass("px-table-cell-x-default");
  });
});

// =============================================================================
// SECTION 2: COMPACT SIZE RENDERING
// =============================================================================

describe("Table - Compact Size", () => {
  it("TC-003: applies compact size token classes to TableHead", () => {
    // GIVEN/WHEN: Table is rendered with compact size
    renderTable("compact");

    // THEN: TableHead has compact size classes
    const head = screen.getByTestId("table-head");
    expect(head).toHaveClass("h-table-header-compact");
    expect(head).toHaveClass("px-table-cell-x-compact");
    expect(head).toHaveClass("py-table-cell-y-compact");
  });

  it("TC-004: applies compact size token classes to TableCell", () => {
    // GIVEN/WHEN: Table is rendered with compact size
    renderTable("compact");

    // THEN: TableCell has compact size classes
    const cell = screen.getByTestId("table-cell");
    expect(cell).toHaveClass("py-table-cell-y-compact");
    expect(cell).toHaveClass("px-table-cell-x-compact");
  });
});

// =============================================================================
// SECTION 3: DENSE SIZE RENDERING
// =============================================================================

describe("Table - Dense Size", () => {
  it("TC-005: applies dense size token classes to TableHead", () => {
    // GIVEN/WHEN: Table is rendered with dense size
    renderTable("dense");

    // THEN: TableHead has dense size classes
    const head = screen.getByTestId("table-head");
    expect(head).toHaveClass("h-table-header-dense");
    expect(head).toHaveClass("px-table-cell-x-dense");
    expect(head).toHaveClass("py-table-cell-y-dense");
  });

  it("TC-006: applies dense size token classes to TableCell", () => {
    // GIVEN/WHEN: Table is rendered with dense size
    renderTable("dense");

    // THEN: TableCell has dense size classes
    const cell = screen.getByTestId("table-cell");
    expect(cell).toHaveClass("py-table-cell-y-dense");
    expect(cell).toHaveClass("px-table-cell-x-dense");
  });
});

// =============================================================================
// SECTION 4: CONTEXT PROPAGATION
// =============================================================================

describe("Table - Context Propagation", () => {
  it("TC-007: provides size context to child components", () => {
    // GIVEN: A variable to capture the context size
    let capturedSize: TableSize | undefined;

    // WHEN: Table renders with a context reader
    render(
      <Table size="compact">
        <TableBody>
          <TableRow>
            <ContextReader onSize={(size) => (capturedSize = size)} />
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: Context provides the correct size
    expect(capturedSize).toBe("compact");
  });

  it("TC-008: context defaults to 'default' when size prop not provided", () => {
    // GIVEN: A variable to capture the context size
    let capturedSize: TableSize | undefined;

    // WHEN: Table renders without size prop
    render(
      <Table>
        <TableBody>
          <TableRow>
            <ContextReader onSize={(size) => (capturedSize = size)} />
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: Context defaults to 'default'
    expect(capturedSize).toBe("default");
  });
});

// =============================================================================
// SECTION 5: CUSTOM CLASS SUPPORT
// =============================================================================

describe("Table - Custom Classes", () => {
  it("TC-009: allows custom className on TableHead without overriding size classes", () => {
    // GIVEN/WHEN: TableHead with custom class
    render(
      <Table size="compact">
        <TableHeader>
          <TableRow>
            <TableHead
              className="text-center font-bold"
              data-testid="custom-head"
            >
              Header
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: Both custom and size classes are applied
    const head = screen.getByTestId("custom-head");
    expect(head).toHaveClass("text-center");
    expect(head).toHaveClass("font-bold");
    expect(head).toHaveClass("h-table-header-compact");
  });

  it("TC-010: allows custom className on TableCell without overriding size classes", () => {
    // GIVEN/WHEN: TableCell with custom class
    render(
      <Table size="dense">
        <TableHeader>
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-mono text-sm" data-testid="custom-cell">
              Cell
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: Both custom and size classes are applied
    const cell = screen.getByTestId("custom-cell");
    expect(cell).toHaveClass("font-mono");
    expect(cell).toHaveClass("text-sm");
    expect(cell).toHaveClass("py-table-cell-y-dense");
  });
});

// =============================================================================
// SECTION 6: NESTED TABLE INDEPENDENCE
// =============================================================================

describe("Table - Nested Tables", () => {
  it("TC-011: nested tables can have different size variants", () => {
    // GIVEN/WHEN: Outer table with compact, inner table with dense
    render(
      <Table size="compact">
        <TableHeader>
          <TableRow>
            <TableHead data-testid="outer-head">Outer Header</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell data-testid="outer-cell">
              <Table size="dense">
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="inner-head">Inner Header</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell data-testid="inner-cell">Inner Cell</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: Outer table has compact classes
    const outerHead = screen.getByTestId("outer-head");
    expect(outerHead).toHaveClass("h-table-header-compact");

    // AND: Inner table has dense classes (independent context)
    const innerHead = screen.getByTestId("inner-head");
    expect(innerHead).toHaveClass("h-table-header-dense");

    const innerCell = screen.getByTestId("inner-cell");
    expect(innerCell).toHaveClass("py-table-cell-y-dense");
  });

  it("TC-011b: nested prop removes wrapper div for nested tables", () => {
    // GIVEN/WHEN: Table with nested prop
    const { container } = render(
      <Table size="dense" nested data-testid="nested-table">
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: Table is rendered without wrapper div
    const table = screen.getByTestId("nested-table");
    // The table's parent should NOT be the overflow-auto div
    expect(table.parentElement?.className).not.toContain("overflow-auto");
  });

  it("TC-011c: non-nested table has wrapper div", () => {
    // GIVEN/WHEN: Table without nested prop
    render(
      <Table size="compact" data-testid="regular-table">
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: Table is wrapped in overflow-auto div
    const table = screen.getByTestId("regular-table");
    expect(table.parentElement?.className).toContain("overflow-auto");
  });
});

// =============================================================================
// SECTION 7: ACCESSIBILITY
// =============================================================================

describe("Table - Accessibility", () => {
  it("TC-012: renders with correct table semantic role", () => {
    // GIVEN/WHEN: Table is rendered
    renderTable();

    // THEN: Table element has table role
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("TC-013: TableHead renders as th elements", () => {
    // GIVEN/WHEN: Table with TableHead
    renderTable();

    // THEN: TableHead is a th element
    const head = screen.getByTestId("table-head");
    expect(head.tagName).toBe("TH");
  });

  it("TC-013b: TableCell renders as td elements", () => {
    // GIVEN/WHEN: Table with TableCell
    renderTable();

    // THEN: TableCell is a td element
    const cell = screen.getByTestId("table-cell");
    expect(cell.tagName).toBe("TD");
  });
});

// =============================================================================
// SECTION 8: DESIGN TOKEN VERIFICATION
// =============================================================================

describe("Table - Design Tokens", () => {
  it("TC-014: default size uses correct token class names", () => {
    // GIVEN/WHEN: Table with default size
    renderTable("default");

    // THEN: Uses semantic token class names (not raw Tailwind)
    const head = screen.getByTestId("table-head");
    const cell = screen.getByTestId("table-cell");

    // Verify token-based classes are used
    expect(head.className).toMatch(/table-header-default/);
    expect(head.className).toMatch(/table-cell-x-default/);
    expect(head.className).toMatch(/table-cell-y-default/);
    expect(cell.className).toMatch(/table-cell-y-default/);
    expect(cell.className).toMatch(/table-cell-x-default/);
  });

  it("TC-015: compact size uses correct token class names", () => {
    // GIVEN/WHEN: Table with compact size
    renderTable("compact");

    // THEN: Uses semantic token class names
    const head = screen.getByTestId("table-head");
    const cell = screen.getByTestId("table-cell");

    expect(head.className).toMatch(/table-header-compact/);
    expect(cell.className).toMatch(/table-cell-y-compact/);
    expect(cell.className).toMatch(/table-cell-x-compact/);
  });

  it("TC-016: dense size uses correct token class names", () => {
    // GIVEN/WHEN: Table with dense size
    renderTable("dense");

    // THEN: Uses semantic token class names
    const head = screen.getByTestId("table-head");
    const cell = screen.getByTestId("table-cell");

    expect(head.className).toMatch(/table-header-dense/);
    expect(cell.className).toMatch(/table-cell-y-dense/);
    expect(cell.className).toMatch(/table-cell-x-dense/);
  });
});

// =============================================================================
// SECTION 9: OTHER TABLE COMPONENTS
// =============================================================================

describe("Table - Other Components", () => {
  it("TC-017: TableHeader renders correctly", () => {
    // GIVEN/WHEN: Table with TableHeader
    render(
      <Table>
        <TableHeader data-testid="table-header">
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: TableHeader is a thead element
    const header = screen.getByTestId("table-header");
    expect(header.tagName).toBe("THEAD");
  });

  it("TC-018: TableBody renders correctly", () => {
    // GIVEN/WHEN: Table with TableBody
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Header</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody data-testid="table-body">
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: TableBody is a tbody element
    const body = screen.getByTestId("table-body");
    expect(body.tagName).toBe("TBODY");
  });

  it("TC-019: TableRow renders with hover styles", () => {
    // GIVEN/WHEN: Table with TableRow
    render(
      <Table>
        <TableBody>
          <TableRow data-testid="table-row">
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: TableRow has hover class
    const row = screen.getByTestId("table-row");
    expect(row).toHaveClass("hover:bg-muted/50");
  });

  it("TC-020: TableRow renders with border", () => {
    // GIVEN/WHEN: Table with TableRow
    render(
      <Table>
        <TableBody>
          <TableRow data-testid="table-row">
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: TableRow has border class
    const row = screen.getByTestId("table-row");
    expect(row).toHaveClass("border-b");
  });
});

// =============================================================================
// SECTION 10: EDGE CASES
// =============================================================================

describe("Table - Edge Cases", () => {
  it("TC-021: handles empty table gracefully", () => {
    // GIVEN/WHEN: Empty table
    render(
      <Table data-testid="empty-table">
        <TableBody></TableBody>
      </Table>,
    );

    // THEN: Table renders without error
    expect(screen.getByTestId("empty-table")).toBeInTheDocument();
  });

  it("TC-022: forwards ref to table element", () => {
    // GIVEN: A ref
    const ref = { current: null as HTMLTableElement | null };

    // WHEN: Table is rendered with ref
    render(
      <Table ref={ref}>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: Ref points to table element
    expect(ref.current).toBeInstanceOf(HTMLTableElement);
  });

  it("TC-023: applies additional props to table element", () => {
    // GIVEN/WHEN: Table with data attribute
    render(
      <Table data-custom="test-value">
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: Data attribute is applied
    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("data-custom", "test-value");
  });

  it("TC-024: handles multiple rows correctly", () => {
    // GIVEN/WHEN: Table with multiple rows
    render(
      <Table size="compact">
        <TableBody>
          <TableRow data-testid="row-1">
            <TableCell data-testid="cell-1">Cell 1</TableCell>
          </TableRow>
          <TableRow data-testid="row-2">
            <TableCell data-testid="cell-2">Cell 2</TableCell>
          </TableRow>
          <TableRow data-testid="row-3">
            <TableCell data-testid="cell-3">Cell 3</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: All cells have the same size classes
    expect(screen.getByTestId("cell-1")).toHaveClass("py-table-cell-y-compact");
    expect(screen.getByTestId("cell-2")).toHaveClass("py-table-cell-y-compact");
    expect(screen.getByTestId("cell-3")).toHaveClass("py-table-cell-y-compact");
  });

  it("TC-025: handles multiple columns correctly", () => {
    // GIVEN/WHEN: Table with multiple columns
    render(
      <Table size="dense">
        <TableHeader>
          <TableRow>
            <TableHead data-testid="head-1">H1</TableHead>
            <TableHead data-testid="head-2">H2</TableHead>
            <TableHead data-testid="head-3">H3</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell data-testid="cell-1">C1</TableCell>
            <TableCell data-testid="cell-2">C2</TableCell>
            <TableCell data-testid="cell-3">C3</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: All heads and cells have correct size classes
    expect(screen.getByTestId("head-1")).toHaveClass("h-table-header-dense");
    expect(screen.getByTestId("head-2")).toHaveClass("h-table-header-dense");
    expect(screen.getByTestId("head-3")).toHaveClass("h-table-header-dense");
    expect(screen.getByTestId("cell-1")).toHaveClass("py-table-cell-y-dense");
    expect(screen.getByTestId("cell-2")).toHaveClass("py-table-cell-y-dense");
    expect(screen.getByTestId("cell-3")).toHaveClass("py-table-cell-y-dense");
  });

  it("TC-026: nested prop combined with size prop works correctly", () => {
    // GIVEN/WHEN: Nested table with dense size inside compact outer table
    render(
      <Table size="compact">
        <TableBody>
          <TableRow>
            <TableCell colSpan={3} className="p-0">
              <Table size="dense" nested data-testid="nested-inner">
                <TableBody>
                  <TableRow>
                    <TableCell data-testid="nested-cell">Nested</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: Inner table has dense classes and no wrapper
    const nestedCell = screen.getByTestId("nested-cell");
    expect(nestedCell).toHaveClass("py-table-cell-y-dense");

    const nestedTable = screen.getByTestId("nested-inner");
    expect(nestedTable.parentElement?.className).not.toContain("overflow-auto");
  });

  it("TC-027: handles TableCell with colSpan", () => {
    // GIVEN/WHEN: TableCell with colSpan attribute
    render(
      <Table size="compact">
        <TableBody>
          <TableRow>
            <TableCell colSpan={3} data-testid="spanning-cell">
              Spanning Cell
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: colSpan is preserved and size classes applied
    const cell = screen.getByTestId("spanning-cell");
    expect(cell).toHaveAttribute("colspan", "3");
    expect(cell).toHaveClass("py-table-cell-y-compact");
  });

  it("TC-028: handles TableHead with scope attribute", () => {
    // GIVEN/WHEN: TableHead with scope attribute
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" data-testid="scoped-head">
              Column Header
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // THEN: scope attribute is preserved
    const head = screen.getByTestId("scoped-head");
    expect(head).toHaveAttribute("scope", "col");
  });
});
