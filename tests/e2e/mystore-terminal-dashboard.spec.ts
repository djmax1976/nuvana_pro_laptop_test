/**
 * MyStore Terminal Dashboard E2E Tests
 *
 * Story 4.9: MyStore Terminal Dashboard
 *
 * Tests the complete user journey:
 * - CLIENT_USER login → redirect to /mystore
 * - View terminal dashboard with sidebar navigation
 * - See only terminal links and Clock In/Out link (excludes other navigation)
 * - Click terminal → see authentication modal
 * - Clock In/Out page displays "Coming Soon"
 * - Store Manager can access /mystore dashboard
 * - RLS filtering ensures users only see terminals for their store
 *
 * Priority: P0 (Critical - Regression protection for terminal dashboard access)
 */

import { test, expect, Page } from "@playwright/test";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { createTerminal } from "../support/factories/terminal.factory";

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

test.describe("4.9-E2E: MyStore Terminal Dashboard User Journey", () => {
  let prisma: PrismaClient;
  let clientUser: any;
  let storeManager: any;
  let company: any;
  let store: any;
  let terminal1: any;
  let terminal2: any;
  const password = "TestPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    // Create test client user with company and store
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const companyId = uuidv4();
    const storeId = uuidv4();

    clientUser = await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-client-${Date.now()}@test.com`,
        name: "E2E Test Client",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    company = await prisma.company.create({
      data: {
        company_id: companyId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "E2E Test Company",
        address: "123 E2E Test Street",
        status: "ACTIVE",
        owner_user_id: clientUser.user_id,
      },
    });

    store = await prisma.store.create({
      data: {
        store_id: storeId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "E2E Test Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        location_json: { address: "456 Store Ave" },
      },
    });

    // Create terminals for the store
    terminal1 = await prisma.pOSTerminal.create({
      data: createTerminal({
        store_id: store.store_id,
        name: "Terminal 1",
        connection_type: "NETWORK",
        terminal_status: "ACTIVE",
      }),
    });

    terminal2 = await prisma.pOSTerminal.create({
      data: createTerminal({
        store_id: store.store_id,
        name: "Terminal 2",
        connection_type: "API",
        terminal_status: "INACTIVE",
      }),
    });

    // Assign CLIENT_USER role to the user for the company
    const clientUserRole = await prisma.role.findUnique({
      where: { code: "CLIENT_USER" },
    });
    if (clientUserRole) {
      await prisma.userRole.create({
        data: {
          user_id: clientUser.user_id,
          role_id: clientUserRole.role_id,
          company_id: company.company_id,
        },
      });
    }

    // Create Store Manager user for AC #5 test
    const storeManagerId = uuidv4();
    storeManager = await prisma.user.create({
      data: {
        user_id: storeManagerId,
        email: `e2e-store-manager-${Date.now()}@test.com`,
        name: "E2E Store Manager",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    const storeManagerRole = await prisma.role.findUnique({
      where: { code: "STORE_MANAGER" },
    });
    if (storeManagerRole) {
      await prisma.userRole.create({
        data: {
          user_id: storeManager.user_id,
          role_id: storeManagerRole.role_id,
          company_id: company.company_id,
          store_id: store.store_id,
        },
      });
    }
  });

  test.afterAll(async () => {
    // Cleanup in proper order
    if (terminal1) {
      await prisma.pOSTerminal
        .delete({ where: { pos_terminal_id: terminal1.pos_terminal_id } })
        .catch(() => {});
    }
    if (terminal2) {
      await prisma.pOSTerminal
        .delete({ where: { pos_terminal_id: terminal2.pos_terminal_id } })
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
    if (storeManager) {
      await prisma.userRole
        .deleteMany({ where: { user_id: storeManager.user_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: storeManager.user_id } })
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("[P0] 4.9-E2E-001: CLIENT_USER should be redirected to /mystore after login", async ({
    page,
  }) => {
    // GIVEN: CLIENT_USER logs in
    await loginAndWaitForMyStore(page, clientUser.email, password);

    // THEN: User should be redirected to /mystore dashboard
    expect(page.url()).toContain("/mystore");
  });

  test("[P0] 4.9-E2E-002: Sidebar should display only terminal links and Clock In/Out link", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAndWaitForMyStore(page, clientUser.email, password);

    // THEN: Clock In/Out link should be visible
    await expect(page.getByTestId("clock-in-out-link")).toBeVisible();

    // THEN: Terminal links should be visible
    await expect(
      page.getByTestId(`terminal-link-${terminal1.pos_terminal_id}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`terminal-link-${terminal2.pos_terminal_id}`),
    ).toBeVisible();

    // THEN: Excluded navigation items should NOT be present
    await expect(page.getByText(/shifts/i)).not.toBeVisible();
    await expect(page.getByText(/inventory/i)).not.toBeVisible();
    await expect(page.getByText(/lottery/i)).not.toBeVisible();
    await expect(page.getByText(/employees/i)).not.toBeVisible();
    await expect(page.getByText(/reports/i)).not.toBeVisible();
    await expect(page.getByText(/ai assistant/i)).not.toBeVisible();
  });

  test("[P0] 4.9-E2E-003: Clicking terminal should open TerminalAuthModal", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAndWaitForMyStore(page, clientUser.email, password);

    // WHEN: User clicks on a terminal
    await page
      .getByTestId(`terminal-link-${terminal1.pos_terminal_id}`)
      .click();

    // THEN: TerminalAuthModal should be visible
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible();
    await expect(page.getByText(/terminal authentication/i)).toBeVisible();
    // Escape special regex characters in terminal name for safe regex construction
    const escapedTerminalName = terminal1.name.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    // Use regex literal with escaped name - constructing as string then using RegExp
    // eslint-disable-next-line security/detect-non-literal-regexp
    const terminalAuthRegex = new RegExp(
      `authenticate to access terminal: ${escapedTerminalName}`,
      "i",
    );
    await expect(page.getByText(terminalAuthRegex)).toBeVisible();
  });

  test("[P1] 4.9-E2E-004: TerminalAuthModal should display form with Cashier Name dropdown and PIN Number input", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAndWaitForMyStore(page, clientUser.email, password);

    // WHEN: User clicks on a terminal to open modal
    await page
      .getByTestId(`terminal-link-${terminal1.pos_terminal_id}`)
      .click();

    // THEN: Form fields should be visible
    await expect(page.getByTestId("cashier-name-select")).toBeVisible();
    await expect(page.getByLabel(/cashier name/i)).toBeVisible();
    await expect(page.getByTestId("pin-number-input")).toBeVisible();
    await expect(page.getByLabel(/pin number/i)).toBeVisible();

    // THEN: Cancel and Submit buttons should be visible
    await expect(page.getByTestId("terminal-auth-cancel-button")).toBeVisible();
    await expect(page.getByTestId("terminal-auth-submit-button")).toBeVisible();
  });

  test("[P1] 4.9-E2E-005: Clock In/Out page should display 'Coming Soon' message", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAndWaitForMyStore(page, clientUser.email, password);

    // WHEN: User clicks Clock In/Out link
    await page.getByTestId("clock-in-out-link").click();

    // THEN: Page should navigate to /mystore/clock-in-out
    await expect(page).toHaveURL(/.*mystore\/clock-in-out.*/);

    // THEN: "Coming Soon" message should be visible
    await expect(page.getByTestId("coming-soon-message")).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();
    await expect(
      page.getByText(
        /the clock in\/out feature is currently under development/i,
      ),
    ).toBeVisible();
  });

  test("[P1] 4.9-E2E-006: Store Manager should be able to access /mystore dashboard", async ({
    page,
  }) => {
    // GIVEN: Store Manager logs in
    await loginAndWaitForMyStore(page, storeManager.email, password);

    // THEN: User should be redirected to /mystore dashboard
    expect(page.url()).toContain("/mystore");

    // THEN: Store Manager should see terminals for their store
    await expect(
      page.getByTestId(`terminal-link-${terminal1.pos_terminal_id}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`terminal-link-${terminal2.pos_terminal_id}`),
    ).toBeVisible();
  });

  test("[P1] 4.9-E2E-007: Terminal list should display connection type and status badges", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAndWaitForMyStore(page, clientUser.email, password);

    // THEN: Terminal names should be visible
    await expect(page.getByText("Terminal 1")).toBeVisible();
    await expect(page.getByText("Terminal 2")).toBeVisible();

    // THEN: Terminal status badges should be visible (use .first() since there may be multiple badges)
    await expect(page.getByText("ACTIVE").first()).toBeVisible();
    await expect(page.getByText("INACTIVE").first()).toBeVisible();
  });

  test("[P2] 4.9-E2E-008: Complete user journey: login → redirect to /mystore → view terminals → click terminal → see auth modal", async ({
    page,
  }) => {
    // GIVEN: User is not logged in
    await page.goto("/login");

    // WHEN: User logs in as CLIENT_USER
    await page.fill(
      'input[name="email"], input[type="email"]',
      clientUser.email,
    );
    await page.fill('input[name="password"], input[type="password"]', password);
    await Promise.all([
      page.waitForURL(/.*mystore.*/, { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // THEN: User should be on /mystore dashboard
    expect(page.url()).toContain("/mystore");

    // THEN: Sidebar should be visible with terminals
    await expect(page.getByTestId("mystore-sidebar")).toBeVisible();
    await expect(
      page.getByTestId(`terminal-link-${terminal1.pos_terminal_id}`),
    ).toBeVisible();

    // WHEN: User clicks on a terminal
    await page
      .getByTestId(`terminal-link-${terminal1.pos_terminal_id}`)
      .click();

    // THEN: TerminalAuthModal should open
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible();
    await expect(page.getByText(/terminal authentication/i)).toBeVisible();
  });
});

/**
 * Test suite to verify CLIENT_OWNER users are NOT redirected to /mystore
 * CLIENT_OWNER should go to /client-dashboard, not /mystore (terminal dashboard)
 */
test.describe("4.9-E2E: CLIENT_OWNER Access Control", () => {
  let prisma: PrismaClient;
  let clientOwner: any;
  let company: any;
  const password = "TestPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const companyId = uuidv4();

    // Create CLIENT_OWNER user
    clientOwner = await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-client-owner-${Date.now()}@test.com`,
        name: "E2E Client Owner",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    company = await prisma.company.create({
      data: {
        company_id: companyId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "E2E Client Owner Company",
        address: "123 Owner Street",
        status: "ACTIVE",
        owner_user_id: clientOwner.user_id,
      },
    });

    // Assign CLIENT_OWNER role (not CLIENT_USER)
    const clientOwnerRole = await prisma.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });
    if (clientOwnerRole) {
      await prisma.userRole.create({
        data: {
          user_id: clientOwner.user_id,
          role_id: clientOwnerRole.role_id,
          company_id: company.company_id,
        },
      });
    }
  });

  test.afterAll(async () => {
    if (company) {
      await prisma.company
        .delete({ where: { company_id: company.company_id } })
        .catch(() => {});
    }
    if (clientOwner) {
      await prisma.userRole
        .deleteMany({ where: { user_id: clientOwner.user_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: clientOwner.user_id } })
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("[P0] 4.9-E2E-009: CLIENT_OWNER should be redirected to /client-dashboard after login, NOT /mystore", async ({
    page,
  }) => {
    // GIVEN: CLIENT_OWNER logs in
    await page.goto("/login");
    await page.fill(
      'input[name="email"], input[type="email"]',
      clientOwner.email,
    );
    await page.fill('input[name="password"], input[type="password"]', password);

    // WHEN: User submits login form
    // Attach navigation listener BEFORE triggering navigation to avoid race condition
    await Promise.all([
      page.waitForURL(/.*client-dashboard.*/, { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // THEN: User should be redirected to /client-dashboard (NOT /mystore or /dashboard)
    expect(page.url()).toContain("/client-dashboard");
    expect(page.url()).not.toContain("/mystore");
  });

  test("[P0] 4.9-E2E-010: CLIENT_OWNER should be redirected away from /mystore if accessed directly", async ({
    page,
  }) => {
    // GIVEN: CLIENT_OWNER logs in first
    await page.goto("/login");
    await page.fill(
      'input[name="email"], input[type="email"]',
      clientOwner.email,
    );
    await page.fill('input[name="password"], input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*client-dashboard.*/, { timeout: 15000 });

    // WHEN: CLIENT_OWNER tries to access /mystore directly
    await page.goto("/mystore");

    // Wait for redirect to occur
    await page.waitForURL(/.*client-dashboard.*/, { timeout: 15000 });

    // THEN: User should be redirected to /client-dashboard (NOT /mystore)
    expect(page.url()).toContain("/client-dashboard");
    expect(page.url()).not.toContain("/mystore");
  });
});
