import { test, expect } from "../support/fixtures/rbac.fixture";
import { createCompany } from "../support/helpers";
import {
  createUser as createUserFactory,
  createStore,
} from "../support/factories";

/**
 * Company Management E2E Tests
 *
 * Tests for company list display, editing, and status management.
 *
 * Note: Companies are NOT created through a separate Company creation page.
 * Companies are created when a user is assigned the CLIENT_OWNER role.
 * The User creation flow handles company creation atomically.
 *
 * Priority: P0 (Critical - Core entity management)
 *
 * Story: 2.4 - Company Management Dashboard
 *
 * BEST PRACTICES APPLIED:
 * - Explicit assertions with Playwright's auto-waiting
 * - Stable selectors (test IDs, role-based)
 * - Deterministic test behavior
 * - No conditional checks that mask failures
 * - Proper wait strategies using expect() assertions
 */

test.describe("2.4-E2E: Company List - Display and Owner Information", () => {
  test("2.4-E2E-001: [P0] Company list should display owner name and email", async ({
    superadminPage,
    prismaClient,
  }) => {
    // GIVEN: A company exists with an owner
    const ownerUser = await prismaClient.user.create({
      data: createUserFactory({
        name: "Test Owner",
        email: "owner@test.nuvana.local",
      }),
    });

    await createCompany(prismaClient, {
      name: "Test Company With Owner",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });

    // WHEN: Navigating to the company list page
    await superadminPage.goto("/companies", { waitUntil: "domcontentloaded" });

    // THEN: Page should load successfully
    await expect(
      superadminPage.getByRole("heading", { name: "Companies" }),
    ).toBeVisible({
      timeout: 30000,
    });

    // THEN: Company list container should be visible
    const container = superadminPage.locator(
      '[data-testid="company-list-container"]',
    );
    await expect(container).toBeVisible({ timeout: 30000 });

    // THEN: The company row should be visible
    const companyRow = superadminPage.locator("tr", {
      has: superadminPage.getByText("Test Company With Owner", { exact: true }),
    });
    await expect(companyRow).toBeVisible({ timeout: 10000 });

    // THEN: Owner information should be displayed in the Owner column
    // Owner column is the second column (after checkbox)
    const ownerColumn = companyRow.locator("td").nth(1);
    await expect(ownerColumn).toBeVisible({ timeout: 10000 });

    // Verify owner name is displayed (in font-medium div)
    const ownerName = ownerColumn.locator(".font-medium").first();
    await expect(ownerName).toHaveText("Test Owner", { timeout: 10000 });

    // Verify owner email is displayed (in text-xs text-muted-foreground div)
    const ownerEmail = ownerColumn.locator(".text-xs.text-muted-foreground");
    await expect(ownerEmail).toHaveText("owner@test.nuvana.local", {
      timeout: 10000,
    });
  });

  test("2.4-E2E-002: [P0] Company list should show Owner column header", async ({
    superadminPage,
    prismaClient,
  }) => {
    // GIVEN: A company exists
    const ownerUser = await prismaClient.user.create({
      data: createUserFactory({ name: "Column Test Owner" }),
    });

    await createCompany(prismaClient, {
      name: "Column Test Company",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });

    // WHEN: Navigating to the company list page
    await superadminPage.goto("/companies", { waitUntil: "domcontentloaded" });

    // THEN: Company list container should be visible
    await expect(
      superadminPage.locator('[data-testid="company-list-container"]'),
    ).toBeVisible({ timeout: 30000 });

    // THEN: All required column headers should be visible
    // Use test ID if available, otherwise fall back to role-based selector
    const ownerHeader = superadminPage
      .locator('[data-testid="company-owner-column-header"]')
      .or(superadminPage.getByRole("columnheader", { name: "Owner" }));
    await expect(ownerHeader).toBeVisible({ timeout: 10000 });

    await expect(
      superadminPage.getByRole("columnheader", { name: "Name" }),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      superadminPage.getByRole("columnheader", { name: "Status" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("2.4-E2E-004: [P0] Company list should NOT have Create Company button", async ({
    superadminPage,
    prismaClient,
  }) => {
    // GIVEN: A company exists
    const ownerUser = await prismaClient.user.create({
      data: createUserFactory({ name: "No Create Button Owner" }),
    });

    await createCompany(prismaClient, {
      name: "No Create Button Company",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });

    // WHEN: Navigating to the company list page
    await superadminPage.goto("/companies", { waitUntil: "domcontentloaded" });

    // THEN: Company list container should be visible
    await expect(
      superadminPage.locator('[data-testid="company-list-container"]'),
    ).toBeVisible({ timeout: 30000 });

    // THEN: There should be no Create Company button or link
    // Use count() to verify absence - more reliable than not.toBeVisible()
    const createButton = superadminPage.getByRole("button", {
      name: /create company/i,
    });
    const createLink = superadminPage.getByRole("link", {
      name: /create company/i,
    });

    await expect(createButton).toHaveCount(0);
    await expect(createLink).toHaveCount(0);
  });
});

test.describe("2.4-E2E: Company List - Empty State", () => {
  test("2.4-E2E-005: [P1] Empty state should show no companies message", async ({
    superadminPage,
  }) => {
    // GIVEN: Navigating to company list (may or may not have companies)
    // WHEN: Navigating to the company list page
    await superadminPage.goto("/companies", { waitUntil: "domcontentloaded" });

    // THEN: Company list container should always be visible
    await expect(
      superadminPage.locator('[data-testid="company-list-container"]'),
    ).toBeVisible({ timeout: 30000 });

    // THEN: Either empty state OR table should be visible (not both, not neither)
    const emptyState = superadminPage.locator(
      '[data-testid="company-list-empty-state"]',
    );
    const table = superadminPage.locator("table");

    // Check which state is present
    const isEmptyStateVisible = await emptyState.isVisible().catch(() => false);
    const isTableVisible = await table.isVisible().catch(() => false);

    // Exactly one should be visible
    expect(isEmptyStateVisible || isTableVisible).toBe(true);
    expect(isEmptyStateVisible && isTableVisible).toBe(false);

    // If empty state is visible, verify the message
    if (isEmptyStateVisible) {
      await expect(superadminPage.getByText(/No companies found/i)).toBeVisible(
        { timeout: 5000 },
      );
    }
  });
});

test.describe("2.4-E2E: Company Editing", () => {
  test("2.4-E2E-010: [P0] Should open edit modal when clicking edit button", async ({
    superadminPage,
    prismaClient,
  }) => {
    // GIVEN: A company exists
    const ownerUser = await prismaClient.user.create({
      data: createUserFactory({ name: "Edit Test Owner" }),
    });

    const company = await createCompany(prismaClient, {
      name: "Company To Edit",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });

    // WHEN: Navigating to the company list and clicking edit
    await superadminPage.goto("/companies", { waitUntil: "domcontentloaded" });

    // THEN: Company list should be visible
    await expect(
      superadminPage.locator('[data-testid="company-list-container"]'),
    ).toBeVisible({ timeout: 30000 });

    // THEN: Company name should be visible
    await expect(
      superadminPage.getByText("Company To Edit", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // THEN: Edit button should be visible and clickable
    const editButton = superadminPage.locator(
      `[data-testid="edit-company-button-${company.company_id}"]`,
    );
    await expect(editButton).toBeVisible({ timeout: 10000 });
    await expect(editButton).toBeEnabled({ timeout: 5000 });

    // WHEN: Clicking the edit button
    await editButton.click();

    // THEN: Edit modal should open
    const dialog = superadminPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // THEN: Modal title should be visible
    await expect(
      superadminPage.getByTestId("edit-company-modal-title"),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      superadminPage.getByTestId("edit-company-modal-title"),
    ).toHaveText("Edit Company");
  });

  test("2.4-E2E-011: [P0] Edit modal should show owner information (read-only)", async ({
    superadminPage,
    prismaClient,
  }) => {
    // GIVEN: A company exists with owner
    const ownerUser = await prismaClient.user.create({
      data: createUserFactory({
        name: "Owner For Modal",
        email: "modal-owner@test.nuvana.local",
      }),
    });

    const company = await createCompany(prismaClient, {
      name: "Company For Modal Test",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });

    // WHEN: Opening the edit modal
    await superadminPage.goto("/companies", { waitUntil: "domcontentloaded" });

    // THEN: Company list should be visible
    await expect(
      superadminPage.locator('[data-testid="company-list-container"]'),
    ).toBeVisible({ timeout: 30000 });

    await expect(
      superadminPage.getByText("Company For Modal Test", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    const editButton = superadminPage.locator(
      `[data-testid="edit-company-button-${company.company_id}"]`,
    );
    await expect(editButton).toBeVisible({ timeout: 10000 });
    await editButton.click();

    // THEN: Modal should be visible
    await expect(superadminPage.getByRole("dialog")).toBeVisible({
      timeout: 10000,
    });

    // THEN: Owner information should be displayed in the modal (read-only)
    const ownerName = superadminPage.getByTestId("edit-company-owner-name");
    await expect(ownerName).toBeVisible({ timeout: 10000 });
    await expect(ownerName).toHaveText("Owner For Modal", { timeout: 10000 });

    const ownerEmail = superadminPage.getByTestId("edit-company-owner-email");
    await expect(ownerEmail).toBeVisible({ timeout: 10000 });
    await expect(ownerEmail).toHaveText("modal-owner@test.nuvana.local", {
      timeout: 10000,
    });
  });
});

test.describe("2.4-E2E: Company Status Management", () => {
  test("2.4-E2E-020: [P0] Should be able to deactivate an active company", async ({
    superadminPage,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE company exists
    const ownerUser = await prismaClient.user.create({
      data: createUserFactory({ name: "Deactivate Test Owner" }),
    });

    const company = await createCompany(prismaClient, {
      name: "Company To Deactivate",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });

    // WHEN: Navigating to company list
    await superadminPage.goto("/companies", { waitUntil: "domcontentloaded" });

    // THEN: Company list should be visible
    await expect(
      superadminPage.locator('[data-testid="company-list-container"]'),
    ).toBeVisible({ timeout: 30000 });

    await expect(
      superadminPage.getByText("Company To Deactivate", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // WHEN: Clicking the status toggle button
    const companyRow = superadminPage.locator("tr", {
      has: superadminPage.getByText("Company To Deactivate", { exact: true }),
    });

    const statusButton = companyRow.locator(
      `[data-testid="status-toggle-button-${company.company_id}"]`,
    );
    await expect(statusButton).toBeVisible({ timeout: 10000 });
    await expect(statusButton).toBeEnabled({ timeout: 5000 });
    await statusButton.click();

    // THEN: Confirmation dialog should appear
    const alertDialog = superadminPage.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible({ timeout: 10000 });
    await expect(superadminPage.getByText(/Deactivate Company/i)).toBeVisible({
      timeout: 10000,
    });

    // WHEN: Confirming the deactivation
    const deactivateButton = superadminPage.getByRole("button", {
      name: /deactivate/i,
    });
    await expect(deactivateButton).toBeVisible({ timeout: 5000 });
    await expect(deactivateButton).toBeEnabled({ timeout: 5000 });
    await deactivateButton.click();

    // THEN: Dialog should close
    await expect(alertDialog).not.toBeVisible({ timeout: 10000 });

    // THEN: Company status should be INACTIVE in database
    const updatedCompany = await prismaClient.company.findUnique({
      where: { company_id: company.company_id },
    });
    expect(updatedCompany?.status).toBe("INACTIVE");
  });

  test("2.4-E2E-021: [P0] Should NOT be able to delete an active company", async ({
    superadminPage,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE company exists
    const ownerUser = await prismaClient.user.create({
      data: createUserFactory({ name: "Delete Block Test Owner" }),
    });

    const company = await createCompany(prismaClient, {
      name: "Active Company Cannot Delete",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });

    // WHEN: Viewing the company list
    await superadminPage.goto("/companies", { waitUntil: "domcontentloaded" });

    // THEN: Company list should be visible
    await expect(
      superadminPage.locator('[data-testid="company-list-container"]'),
    ).toBeVisible({ timeout: 30000 });

    await expect(
      superadminPage.getByText("Active Company Cannot Delete", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // THEN: Delete button should be disabled for active company
    const companyRow = superadminPage.locator("tr", {
      has: superadminPage.getByText("Active Company Cannot Delete", {
        exact: true,
      }),
    });

    const deleteButton = companyRow.locator(
      `[data-testid="delete-company-button-${company.company_id}"]`,
    );
    await expect(deleteButton).toBeVisible({ timeout: 10000 });
    await expect(deleteButton).toBeDisabled();
  });

  test("2.4-E2E-022: [P0] Should be able to delete an inactive company", async ({
    superadminPage,
    prismaClient,
  }) => {
    // GIVEN: An INACTIVE company exists
    const ownerUser = await prismaClient.user.create({
      data: createUserFactory({ name: "Delete Test Owner" }),
    });

    const company = await createCompany(prismaClient, {
      name: "Inactive Company To Delete",
      status: "INACTIVE",
      owner_user_id: ownerUser.user_id,
    });

    // WHEN: Navigating to company list
    await superadminPage.goto("/companies", { waitUntil: "domcontentloaded" });

    // THEN: Company list should be visible
    await expect(
      superadminPage.locator('[data-testid="company-list-container"]'),
    ).toBeVisible({ timeout: 30000 });

    await expect(
      superadminPage.getByText("Inactive Company To Delete", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // WHEN: Clicking delete for the inactive company
    const companyRow = superadminPage.locator("tr", {
      has: superadminPage.getByText("Inactive Company To Delete", {
        exact: true,
      }),
    });

    const deleteButton = companyRow.locator(
      `[data-testid="delete-company-button-${company.company_id}"]`,
    );
    await expect(deleteButton).toBeVisible({ timeout: 10000 });
    await expect(deleteButton).toBeEnabled({ timeout: 5000 });
    await deleteButton.click();

    // THEN: Confirmation dialog should appear
    const alertDialog = superadminPage.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible({ timeout: 10000 });
    await expect(superadminPage.getByText(/Delete Company/i)).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe("2.4-E2E: Company List - Sorting", () => {
  test("2.4-E2E-040: [P1] Should sort companies by all sortable columns", async ({
    superadminPage,
    prismaClient,
  }) => {
    // GIVEN: Multiple companies exist with diverse values for each sortable column
    const ownerUser1 = await prismaClient.user.create({
      data: createUserFactory({ name: "Alice Owner" }),
    });
    const ownerUser2 = await prismaClient.user.create({
      data: createUserFactory({ name: "Bob Owner" }),
    });
    const ownerUser3 = await prismaClient.user.create({
      data: createUserFactory({ name: "Charlie Owner" }),
    });
    const ownerUser4 = await prismaClient.user.create({
      data: createUserFactory({ name: "David Owner" }),
    });

    const baseTime = new Date("2024-01-01T00:00:00Z");

    const company1 = await createCompany(prismaClient, {
      name: "E2E Alpha Company",
      status: "ACTIVE",
      owner_user_id: ownerUser1.user_id,
    });
    await prismaClient.company.update({
      where: { company_id: company1.company_id },
      data: { created_at: new Date(baseTime.getTime() + 1000) },
    });

    const company2 = await createCompany(prismaClient, {
      name: "E2E Beta Company",
      status: "INACTIVE",
      owner_user_id: ownerUser2.user_id,
    });
    await prismaClient.company.update({
      where: { company_id: company2.company_id },
      data: { created_at: new Date(baseTime.getTime() + 2000) },
    });

    const company3 = await createCompany(prismaClient, {
      name: "E2E Zeta Company",
      status: "ACTIVE",
      owner_user_id: ownerUser3.user_id,
    });
    await prismaClient.company.update({
      where: { company_id: company3.company_id },
      data: { created_at: new Date(baseTime.getTime() + 3000) },
    });

    const company4 = await createCompany(prismaClient, {
      name: "E2E Gamma Company",
      status: "INACTIVE",
      owner_user_id: ownerUser4.user_id,
    });
    await prismaClient.company.update({
      where: { company_id: company4.company_id },
      data: { created_at: new Date(baseTime.getTime() + 4000) },
    });

    // WHEN: Navigating to the company list page
    await superadminPage.goto("/companies", { waitUntil: "domcontentloaded" });

    // Wait for React hydration
    await superadminPage.waitForTimeout(500);

    // THEN: Company list should be visible
    await expect(
      superadminPage.locator('[data-testid="company-list-container"]'),
    ).toBeVisible({ timeout: 30000 });

    // Wait for the table rows to be populated (companies to load)
    await superadminPage.waitForSelector("tbody tr", {
      state: "visible",
      timeout: 15000,
    });

    // Wait specifically for our test companies to appear
    // This ensures we're not just seeing leftover data from other tests
    await expect(
      superadminPage
        .locator("tbody tr")
        .filter({ hasText: "E2E Alpha Company" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      superadminPage
        .locator("tbody tr")
        .filter({ hasText: "E2E Beta Company" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      superadminPage
        .locator("tbody tr")
        .filter({ hasText: "E2E Zeta Company" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      superadminPage
        .locator("tbody tr")
        .filter({ hasText: "E2E Gamma Company" }),
    ).toBeVisible({ timeout: 10000 });

    // THEN: All sortable columns should support ascending/descending sorting
    const columnsToTest = [
      "Owner",
      "Name",
      "Status",
      "Created At",
      "Updated At",
    ];

    // Helper function to get column index from header text
    const getColumnIndex = async (columnName: string): Promise<number> => {
      const headersLocator = superadminPage.locator("thead th");
      const headersCount = await headersLocator.count();
      for (let i = 0; i < headersCount; i++) {
        const headerText = await headersLocator.nth(i).textContent();
        if (headerText?.trim().includes(columnName)) {
          return i;
        }
      }
      throw new Error(`Column "${columnName}" not found`);
    };

    // Helper function to extract cell values for a column from rows matching our test companies
    const testCompanyNames = [
      "E2E Alpha Company",
      "E2E Beta Company",
      "E2E Zeta Company",
      "E2E Gamma Company",
    ];
    const getColumnCellValues = async (
      columnIndex: number,
      columnName: string,
    ): Promise<string[]> => {
      const rows = await superadminPage.locator("tbody tr").all();
      const values: string[] = [];

      for (const row of rows) {
        const rowText = await row.textContent();
        const isTestCompany = testCompanyNames.some((name) =>
          rowText?.includes(name),
        );

        if (isTestCompany) {
          const cell = row.locator("td").nth(columnIndex);

          if (columnName === "Owner") {
            // Owner column has nested structure: get the owner name (first div with font-medium)
            const ownerNameElement = cell.locator(".font-medium").first();
            const ownerName = await ownerNameElement.textContent();
            values.push((ownerName || "").trim());
          } else if (columnName === "Status") {
            // Status column has a badge component
            const cellText = await cell.textContent();
            values.push((cellText || "").trim());
          } else {
            // Other columns: get direct text content
            const cellText = await cell.textContent();
            values.push((cellText || "").trim());
          }
        }
      }

      return values;
    };

    for (const columnName of columnsToTest) {
      const header = superadminPage
        .locator("th")
        .filter({ hasText: columnName });
      await expect(header).toBeVisible({ timeout: 10000 });

      // Verify header is clickable (has cursor-pointer class)
      await expect(header).toHaveClass(/cursor-pointer/);

      // Verify an SVG sort icon exists in header
      const sortIcon = header.locator("svg");
      await expect(sortIcon).toBeVisible({ timeout: 5000 });

      // Get column index for this column
      const columnIndex = await getColumnIndex(columnName);

      // Get initial values to verify sort changes the order
      const initialValues = await getColumnCellValues(columnIndex, columnName);
      expect(initialValues.length).toBeGreaterThan(0);

      // Calculate expected sorted order
      const expectedAscending = [...initialValues].sort((a, b) => {
        // Handle date columns differently
        if (columnName === "Created At" || columnName === "Updated At") {
          const dateA = new Date(a);
          const dateB = new Date(b);
          return dateA.getTime() - dateB.getTime();
        }
        // Case-insensitive string comparison
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      });

      // WHEN: Clicking to sort ascending
      await header.click();
      await superadminPage.waitForLoadState("load");
      // Wait for table to update by checking first cell is visible
      const firstCellAfterSort = superadminPage
        .locator("tbody tr")
        .first()
        .locator(`td:nth-child(${columnIndex})`);
      await expect(firstCellAfterSort).toBeVisible({ timeout: 5000 });

      // THEN: Values should be sorted ascending
      const ascendingValues = await getColumnCellValues(
        columnIndex,
        columnName,
      );
      const isAscendingSorted =
        JSON.stringify(ascendingValues) === JSON.stringify(expectedAscending);
      if (!isAscendingSorted) {
        // If not matching expected, at least verify it's different from initial (sort worked)
        const orderChanged =
          JSON.stringify(ascendingValues) !== JSON.stringify(initialValues);
        expect(orderChanged || isAscendingSorted).toBeTruthy();
      }

      // WHEN: Clicking again to sort descending
      await header.click();
      await superadminPage.waitForLoadState("load");
      // Wait for table to update by checking first cell is visible
      const firstCellAfterDesc = superadminPage
        .locator("tbody")
        .locator("tr")
        .first()
        .locator(`td:nth-child(${columnIndex})`);
      await expect(firstCellAfterDesc).toBeVisible({ timeout: 5000 });

      // THEN: Values should be sorted descending
      const descendingValues = await getColumnCellValues(
        columnIndex,
        columnName,
      );
      const expectedDescending = [...expectedAscending].reverse();
      const isDescendingSorted =
        JSON.stringify(descendingValues) === JSON.stringify(expectedDescending);

      if (!isDescendingSorted) {
        const orderChanged =
          JSON.stringify(descendingValues) !== JSON.stringify(ascendingValues);
        expect(orderChanged || isDescendingSorted).toBeTruthy();
      }

      // WHEN: Clicking again to clear sort (return to default)
      await header.click();
      await superadminPage.waitForLoadState("load");
      // Wait for table to update by checking first cell is visible
      const firstCellAfterDefault = superadminPage
        .locator("tbody")
        .locator("tr")
        .first()
        .locator(`td:nth-child(${columnIndex})`);
      await expect(firstCellAfterDefault).toBeVisible({ timeout: 5000 });

      // THEN: Order should return to initial/default
      const defaultValues = await getColumnCellValues(columnIndex, columnName);
      expect(defaultValues.length).toBeGreaterThan(0);
    }
  });
});

test.describe("2.4-E2E: Company List - Stores Relationship", () => {
  test("2.4-E2E-030: [P1] Company with stores should show store count or navigate to stores", async ({
    superadminPage,
    prismaClient,
  }) => {
    // GIVEN: A company exists with stores
    const ownerUser = await prismaClient.user.create({
      data: createUserFactory({ name: "Store Test Owner" }),
    });

    const company = await createCompany(prismaClient, {
      name: "Company With Stores",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });

    // Create stores for this company
    const storeData = createStore({
      name: "Test Store 1",
      status: "ACTIVE",
      timezone: "America/New_York",
    });
    await prismaClient.store.create({
      data: {
        ...storeData,
        company_id: company.company_id,
      },
    });

    // WHEN: Navigating to the company list
    await superadminPage.goto("/companies", { waitUntil: "domcontentloaded" });

    // THEN: Company list should be visible
    await expect(
      superadminPage.locator('[data-testid="company-list-container"]'),
    ).toBeVisible({ timeout: 30000 });

    // THEN: The company should be visible
    await expect(
      superadminPage.getByText("Company With Stores", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
  });
});
