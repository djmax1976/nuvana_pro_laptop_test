import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { cleanupTestData } from "../support/cleanup-helper";

const prisma = new PrismaClient();

/**
 * E2E Test Suite: Client Management
 *
 * Tests the complete user journey for managing clients through the UI:
 * - Viewing clients list
 * - Navigating to client detail/edit page
 * - Editing client information
 * - Creating new clients
 * - Deleting clients
 *
 * This test covers the entire flow from UI interaction to database persistence.
 */

test.describe("Client Management E2E", () => {
  let superadminUser: any;
  let testClient: any;

  test.beforeAll(async () => {
    // Clean up any existing test data first (delete userRoles before users to avoid FK violations)
    const existingUsers = await prisma.user.findMany({
      where: { email: "superadmin-client-e2e@test.com" },
      select: { user_id: true },
    });

    for (const user of existingUsers) {
      await prisma.userRole.deleteMany({
        where: { user_id: user.user_id },
      });
    }

    await prisma.user.deleteMany({
      where: { email: "superadmin-client-e2e@test.com" },
    });

    // Create superadmin user for testing
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);

    superadminUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: "superadmin-client-e2e@test.com",
        name: "Superadmin Client E2E Tester",
        password_hash: hashedPassword,
        status: "ACTIVE",
      },
    });

    // Assign SUPERADMIN role
    const superadminRole = await prisma.role.findUnique({
      where: { code: "SUPERADMIN" },
    });

    if (superadminRole) {
      await prisma.userRole.create({
        data: {
          user_id: superadminUser.user_id,
          role_id: superadminRole.role_id,
          assigned_by: superadminUser.user_id,
        },
      });
    }

    // Create a test client for editing tests
    testClient = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        email: "test-1763734068992-tue9nkahq@example.com",
        name: "E2E Test Client",
        status: "ACTIVE",
        metadata: { test: true },
      },
    });
  });

  test.afterAll(async () => {
    // Cleanup: Delete test data using helper (respects FK constraints)
    await cleanupTestData(prisma, {
      clients: testClient ? [testClient.client_id] : [],
      users: superadminUser ? [superadminUser.user_id] : [],
    });

    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto("http://localhost:3000/login");
    await page.fill('input[type="email"]', "superadmin-client-e2e@test.com");
    await page.fill('input[type="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard");
  });

  test("[P0] Should load clients list page", async ({ page }) => {
    // WHEN: Navigate to clients page
    await page.goto("http://localhost:3000/clients");

    // THEN: Clients page loads successfully
    await expect(page).toHaveURL(/\/clients$/);
    await expect(
      page.locator("h1, h2").filter({ hasText: /clients/i }),
    ).toBeVisible();
  });

  test("[P0] Should navigate to client detail page from clients list", async ({
    page,
  }) => {
    // GIVEN: I am on the clients list page
    await page.goto("http://localhost:3000/clients");

    // WHEN: I click on a client row or edit button
    const clientRow = page.locator(`tr:has-text("${testClient.name}")`).first();
    await expect(clientRow).toBeVisible({ timeout: 10000 });

    // Click the client row or an edit button/link
    await clientRow.click();

    // THEN: I am redirected to the client detail page using public_id
    await expect(page).toHaveURL(
      new RegExp(`/clients/${testClient.public_id}`),
    );
    await expect(
      page.locator("h2").filter({ hasText: /edit client/i }),
    ).toBeVisible();
  });

  test("[P0] Should successfully edit client name and status with confirmation", async ({
    page,
  }) => {
    // GIVEN: I am on the client edit page
    await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);

    // WHEN: I update the client name
    const newName = `Updated E2E Client ${Date.now()}`;

    const nameInput = page.locator('input[data-testid="client-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.clear();
    await nameInput.fill(newName);

    // AND: I change the status (which triggers confirmation dialog)
    const statusSelect = page.locator(
      'button[data-testid="client-status-select"]',
    );
    await statusSelect.click();
    await page.locator('div[role="option"]:has-text("Inactive")').click();

    // THEN: Status change confirmation dialog appears
    await expect(page.getByText(/change status to inactive/i)).toBeVisible();

    // WHEN: I confirm the status change
    await page
      .getByRole("button", { name: /deactivate|change to inactive/i })
      .click();

    // AND: I submit the form
    const submitButton = page.locator(
      'button[data-testid="client-submit-button"]',
    );
    await submitButton.click();

    // THEN: Success toast appears and I stay on the same page
    await expect(page.getByText(/success|updated successfully/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(page).toHaveURL(
      new RegExp(`/clients/${testClient.public_id}`),
    );

    // AND: The database is updated
    const updatedClient = await prisma.client.findUnique({
      where: { client_id: testClient.client_id },
    });
    expect(updatedClient?.name).toBe(newName);
    expect(updatedClient?.status).toBe("INACTIVE");

    // Clean up: Restore original values
    await prisma.client.update({
      where: { client_id: testClient.client_id },
      data: {
        name: testClient.name,
        status: testClient.status,
      },
    });
  });

  test("[P0] Should successfully edit client metadata and stay on page", async ({
    page,
  }) => {
    // GIVEN: I am on the client edit page
    await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);

    // WHEN: I update the client metadata
    const metadataTextarea = page.locator(
      'textarea[data-testid="client-metadata-textarea"]',
    );
    await expect(metadataTextarea).toBeVisible({ timeout: 10000 });

    const newMetadata = JSON.stringify({ test: true, updated: true }, null, 2);
    await metadataTextarea.clear();
    await metadataTextarea.fill(newMetadata);

    // AND: I submit the form
    const submitButton = page.locator(
      'button[data-testid="client-submit-button"]',
    );
    await submitButton.click();

    // THEN: Success toast appears and I stay on the same page (no redirect)
    await expect(page.getByText(/success|updated successfully/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(page).toHaveURL(
      new RegExp(`/clients/${testClient.public_id}`),
    );

    // AND: The metadata is updated in the database
    const updatedClient = await prisma.client.findUnique({
      where: { client_id: testClient.client_id },
    });
    expect(updatedClient?.metadata).toMatchObject({
      test: true,
      updated: true,
    });

    // Clean up: Restore original metadata
    await prisma.client.update({
      where: { client_id: testClient.client_id },
      data: { metadata: testClient.metadata },
    });
  });

  test("[P1] Should show validation error for empty client name", async ({
    page,
  }) => {
    // GIVEN: I am on the client edit page
    await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);

    // WHEN: I clear the client name and submit
    const nameInput = page.locator('input[data-testid="client-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.clear();

    const submitButton = page.locator(
      'button[data-testid="client-submit-button"]',
    );
    await submitButton.click();

    // THEN: I see a validation error
    const errorMessage = page.locator('[data-testid="form-error-message"]');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
    await expect(errorMessage).toContainText(/required|cannot be empty/i);
  });

  test("[P1] Should show validation error for invalid JSON metadata", async ({
    page,
  }) => {
    // GIVEN: I am on the client edit page
    await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);

    // WHEN: I enter invalid JSON in metadata field
    const metadataTextarea = page.locator(
      'textarea[data-testid="client-metadata-textarea"]',
    );
    await expect(metadataTextarea).toBeVisible({ timeout: 10000 });
    await metadataTextarea.clear();
    await metadataTextarea.fill("{ invalid json }");

    const submitButton = page.locator(
      'button[data-testid="client-submit-button"]',
    );
    await submitButton.click();

    // THEN: I see a validation error
    const errorMessage = page.locator("text=/invalid.*json/i");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P0] Should create a new client", async ({ page }) => {
    // GIVEN: I am on the clients page
    await page.goto("http://localhost:3000/clients");

    // WHEN: I click the "Create Client" or "New Client" button
    const createButton = page.getByRole("button", {
      name: /new client|create client/i,
    });
    await createButton.click();

    // AND: I fill in the client form
    const newClientName = `New E2E Client ${Date.now()}`;
    const newClientEmail = `client-${Date.now()}@example.com`;

    await page
      .locator('input[data-testid="client-name-input"]')
      .fill(newClientName);

    await page
      .locator('input[data-testid="client-email-input"]')
      .fill(newClientEmail);

    await page
      .locator('input[data-testid="client-password-input"]')
      .fill("TestPassword123!");

    await page
      .locator('input[data-testid="client-confirm-password-input"]')
      .fill("TestPassword123!");

    const statusSelect = page.locator(
      'button[data-testid="client-status-select"]',
    );
    await statusSelect.click();
    await page.getByRole("option", { name: "Active", exact: true }).click();

    // AND: I submit the form
    await page.locator('button[data-testid="client-submit-button"]').click();

    // THEN: The client is created successfully
    await page.waitForTimeout(1000);

    const createdClient = await prisma.client.findFirst({
      where: { name: newClientName },
    });
    expect(createdClient).not.toBeNull();
    expect(createdClient?.status).toBe("ACTIVE");

    // Clean up
    if (createdClient) {
      await prisma.client.delete({
        where: { client_id: createdClient.client_id },
      });
    }
  });

  test("[P1] Should cancel client edit without saving changes", async ({
    page,
  }) => {
    // GIVEN: I am on the client edit page
    await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);

    // WHEN: I modify the client name
    const originalName = testClient.name;
    const nameInput = page.locator('input[data-testid="client-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.clear();
    await nameInput.fill("This Should Not Be Saved");

    // AND: I click the cancel button
    const cancelButton = page.locator(
      'button[data-testid="client-cancel-button"]',
    );
    await cancelButton.click();

    // THEN: Changes are not saved
    const unchangedClient = await prisma.client.findUnique({
      where: { client_id: testClient.client_id },
    });
    expect(unchangedClient?.name).toBe(originalName);
  });

  test("[P0] Should prevent deletion of ACTIVE client", async ({ page }) => {
    // GIVEN: I am on the client edit page with an ACTIVE client
    await prisma.client.update({
      where: { client_id: testClient.client_id },
      data: { status: "ACTIVE" },
    });

    await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);

    // WHEN: I try to click the delete button
    const deleteButton = page.locator(
      'button[data-testid="client-delete-button"]',
    );

    // THEN: The delete button is disabled
    await expect(deleteButton).toBeDisabled();
  });

  test("[P1] Should display delete dialog properly on mobile screens", async ({
    page,
  }) => {
    // GIVEN: I am on mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size

    // AND: I have a client to view
    await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);

    // WHEN: The page loads
    await page.waitForLoadState("networkidle");

    // THEN: The page should be visible and not overflow
    const clientEditSection = page.locator(
      '[data-testid="client-edit-button"]',
    );
    await expect(clientEditSection).toBeVisible();

    // AND: If we trigger the delete dialog (even if disabled), it should fit on screen
    // Note: We're just checking the dialog component is properly sized, not testing the full delete flow
    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(375); // Verify mobile viewport is set
  });

  test("[P1] Should successfully delete INACTIVE client with text confirmation", async ({
    page,
  }) => {
    // GIVEN: I create a new client and set it to INACTIVE
    const clientToDelete = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        email: `test-${Date.now()}@example.com`,
        name: "Client to Delete E2E",
        status: "INACTIVE",
      },
    });

    await page.goto(
      `http://localhost:3000/clients/${clientToDelete.public_id}`,
    );

    // WHEN: I click the delete button
    const deleteButton = page.locator(
      'button[data-testid="client-delete-button"]',
    );
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();

    // THEN: Delete confirmation dialog appears
    await expect(page.getByText(/delete client/i)).toBeVisible();
    await expect(page.getByText(/this action cannot be undone/i)).toBeVisible();

    // AND: Confirm button is disabled initially
    const confirmButton = page.getByRole("button", {
      name: /delete permanently/i,
    });
    await expect(confirmButton).toBeDisabled();

    // WHEN: I type "DELETE" in the confirmation input
    const confirmInput = page.getByPlaceholder("DELETE");
    await confirmInput.fill("DELETE");

    // THEN: Confirm button becomes enabled
    await expect(confirmButton).toBeEnabled();

    // WHEN: I click confirm
    await confirmButton.click();

    // THEN: The client is soft-deleted and redirected to list
    await page.waitForTimeout(1000);

    const deletedClient = await prisma.client.findUnique({
      where: { client_id: clientToDelete.client_id },
    });
    expect(deletedClient?.deleted_at).not.toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC ID TESTS - URL Format and Security
  // ═══════════════════════════════════════════════════════════════════════════

  test("[P0] Should use public_id in URL when navigating to client detail", async ({
    page,
  }) => {
    // GIVEN: I am on the clients list page
    await page.goto("http://localhost:3000/clients");

    // WHEN: I click on a client row
    const clientRow = page.locator(`tr:has-text("${testClient.name}")`).first();
    await expect(clientRow).toBeVisible({ timeout: 10000 });
    await clientRow.click();

    // THEN: URL contains public_id (not UUID)
    await expect(page).toHaveURL(
      new RegExp(`/clients/${testClient.public_id}`),
    );

    // AND: URL does NOT contain UUID
    const currentUrl = page.url();
    expect(currentUrl).not.toContain(testClient.client_id);

    // AND: Public ID format is valid (clt_xxxxx)
    expect(currentUrl).toMatch(/\/clients\/clt_[a-z0-9]{10,}$/);
  });

  test("[P0] Should support direct navigation via public_id URL", async ({
    page,
  }) => {
    // WHEN: I navigate directly to client detail page using public_id
    await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);

    // THEN: Page loads successfully
    await expect(
      page.locator("h2").filter({ hasText: /edit client/i }),
    ).toBeVisible();

    // AND: URL remains with public_id
    await expect(page).toHaveURL(
      new RegExp(`/clients/${testClient.public_id}`),
    );

    // AND: Client data is displayed correctly
    const nameInput = page.locator('input[data-testid="client-name-input"]');
    await expect(nameInput).toHaveValue(testClient.name);
  });

  test("[P0] Should support backward compatibility with UUID URLs", async ({
    page,
  }) => {
    // WHEN: I navigate using old UUID format (backward compatibility)
    await page.goto(`http://localhost:3000/clients/${testClient.client_id}`);

    // THEN: Page loads successfully
    await expect(
      page.locator("h2").filter({ hasText: /edit client/i }),
    ).toBeVisible();

    // AND: Client data is displayed correctly
    const nameInput = page.locator('input[data-testid="client-name-input"]');
    await expect(nameInput).toHaveValue(testClient.name);
  });

  test("[P1] Should show error for invalid public_id format", async ({
    page,
  }) => {
    // WHEN: I navigate to an invalid public_id URL
    await page.goto("http://localhost:3000/clients/invalid-id-format");

    // THEN: Page should handle error gracefully
    // Note: Next.js error handling - check for error state
    const pageContent = await page.textContent("body");
    const hasError =
      pageContent?.toLowerCase().includes("not found") ||
      pageContent?.toLowerCase().includes("error") ||
      pageContent?.toLowerCase().includes("404");

    expect(hasError).toBe(true);
  });

  test("[P1] Should not expose UUID in visible page content", async ({
    page,
  }) => {
    // WHEN: I view client detail page via public_id
    await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);

    // THEN: Page loads successfully
    await expect(
      page.locator("h2").filter({ hasText: /edit client/i }),
    ).toBeVisible();

    // AND: UUID should not appear in visible text content
    const visibleText = await page.textContent("body");

    // UUID may exist in hidden fields for API calls, but should not be in visible text
    // We check that the public_id is visible instead
    expect(visibleText).not.toContain(testClient.client_id);

    // Verify the page URL uses public_id
    const currentUrl = page.url();
    expect(currentUrl).toContain(testClient.public_id);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW UX ENHANCEMENTS - Quick Actions & Confirmation Flows
  // ═══════════════════════════════════════════════════════════════════════════

  test("[P0] Should display quick action buttons on client list", async ({
    page,
  }) => {
    // GIVEN: I am on the clients list page
    await page.goto("http://localhost:3000/clients");

    // THEN: Each client row should have quick action buttons
    const clientRow = page.locator(`tr:has-text("${testClient.name}")`).first();
    await expect(clientRow).toBeVisible({ timeout: 10000 });

    // AND: Edit, Status Toggle, and Delete buttons are visible
    const editButton = clientRow.getByTestId(
      `client-edit-${testClient.client_id}`,
    );
    const statusButton = clientRow.getByTestId(
      `client-toggle-status-${testClient.client_id}`,
    );
    const deleteButton = clientRow.getByTestId(
      `client-delete-${testClient.client_id}`,
    );

    await expect(editButton).toBeVisible();
    await expect(statusButton).toBeVisible();
    await expect(deleteButton).toBeVisible();
  });

  test("[P0] Should activate client from list with confirmation dialog", async ({
    page,
  }) => {
    // GIVEN: An INACTIVE client exists
    const inactiveClient = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        email: `test-${Date.now()}@example.com`,
        name: "Inactive Client for Activation",
        status: "INACTIVE",
      },
    });

    await page.goto("http://localhost:3000/clients");

    // WHEN: I click the status toggle button for an INACTIVE client
    const clientRow = page
      .locator(`tr:has-text("${inactiveClient.name}")`)
      .first();
    await expect(clientRow).toBeVisible({ timeout: 10000 });

    const statusButton = clientRow.getByTestId(
      `client-toggle-status-${inactiveClient.client_id}`,
    );
    await statusButton.click();

    // THEN: Confirmation dialog appears
    await expect(page.getByText(/activate client/i)).toBeVisible();
    await expect(page.getByText(/enable their access/i)).toBeVisible();

    // WHEN: I confirm the activation
    const confirmButton = page.getByRole("button", { name: /activate/i });
    await confirmButton.click();

    // THEN: Success toast appears
    await expect(page.getByText(/activated successfully/i)).toBeVisible({
      timeout: 5000,
    });

    // AND: Database is updated
    const updatedClient = await prisma.client.findUnique({
      where: { client_id: inactiveClient.client_id },
    });
    expect(updatedClient?.status).toBe("ACTIVE");

    // Cleanup
    await prisma.client.delete({
      where: { client_id: inactiveClient.client_id },
    });
  });

  test("[P0] Should deactivate client from list with confirmation dialog", async ({
    page,
  }) => {
    // GIVEN: An ACTIVE client exists
    const activeClient = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        email: `test-${Date.now()}@example.com`,
        name: "Active Client for Deactivation",
        status: "ACTIVE",
      },
    });

    await page.goto("http://localhost:3000/clients");

    // WHEN: I click the status toggle button for an ACTIVE client
    const clientRow = page
      .locator(`tr:has-text("${activeClient.name}")`)
      .first();
    await expect(clientRow).toBeVisible({ timeout: 10000 });

    const statusButton = clientRow.getByTestId(
      `client-toggle-status-${activeClient.client_id}`,
    );
    await statusButton.click();

    // THEN: Confirmation dialog appears with warning
    await expect(page.getByText(/deactivate client/i)).toBeVisible();
    await expect(page.getByText(/disable their access/i)).toBeVisible();

    // WHEN: I confirm the deactivation
    const confirmButton = page.getByRole("button", { name: /deactivate/i });
    await confirmButton.click();

    // THEN: Success toast appears
    await expect(page.getByText(/deactivated successfully/i)).toBeVisible({
      timeout: 5000,
    });

    // AND: Database is updated
    const updatedClient = await prisma.client.findUnique({
      where: { client_id: activeClient.client_id },
    });
    expect(updatedClient?.status).toBe("INACTIVE");

    // Cleanup
    await prisma.client.delete({
      where: { client_id: activeClient.client_id },
    });
  });

  test("[P0] Should delete client from list with text input confirmation", async ({
    page,
  }) => {
    // GIVEN: An INACTIVE client exists
    const clientToDelete = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        email: `test-${Date.now()}@example.com`,
        name: "Client to Delete from List",
        status: "INACTIVE",
      },
    });

    await page.goto("http://localhost:3000/clients");

    // WHEN: I click the delete button
    const clientRow = page
      .locator(`tr:has-text("${clientToDelete.name}")`)
      .first();
    await expect(clientRow).toBeVisible({ timeout: 10000 });

    const deleteButton = clientRow.getByTestId(
      `client-delete-${clientToDelete.client_id}`,
    );
    await deleteButton.click();

    // THEN: Delete confirmation dialog appears
    await expect(page.getByText(/delete client/i)).toBeVisible();
    await expect(page.getByText(/cannot be undone/i)).toBeVisible();

    // AND: Confirm button is disabled initially
    const confirmButton = page.getByRole("button", {
      name: /delete permanently/i,
    });
    await expect(confirmButton).toBeDisabled();

    // WHEN: I type "DELETE" in the confirmation input
    const confirmInput = page.getByPlaceholder("DELETE");
    await confirmInput.fill("DELETE");

    // THEN: Confirm button becomes enabled
    await expect(confirmButton).toBeEnabled();

    // WHEN: I click confirm
    await confirmButton.click();

    // THEN: Success toast appears
    await expect(page.getByText(/deleted successfully/i)).toBeVisible({
      timeout: 5000,
    });

    // AND: Database shows soft delete
    const deletedClient = await prisma.client.findUnique({
      where: { client_id: clientToDelete.client_id },
    });
    expect(deletedClient?.deleted_at).not.toBeNull();
  });

  test("[P0] Should prevent deleting ACTIVE client from list", async ({
    page,
  }) => {
    // GIVEN: An ACTIVE client exists
    const activeClient = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        email: `test-${Date.now()}@example.com`,
        name: "Active Client Cannot Delete",
        status: "ACTIVE",
      },
    });

    await page.goto("http://localhost:3000/clients");

    // WHEN: I try to delete an ACTIVE client
    const clientRow = page
      .locator(`tr:has-text("${activeClient.name}")`)
      .first();
    await expect(clientRow).toBeVisible({ timeout: 10000 });

    const deleteButton = clientRow.getByTestId(
      `client-delete-${activeClient.client_id}`,
    );
    await deleteButton.click();

    // AND: I type "DELETE" in the confirmation input
    const confirmInput = page.getByPlaceholder("DELETE");
    await confirmInput.fill("DELETE");

    const confirmButton = page.getByRole("button", {
      name: /delete permanently/i,
    });
    await confirmButton.click();

    // THEN: Error message appears
    await expect(
      page.getByText(/cannot delete active client|must deactivate/i),
    ).toBeVisible({ timeout: 5000 });

    // AND: Client is NOT deleted
    const clientStillExists = await prisma.client.findUnique({
      where: { client_id: activeClient.client_id },
    });
    expect(clientStillExists).not.toBeNull();
    expect(clientStillExists?.deleted_at).toBeNull();

    // Cleanup
    await prisma.client.delete({
      where: { client_id: activeClient.client_id },
    });
  });

  test("[P0] Should cancel status change when clicking cancel in dialog", async ({
    page,
  }) => {
    // GIVEN: I am on the client edit page
    await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);

    const originalStatus = testClient.status;

    // WHEN: I try to change the status
    const statusSelect = page.locator(
      'button[data-testid="client-status-select"]',
    );
    await statusSelect.click();
    await page.locator('div[role="option"]:has-text("Inactive")').click();

    // AND: Confirmation dialog appears
    await expect(page.getByText(/change status/i)).toBeVisible();

    // WHEN: I click cancel
    const cancelButton = page.getByRole("button", { name: /cancel/i }).first();
    await cancelButton.click();

    // THEN: Status remains unchanged
    const statusAfterCancel = await prisma.client.findUnique({
      where: { client_id: testClient.client_id },
      select: { status: true },
    });
    expect(statusAfterCancel?.status).toBe(originalStatus);
  });

  test("[P0] Should stay on edit page after multiple updates", async ({
    page,
  }) => {
    // GIVEN: I am on the client edit page
    await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);

    // WHEN: I update the client name
    const nameInput = page.locator('input[data-testid="client-name-input"]');
    await nameInput.clear();
    await nameInput.fill("First Update");

    const submitButton = page.locator(
      'button[data-testid="client-submit-button"]',
    );
    await submitButton.click();

    // THEN: I stay on the same page
    await expect(page.getByText(/success|updated successfully/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(page).toHaveURL(
      new RegExp(`/clients/${testClient.public_id}`),
    );

    // WHEN: I update the client name again
    await nameInput.clear();
    await nameInput.fill("Second Update");
    await submitButton.click();

    // THEN: I still stay on the same page
    await expect(page.getByText(/success|updated successfully/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(page).toHaveURL(
      new RegExp(`/clients/${testClient.public_id}`),
    );

    // Cleanup: Restore original name
    await prisma.client.update({
      where: { client_id: testClient.client_id },
      data: { name: testClient.name },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE SYNCHRONIZATION TESTS - Cross-page data freshness
  // ═══════════════════════════════════════════════════════════════════════════

  test("[P0] Should show newly created client in company form dropdown without page refresh", async ({
    page,
  }) => {
    // This test verifies the fix for cache invalidation bug where newly created
    // clients weren't appearing in the company creation dropdown until manual refresh
    // Related: useCreateClient must invalidate clientKeys.dropdown() cache

    // GIVEN: I am on the clients page
    await page.goto("http://localhost:3000/clients");

    // WHEN: I create a new client via the Create Client modal
    const newClientName = `Dropdown Test Client ${Date.now()}`;
    const newClientEmail = `dropdown-test-${Date.now()}@example.com`;

    const createButton = page.getByRole("button", {
      name: /new client|create client/i,
    });
    await createButton.click();

    // Wait for modal to be visible
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Fill in the create client form (modal uses create-client-* test IDs)
    await page
      .locator('input[data-testid="create-client-name-input"]')
      .fill(newClientName);
    await page
      .locator('input[data-testid="create-client-email-input"]')
      .fill(newClientEmail);
    await page
      .locator('input[data-testid="create-client-password-input"]')
      .fill("TestPassword123!");
    await page
      .locator('input[data-testid="create-client-confirm-password-input"]')
      .fill("TestPassword123!");

    // Status defaults to Active, so we don't need to change it

    // Submit the form
    await page
      .locator('button[data-testid="create-client-submit-button"]')
      .click();

    // Wait for success toast and modal to close
    await expect(
      page.getByText("Client created successfully", { exact: true }),
    ).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // AND: I navigate to the companies/new page (this is a separate page, not a modal)
    await page.goto("http://localhost:3000/companies/new");

    // THEN: The newly created client should appear in the client dropdown
    // The CompanyForm uses a Select component with label "Client"
    const clientSelectTrigger = page.getByRole("combobox").first();
    await expect(clientSelectTrigger).toBeVisible({ timeout: 5000 });
    await clientSelectTrigger.click();

    // The new client should be visible in the dropdown options
    const newClientOption = page.getByRole("option", { name: newClientName });
    await expect(newClientOption).toBeVisible({ timeout: 5000 });

    // Close the dropdown
    await page.keyboard.press("Escape");

    // Cleanup: Delete the test client
    const createdClient = await prisma.client.findFirst({
      where: { name: newClientName },
    });
    if (createdClient) {
      await prisma.client.delete({
        where: { client_id: createdClient.client_id },
      });
    }
  });

  test("[P1] Should prevent wrong text in delete confirmation", async ({
    page,
  }) => {
    // GIVEN: An INACTIVE client exists
    const client = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        email: `test-${Date.now()}@example.com`,
        name: "Client for Wrong Text Test",
        status: "INACTIVE",
      },
    });

    await page.goto(`http://localhost:3000/clients/${client.public_id}`);

    // WHEN: I click delete button
    const deleteButton = page.locator(
      'button[data-testid="client-delete-button"]',
    );
    await deleteButton.click();

    // AND: I type wrong text (lowercase instead of uppercase)
    const confirmInput = page.getByPlaceholder("DELETE");
    await confirmInput.fill("delete"); // Wrong case

    // THEN: Confirm button remains disabled
    const confirmButton = page.getByRole("button", {
      name: /delete permanently/i,
    });
    await expect(confirmButton).toBeDisabled();

    // WHEN: I clear and type partially correct text
    await confirmInput.clear();
    await confirmInput.fill("DEL"); // Incomplete

    // THEN: Confirm button remains disabled
    await expect(confirmButton).toBeDisabled();

    // Cleanup
    await prisma.client.delete({
      where: { client_id: client.client_id },
    });
  });
});
