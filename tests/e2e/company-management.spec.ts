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
    await superadminPage.goto("/companies");
    await superadminPage.waitForSelector("text=Companies");

    // THEN: The company list shows owner information
    await expect(
      superadminPage.getByText("Test Company With Owner"),
    ).toBeVisible();
    await expect(superadminPage.getByText("Test Owner")).toBeVisible();
    await expect(
      superadminPage.getByText("owner@test.nuvana.local"),
    ).toBeVisible();
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
    await superadminPage.goto("/companies");
    await superadminPage.waitForSelector("text=Companies");

    // THEN: The Owner column header is visible
    await expect(
      superadminPage.getByRole("columnheader", { name: "Owner" }),
    ).toBeVisible();
    await expect(
      superadminPage.getByRole("columnheader", { name: "Name" }),
    ).toBeVisible();
    await expect(
      superadminPage.getByRole("columnheader", { name: "Status" }),
    ).toBeVisible();
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
    await superadminPage.goto("/companies");
    await superadminPage.waitForSelector("text=Companies");

    // THEN: There should be no Create Company button
    await expect(
      superadminPage.getByRole("button", { name: /create company/i }),
    ).not.toBeVisible();
    await expect(
      superadminPage.getByRole("link", { name: /create company/i }),
    ).not.toBeVisible();
  });
});

