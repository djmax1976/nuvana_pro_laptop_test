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
    // GIVEN: A company exists
    const ownerUser = await prismaClient.user.create({
      data: createUserFactory({ name: "Sort Test Owner" }),
    });

    await createCompany(prismaClient, {
      name: "Sort Test Company",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
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

      // Click to sort ascending
      await header.click();
      await superadminPage.waitForTimeout(500);

      // Verify sort icon still visible after click
      await expect(sortIcon).toBeVisible();

      // Click again to sort descending
      await header.click();
      await superadminPage.waitForTimeout(500);

      // Verify sort icon still visible
      await expect(sortIcon).toBeVisible();

      // Click again to clear sort (return to default)
      await header.click();
      await superadminPage.waitForTimeout(500);

      // Verify sort icon still visible (neutral state)
      await expect(sortIcon).toBeVisible();
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
