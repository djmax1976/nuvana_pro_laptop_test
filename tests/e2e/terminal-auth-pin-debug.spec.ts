/**
 * Terminal Authentication PIN E2E Tests
 *
 * Story: 4.9 - MyStore Terminal Dashboard
 *
 * Tests the PIN input functionality in the terminal authentication modal:
 * 1. PIN input accepts user input in new shift mode
 * 2. PIN input accepts user input in resume shift mode
 * 3. PIN validation (4-digit numeric requirement)
 * 4. Form submission with valid PIN
 *
 * Priority: P0 (Critical - Regression protection for PIN authentication)
 *
 * Uses isolated test data with proper setup and cleanup.
 */

import { test, expect, Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { createTerminal } from "../support/factories/terminal.factory";
import { createCashier } from "../support/factories/cashier.factory";

/**
 * Helper function to perform login and wait for /mystore redirect.
 */
async function loginAndWaitForMyStore(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);

  // Wait for navigation to /mystore after form submission
  await Promise.all([
    page.waitForURL(/.*mystore.*/, { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

/**
 * Helper function to wait for terminal links and return count
 */
async function waitForTerminalLinks(page: Page): Promise<number> {
  const terminalLinks = page.locator('[data-testid^="terminal-link-"]');
  try {
    await terminalLinks.first().waitFor({ state: "visible", timeout: 30000 });
    return await terminalLinks.count();
  } catch {
    return 0;
  }
}

test.describe("4.9-E2E: Terminal Authentication PIN Input Tests", () => {
  // Run tests in this suite serially to share setup data
  test.describe.configure({ mode: "serial" });

  let prisma: PrismaClient;
  let clientUser: any;
  let company: any;
  let store: any;
  let terminal: any;
  let cashier: any;
  const password = "TestPassword123!";
  const cashierPin = "1234";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const companyId = uuidv4();
    const storeId = uuidv4();

    // Create test CLIENT_USER
    clientUser = await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-pin-test-${Date.now()}@test.com`,
        name: "E2E PIN Test User",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    // Create company
    company = await prisma.company.create({
      data: {
        company_id: companyId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "E2E PIN Test Company",
        address: "123 PIN Test Street",
        status: "ACTIVE",
        owner_user_id: clientUser.user_id,
      },
    });

    // Create store
    store = await prisma.store.create({
      data: {
        store_id: storeId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "E2E PIN Test Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        location_json: { address: "456 Store Ave" },
      },
    });

    // Create terminal
    terminal = await prisma.pOSTerminal.create({
      data: createTerminal({
        store_id: store.store_id,
        name: "PIN Test Terminal",
        connection_type: "NETWORK",
        terminal_status: "ACTIVE",
      }),
    });

    // Create cashier with known PIN for testing authentication
    const cashierData = await createCashier({
      store_id: store.store_id,
      created_by: clientUser.user_id,
      pin: cashierPin,
      name: "Test Cashier Jane",
    });
    cashier = await prisma.cashier.create({
      data: cashierData,
    });

    // Assign CLIENT_USER role to the user for the store
    const clientUserRole = await prisma.role.findUnique({
      where: { code: "CLIENT_USER" },
    });
    if (clientUserRole) {
      await prisma.userRole.create({
        data: {
          user_id: clientUser.user_id,
          role_id: clientUserRole.role_id,
          company_id: company.company_id,
          store_id: store.store_id,
        },
      });
    }
  });

  test.afterAll(async () => {
    // Cleanup in proper order (reverse of creation)
    if (cashier) {
      // First delete any shifts that reference this cashier
      await prisma.shift
        .deleteMany({ where: { cashier_id: cashier.cashier_id } })
        .catch(() => {});
      await prisma.cashier
        .delete({ where: { cashier_id: cashier.cashier_id } })
        .catch(() => {});
    }
    if (terminal) {
      await prisma.pOSTerminal
        .delete({ where: { pos_terminal_id: terminal.pos_terminal_id } })
        .catch(() => {});
    }
    if (store) {
      await prisma.store
        .delete({ where: { store_id: store.store_id } })
        .catch(() => {});
    }
    if (company) {
      await prisma.company
        .delete({ where: { company_id: company.company_id } })
        .catch(() => {});
    }
    if (clientUser) {
      await prisma.userRole
        .deleteMany({ where: { user_id: clientUser.user_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: clientUser.user_id } })
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("[P0] 4.9-PIN-001: PIN input should accept user input in new shift mode", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAndWaitForMyStore(page, clientUser.email, password);

    // Wait for sidebar to load
    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Wait for terminals to load
    const terminalCount = await waitForTerminalLinks(page);
    expect(terminalCount).toBeGreaterThan(0);

    // WHEN: User clicks on a terminal
    await page.getByTestId(`terminal-link-${terminal.pos_terminal_id}`).click();

    // THEN: Modal should open
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });

    // AND: PIN input should be visible and enabled
    const pinInput = page.getByTestId("pin-number-input");
    await expect(pinInput).toBeVisible();
    await expect(pinInput).toBeEnabled();

    // WHEN: User types in the PIN input
    await pinInput.click();
    await pinInput.fill("1234");

    // THEN: PIN input should contain the typed value
    const value = await pinInput.inputValue();
    expect(value).toBe("1234");
  });

  test("[P0] 4.9-PIN-002: PIN input should accept keyboard input character by character", async ({
    page,
  }) => {
    // GIVEN: User is logged in and terminal auth modal is open
    await loginAndWaitForMyStore(page, clientUser.email, password);

    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const terminalCount = await waitForTerminalLinks(page);
    expect(terminalCount).toBeGreaterThan(0);

    await page.getByTestId(`terminal-link-${terminal.pos_terminal_id}`).click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });

    const pinInput = page.getByTestId("pin-number-input");
    await expect(pinInput).toBeVisible();

    // WHEN: User types using keyboard sequentially
    await pinInput.click();
    await pinInput.pressSequentially("5678", { delay: 50 });

    // THEN: PIN input should contain all typed characters
    const value = await pinInput.inputValue();
    expect(value).toBe("5678");
  });

  test("[P1] 4.9-PIN-003: PIN input should have correct attributes", async ({
    page,
  }) => {
    // GIVEN: User is logged in and terminal auth modal is open
    await loginAndWaitForMyStore(page, clientUser.email, password);

    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const terminalCount = await waitForTerminalLinks(page);
    expect(terminalCount).toBeGreaterThan(0);

    await page.getByTestId(`terminal-link-${terminal.pos_terminal_id}`).click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });

    const pinInput = page.getByTestId("pin-number-input");
    await expect(pinInput).toBeVisible();

    // THEN: PIN input should have password type for security
    const inputType = await pinInput.getAttribute("type");
    expect(inputType).toBe("password");

    // AND: PIN input should not be disabled
    const isDisabled = await pinInput.isDisabled();
    expect(isDisabled).toBe(false);

    // AND: PIN input should be editable
    const isEditable = await pinInput.isEditable();
    expect(isEditable).toBe(true);

    // AND: PIN input should have autocomplete off for security
    const autocomplete = await pinInput.getAttribute("autocomplete");
    expect(autocomplete).toBe("off");
  });

  test("[P1] 4.9-PIN-004: Form should show validation error for invalid PIN format", async ({
    page,
  }) => {
    // GIVEN: User is logged in and terminal auth modal is open
    await loginAndWaitForMyStore(page, clientUser.email, password);

    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const terminalCount = await waitForTerminalLinks(page);
    expect(terminalCount).toBeGreaterThan(0);

    await page.getByTestId(`terminal-link-${terminal.pos_terminal_id}`).click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });

    // GIVEN: Cashier is selected
    const cashierSelect = page.getByTestId("cashier-name-select");
    await expect(cashierSelect).toBeVisible({ timeout: 10000 });
    await cashierSelect.click();

    // Wait for dropdown content and select cashier
    const cashierOption = page.getByRole("option", { name: cashier.name });
    await expect(cashierOption).toBeVisible({ timeout: 5000 });
    await cashierOption.click();

    // WHEN: User enters an invalid PIN (not 4 digits)
    const pinInput = page.getByTestId("pin-number-input");
    await pinInput.fill("12"); // Only 2 digits

    // AND: User attempts to submit
    await page.getByTestId("terminal-auth-submit-button").click();

    // THEN: Validation error should be displayed with exact message
    const pinError = page.getByTestId("pin-number-error");
    await expect(pinError).toBeVisible({ timeout: 5000 });
    await expect(pinError).toContainText(
      /PIN must be exactly 4 numeric digits/i,
    );
  });

  test("[P1] 4.9-PIN-005: Form should show validation error for empty PIN", async ({
    page,
  }) => {
    // GIVEN: User is logged in and terminal auth modal is open
    await loginAndWaitForMyStore(page, clientUser.email, password);

    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const terminalCount = await waitForTerminalLinks(page);
    expect(terminalCount).toBeGreaterThan(0);

    await page.getByTestId(`terminal-link-${terminal.pos_terminal_id}`).click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });

    // GIVEN: Cashier is selected
    const cashierSelect = page.getByTestId("cashier-name-select");
    await expect(cashierSelect).toBeVisible({ timeout: 10000 });
    await cashierSelect.click();

    // Wait for dropdown content and select cashier
    const cashierOption = page.getByRole("option", { name: cashier.name });
    await expect(cashierOption).toBeVisible({ timeout: 5000 });
    await cashierOption.click();

    // WHEN: PIN is left empty and user submits
    // Don't fill PIN - leave it empty
    await page.getByTestId("terminal-auth-submit-button").click();

    // THEN: Validation error for PIN should be displayed
    const pinError = page.getByTestId("pin-number-error");
    await expect(pinError).toBeVisible({ timeout: 5000 });
    // PIN number is required OR PIN must be exactly 4 numeric digits
    await expect(pinError).toContainText(
      /PIN number is required|PIN must be exactly 4 numeric digits/i,
    );
  });

  test("[P0] 4.9-PIN-006: Cancel button should close modal and clear form", async ({
    page,
  }) => {
    // GIVEN: User is logged in and terminal auth modal is open
    await loginAndWaitForMyStore(page, clientUser.email, password);

    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const terminalCount = await waitForTerminalLinks(page);
    expect(terminalCount).toBeGreaterThan(0);

    await page.getByTestId(`terminal-link-${terminal.pos_terminal_id}`).click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });

    // GIVEN: User has entered some data
    const pinInput = page.getByTestId("pin-number-input");
    await pinInput.fill("1234");

    // WHEN: User clicks cancel
    await page.getByTestId("terminal-auth-cancel-button").click();

    // THEN: Modal should be closed
    await expect(page.getByTestId("terminal-auth-modal")).not.toBeVisible({
      timeout: 5000,
    });

    // WHEN: User reopens the modal
    await page.getByTestId(`terminal-link-${terminal.pos_terminal_id}`).click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });

    // THEN: Form should be reset (PIN should be empty)
    const newPinValue = await page.getByTestId("pin-number-input").inputValue();
    expect(newPinValue).toBe("");
  });

  test("[P1] 4.9-PIN-007: PIN input should not accept non-numeric characters", async ({
    page,
  }) => {
    // GIVEN: User is logged in and terminal auth modal is open
    await loginAndWaitForMyStore(page, clientUser.email, password);

    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const terminalCount = await waitForTerminalLinks(page);
    expect(terminalCount).toBeGreaterThan(0);

    await page.getByTestId(`terminal-link-${terminal.pos_terminal_id}`).click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });

    // GIVEN: Cashier is selected
    const cashierSelect = page.getByTestId("cashier-name-select");
    await expect(cashierSelect).toBeVisible({ timeout: 10000 });
    await cashierSelect.click();

    const cashierOption = page.getByRole("option", { name: cashier.name });
    await expect(cashierOption).toBeVisible({ timeout: 5000 });
    await cashierOption.click();

    // WHEN: User enters letters mixed with numbers
    const pinInput = page.getByTestId("pin-number-input");
    await pinInput.fill("ab12");

    // AND: User submits the form
    await page.getByTestId("terminal-auth-submit-button").click();

    // THEN: Validation error should be shown for non-numeric PIN
    const pinError = page.getByTestId("pin-number-error");
    await expect(pinError).toBeVisible({ timeout: 5000 });
    // Exact validation message from implementation
    await expect(pinError).toContainText(
      /PIN must be exactly 4 numeric digits/i,
    );
  });

  test("[P0] 4.9-PIN-008: Modal should display correct form fields in new shift mode", async ({
    page,
  }) => {
    // GIVEN: User is logged in and terminal auth modal is open
    await loginAndWaitForMyStore(page, clientUser.email, password);

    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const terminalCount = await waitForTerminalLinks(page);
    expect(terminalCount).toBeGreaterThan(0);

    await page.getByTestId(`terminal-link-${terminal.pos_terminal_id}`).click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });

    // THEN: In new shift mode, should show cashier dropdown
    const cashierSelect = page.getByTestId("cashier-name-select");
    await expect(cashierSelect).toBeVisible({ timeout: 10000 });

    // AND: PIN input should be visible
    const pinInput = page.getByTestId("pin-number-input");
    await expect(pinInput).toBeVisible();

    // AND: Submit button should say "Start Shift"
    const submitButton = page.getByTestId("terminal-auth-submit-button");
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toContainText(/start shift/i);

    // AND: Cancel button should be visible
    await expect(page.getByTestId("terminal-auth-cancel-button")).toBeVisible();

    // AND: Shift owner display should NOT be visible (only in resume mode)
    await expect(page.getByTestId("shift-owner-display")).not.toBeVisible();
  });

  test("[P0] 4.9-PIN-009: Escape key should close the modal", async ({
    page,
  }) => {
    // GIVEN: User is logged in and terminal auth modal is open
    await loginAndWaitForMyStore(page, clientUser.email, password);

    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const terminalCount = await waitForTerminalLinks(page);
    expect(terminalCount).toBeGreaterThan(0);

    await page.getByTestId(`terminal-link-${terminal.pos_terminal_id}`).click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });

    // WHEN: User presses Escape key
    await page.keyboard.press("Escape");

    // THEN: Modal should be closed
    await expect(page.getByTestId("terminal-auth-modal")).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("[P1] 4.9-PIN-010: Cashier select should be accessible when opening modal in new shift mode", async ({
    page,
  }) => {
    // GIVEN: User is logged in
    await loginAndWaitForMyStore(page, clientUser.email, password);

    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const terminalCount = await waitForTerminalLinks(page);
    expect(terminalCount).toBeGreaterThan(0);

    // WHEN: User opens terminal auth modal
    await page.getByTestId(`terminal-link-${terminal.pos_terminal_id}`).click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });

    // Wait for cashier select to be ready (better than arbitrary timeout)
    const cashierSelect = page.getByTestId("cashier-name-select");
    await expect(cashierSelect).toBeVisible({ timeout: 5000 });

    // THEN: In new shift mode, the cashier select should be accessible
    // Note: PIN input has autoFocus={isResumeMode}, so it's only auto-focused in resume mode
    // In new shift mode, cashier select should be the first interactive element
    await expect(cashierSelect).toBeEnabled();

    // AND: PIN input should also be visible and enabled (but not auto-focused)
    const pinInput = page.getByTestId("pin-number-input");
    await expect(pinInput).toBeVisible();
    await expect(pinInput).toBeEnabled();
  });
});