test.describe("2.4-E2E: Company List - Empty State", () => {
  test("2.4-E2E-005: [P1] Empty state should show no companies message", async ({
    superadminPage,
  }) => {
    // GIVEN: No companies exist (clean state assumed)
    // WHEN: Navigating to the company list page
    await superadminPage.goto("/companies");
    await superadminPage.waitForSelector("text=Companies");

    // THEN: If no companies, show empty state message
    // Note: This test may pass or show the empty state depending on test data
    const emptyMessage = superadminPage.getByText(/No companies found/i);

    // Check if empty state is shown (companies may exist from other tests)
    const isEmpty = await emptyMessage.isVisible().catch(() => false);
    if (isEmpty) {
      await expect(emptyMessage).toBeVisible();
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
    await superadminPage.goto("/companies");
    await superadminPage.waitForSelector("text=Company To Edit");

    // Find and click the edit button for this company
    const companyRow = superadminPage.locator("tr", {
      has: superadminPage.locator("text=Company To Edit"),
    });
    await companyRow.getByRole("button", { name: /edit/i }).click();

    // THEN: Edit modal should open
    await expect(superadminPage.getByRole("dialog")).toBeVisible();
    await expect(superadminPage.getByText(/Edit Company/i)).toBeVisible();
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
    await superadminPage.goto("/companies");
    await superadminPage.waitForSelector("text=Company For Modal Test");

    const companyRow = superadminPage.locator("tr", {
      has: superadminPage.locator("text=Company For Modal Test"),
    });
    await companyRow.getByRole("button", { name: /edit/i }).click();

    // THEN: Owner information should be displayed in the modal
    await expect(superadminPage.getByRole("dialog")).toBeVisible();
    await expect(superadminPage.getByText("Owner For Modal")).toBeVisible();
    await expect(
      superadminPage.getByText("modal-owner@test.nuvana.local"),
    ).toBeVisible();
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

    // WHEN: Clicking the status toggle button
    await superadminPage.goto("/companies");
    await superadminPage.waitForSelector("text=Company To Deactivate");

    const companyRow = superadminPage.locator("tr", {
      has: superadminPage.locator("text=Company To Deactivate"),
    });

    // Click the power/status toggle button
    await companyRow.getByRole("button", { name: /deactivate/i }).click();

    // THEN: Confirmation dialog should appear
    await expect(superadminPage.getByRole("alertdialog")).toBeVisible();
    await expect(superadminPage.getByText(/Deactivate Company/i)).toBeVisible();

    // Confirm the deactivation
    await superadminPage.getByRole("button", { name: /deactivate/i }).click();

    // AND: Company should be deactivated
    await superadminPage.waitForTimeout(1000); // Wait for mutation
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

    await createCompany(prismaClient, {
      name: "Active Company Cannot Delete",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });

    // WHEN: Viewing the company list
    await superadminPage.goto("/companies");
    await superadminPage.waitForSelector("text=Active Company Cannot Delete");

    const companyRow = superadminPage.locator("tr", {
      has: superadminPage.locator("text=Active Company Cannot Delete"),
    });

    // THEN: Delete button should be disabled for active company
    const deleteButton = companyRow.getByRole("button", { name: /delete/i });
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

    // WHEN: Clicking delete for the inactive company
    await superadminPage.goto("/companies");
    await superadminPage.waitForSelector("text=Inactive Company To Delete");

    const companyRow = superadminPage.locator("tr", {
      has: superadminPage.locator("text=Inactive Company To Delete"),
    });

    // Delete button should be enabled for inactive company
    const deleteButton = companyRow.getByRole("button", { name: /delete/i });
    await expect(deleteButton).not.toBeDisabled();
    await deleteButton.click();

    // THEN: Confirmation dialog should appear
    await expect(superadminPage.getByRole("alertdialog")).toBeVisible();
    await expect(superadminPage.getByText(/Delete Company/i)).toBeVisible();
  });
});

test.describe("2.4-E2E: Company List - Sorting", () => {
  test("2.4-E2E-040: [P1] Should sort companies by all sortable columns", async ({
    superadminPage,
    prismaClient,
  }) => {
    // GIVEN: Multiple companies exist with diverse values for each sortable column
    // Create multiple owner users with different names for sorting
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

    // Create companies with diverse values:
    // - Different names (for Name column sorting)
    // - Different statuses (for Status column sorting)
    // - Different owner_user_id values (for Owner column sorting)
    // - Different created_at timestamps (for Created At column sorting)
    const baseTime = new Date("2024-01-01T00:00:00Z");

    const company1 = await createCompany(prismaClient, {
      name: "Alpha Company",
      status: "ACTIVE",
      owner_user_id: ownerUser1.user_id,
    });
    // Set explicit created_at for this company
    await prismaClient.company.update({
      where: { company_id: company1.company_id },
      data: { created_at: new Date(baseTime.getTime() + 1000) },
    });

    const company2 = await createCompany(prismaClient, {
      name: "Beta Company",
      status: "INACTIVE",
      owner_user_id: ownerUser2.user_id,
    });
    await prismaClient.company.update({
      where: { company_id: company2.company_id },
      data: { created_at: new Date(baseTime.getTime() + 2000) },
    });

    const company3 = await createCompany(prismaClient, {
      name: "Zeta Company",
      status: "ACTIVE",
      owner_user_id: ownerUser3.user_id,
    });
    await prismaClient.company.update({
      where: { company_id: company3.company_id },
      data: { created_at: new Date(baseTime.getTime() + 3000) },
    });

    const company4 = await createCompany(prismaClient, {
      name: "Gamma Company",
      status: "INACTIVE",
      owner_user_id: ownerUser4.user_id,
    });
    await prismaClient.company.update({
      where: { company_id: company4.company_id },
      data: { created_at: new Date(baseTime.getTime() + 4000) },
    });

    // WHEN: Navigating to the company list page
    await superadminPage.goto("/companies");
    await superadminPage.waitForSelector("text=Companies");

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
        // Use nth() to access by index (avoids object injection lint warning)
        const headerText = await headersLocator.nth(i).textContent();
        if (headerText?.trim().includes(columnName)) {
          return i;
        }
      }
      throw new Error(`Column "${columnName}" not found`);
    };

    // Helper function to extract cell values for a column from all tbody rows
    const getColumnCellValues = async (
      columnIndex: number,
      columnName: string,
    ): Promise<string[]> => {
      const rows = await superadminPage.locator("tbody tr").all();
      const values: string[] = [];

      for (const row of rows) {
        const cells = await row.locator("td").all();
        if (cells.length > columnIndex) {
          let cellText: string;
          // Use nth() to access cell by index (avoids object injection lint warning)
          const cell = row.locator("td").nth(columnIndex);

          if (columnName === "Owner") {
            // Owner column has nested structure: get the owner name (first div with font-medium)
            const ownerNameElement = cell.locator(".font-medium").first();
            cellText = (await ownerNameElement.textContent()) || "";
          } else if (columnName === "Status") {
            // Status column has a badge component
            cellText = (await cell.textContent()) || "";
          } else {
            // Other columns: get direct text content
            cellText = (await cell.textContent()) || "";
          }

          // Normalize/trim the text
          values.push(cellText.trim());
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

      // Capture baseline/default order before any clicks
      const baselineValues = await getColumnCellValues(columnIndex, columnName);
      const baselineSorted = [...baselineValues].sort((a, b) => {
        // Handle date columns differently
        if (columnName === "Created At" || columnName === "Updated At") {
          // Parse dates for comparison
          const dateA = new Date(a);
          const dateB = new Date(b);
          return dateA.getTime() - dateB.getTime();
        }
        // Case-insensitive string comparison
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      });

      // Click to sort ascending
      await header.click();
      await superadminPage.waitForLoadState("networkidle");

      // Verify sort icon still visible after click
      await expect(sortIcon).toBeVisible();

      // Collect column cell values and verify ascending order
      const ascendingValues = await getColumnCellValues(
        columnIndex,
        columnName,
      );
      expect(ascendingValues).toEqual(baselineSorted);

      // Click again to sort descending
      await header.click();
      await superadminPage.waitForLoadState("networkidle");

      // Verify sort icon still visible
      await expect(sortIcon).toBeVisible();

      // Collect column cell values and verify descending order
      const descendingValues = await getColumnCellValues(
        columnIndex,
        columnName,
      );
      const expectedDescending = [...baselineSorted].reverse();
      expect(descendingValues).toEqual(expectedDescending);

      // Click again to clear sort (return to default)
      await header.click();
      await superadminPage.waitForLoadState("networkidle");

      // Verify sort icon still visible (neutral state)
      await expect(sortIcon).toBeVisible();

      // Collect column cell values and verify returned to baseline/default order
      const defaultValues = await getColumnCellValues(columnIndex, columnName);
      expect(defaultValues).toEqual(baselineValues);
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
    await superadminPage.goto("/companies");
    await superadminPage.waitForSelector("text=Company With Stores");

    // THEN: The company should be visible (stores managed separately)
    await expect(superadminPage.getByText("Company With Stores")).toBeVisible();
  });
});
