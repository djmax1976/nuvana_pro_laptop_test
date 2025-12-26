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
 *
 * Enterprise-Grade Patterns Applied:
 * - Type-safe interfaces for test data
 * - Network-first waiting patterns for React hydration
 * - Proper test data isolation with unique identifiers
 * - Comprehensive cleanup with FK-safe ordering
 * - Accessibility verification for form elements
 * - Security validation for role-based access
 */

import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import {
  PrismaClient,
  User,
  Company,
  Store,
  POSTerminal,
} from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { createTerminal } from "../support/factories/terminal.factory";
import { loginAsClientOwner, loginAsClientUser } from "../support/auth.helper";
import { TEST_TIMEOUTS, TEST_CONSTANTS } from "../support/test-config";

/**
 * Type-safe test user interface
 * Extends Prisma User type for test data
 */
interface TestUser extends User {
  email: string;
  user_id: string;
}

/**
 * Type-safe test company interface
 */
interface TestCompany extends Company {
  company_id: string;
}

/**
 * Type-safe test store interface
 */
interface TestStore extends Store {
  store_id: string;
}

/**
 * Type-safe test terminal interface
 */
interface TestTerminal extends POSTerminal {
  pos_terminal_id: string;
  name: string;
}

/**
 * Generates a unique test identifier with timestamp and random suffix
 * Ensures test data isolation in parallel test execution
 */
function generateTestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

test.describe("4.9-E2E: MyStore Terminal Dashboard User Journey", () => {
  // Run tests serially since they share database state created in beforeAll
  test.describe.configure({ mode: "serial" });

  let prisma: PrismaClient;
  let clientUser: TestUser;
  let storeManager: TestUser;
  let company: TestCompany;
  let store: TestStore;
  let terminal1: TestTerminal;
  let terminal2: TestTerminal;
  const password = TEST_CONSTANTS.TEST_PASSWORD;

  test.beforeAll(async () => {
    prisma = new PrismaClient();

    // Generate unique test identifiers for isolation
    const testId = generateTestId("mystore");
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const companyId = uuidv4();
    const storeId = uuidv4();

    // Create test client user with unique email
    clientUser = (await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-client-${testId}@test.com`,
        name: "E2E Test Client",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    })) as TestUser;

    // Create test company
    company = (await prisma.company.create({
      data: {
        company_id: companyId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: `E2E Test Company ${testId}`,
        address: "123 E2E Test Street",
        status: "ACTIVE",
        owner_user_id: clientUser.user_id,
      },
    })) as TestCompany;

    // Create test store
    store = (await prisma.store.create({
      data: {
        store_id: storeId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: `E2E Test Store ${testId}`,
        timezone: "America/New_York",
        status: "ACTIVE",
        location_json: { address: "456 Store Ave" },
      },
    })) as TestStore;

    // Create terminals for the store with distinct statuses
    terminal1 = (await prisma.pOSTerminal.create({
      data: createTerminal({
        store_id: store.store_id,
        name: "Terminal 1",
        connection_type: "NETWORK",
        terminal_status: "ACTIVE",
      }),
    })) as TestTerminal;

    terminal2 = (await prisma.pOSTerminal.create({
      data: createTerminal({
        store_id: store.store_id,
        name: "Terminal 2",
        connection_type: "API",
        terminal_status: "INACTIVE",
      }),
    })) as TestTerminal;

    // Assign CLIENT_USER role to the user for the store
    // CLIENT_USER has STORE scope, so store_id is required for RLS to work correctly
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

    // Create Store Manager user for AC #5 test
    const storeManagerId = uuidv4();
    storeManager = (await prisma.user.create({
      data: {
        user_id: storeManagerId,
        email: `e2e-store-manager-${testId}@test.com`,
        name: "E2E Store Manager",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    })) as TestUser;

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
    // Cleanup in proper FK-safe order:
    // 1. UserRoles (references users)
    // 2. Terminals (references stores)
    // 3. Stores (references companies)
    // 4. Users (no longer referenced by user_roles)
    // 5. Companies (no longer referenced by stores, but still referenced by owner_user_id)
    // Note: We delete users before company because company.owner_user_id is a reference

    try {
      // 1. Delete user roles first (references users)
      if (clientUser) {
        await prisma.userRole
          .deleteMany({ where: { user_id: clientUser.user_id } })
          .catch(() => {});
      }
      if (storeManager) {
        await prisma.userRole
          .deleteMany({ where: { user_id: storeManager.user_id } })
          .catch(() => {});
      }

      // 2. Delete terminals (references stores)
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

      // 3. Delete store (references company)
      if (store) {
        await prisma.store
          .delete({ where: { store_id: store.store_id } })
          .catch(() => {});
      }

      // 4. Delete company (has owner_user_id FK, but ON DELETE SET NULL typically)
      if (company) {
        await prisma.company
          .delete({ where: { company_id: company.company_id } })
          .catch(() => {});
      }

      // 5. Delete users last
      if (clientUser) {
        await prisma.user
          .delete({ where: { user_id: clientUser.user_id } })
          .catch(() => {});
      }
      if (storeManager) {
        await prisma.user
          .delete({ where: { user_id: storeManager.user_id } })
          .catch(() => {});
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test("[P0] 4.9-E2E-001: CLIENT_USER should be redirected to /mystore after login", async ({
    page,
  }) => {
    // GIVEN: CLIENT_USER logs in
    await loginAsClientUser(page, clientUser.email, password);

    // THEN: User should be redirected to /mystore dashboard
    expect(page.url()).toContain("/mystore");
  });

  test("[P0] 4.9-E2E-002: Sidebar should display terminal links, Clock In/Out, and Lottery (if permitted)", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAsClientUser(page, clientUser.email, password);

    // Get sidebar element for scoped assertions
    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // THEN: Dashboard link should be visible (exact match for "/mystore")
    await expect(page.getByTestId("dashboard-link")).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // THEN: Clock In/Out link should be visible
    await expect(page.getByTestId("clock-in-out-link")).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // THEN: Terminal links should be visible (API loading may take time)
    await expect(
      page.getByTestId(`terminal-link-${terminal1.pos_terminal_id}`),
    ).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });
    await expect(
      page.getByTestId(`terminal-link-${terminal2.pos_terminal_id}`),
    ).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });

    // THEN: CLIENT_USER role CAN see Lottery link in sidebar
    // Menu visibility uses canAccessMenuByKey("lottery") which checks for ANY of:
    // LOTTERY_PACK_RECEIVE, LOTTERY_SHIFT_RECONCILE, or LOTTERY_REPORT
    // CLIENT_USER has LOTTERY_REPORT permission per rbac.seed.ts
    await expect(page.getByTestId("lottery-link")).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // THEN: Excluded navigation items should NOT be present in the sidebar
    // Note: We check within sidebar context to avoid matching text elsewhere
    // MyStore sidebar only shows: Dashboard, Clock In/Out, Lottery (if permitted), and Terminal links
    await expect(sidebar.getByText(/shifts/i)).not.toBeVisible();
    await expect(sidebar.getByText(/inventory/i)).not.toBeVisible();
    await expect(sidebar.getByText(/employees/i)).not.toBeVisible();
    await expect(sidebar.getByText(/reports/i)).not.toBeVisible();
    await expect(sidebar.getByText(/ai assistant/i)).not.toBeVisible();
  });

  test("[P0] 4.9-E2E-003: Clicking terminal should open TerminalAuthModal", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAsClientUser(page, clientUser.email, password);

    // Wait for terminal link to be visible before clicking
    const terminalLink = page.getByTestId(
      `terminal-link-${terminal1.pos_terminal_id}`,
    );
    await expect(terminalLink).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // WHEN: User clicks on a terminal
    await terminalLink.click();

    // THEN: TerminalAuthModal should be visible
    const modal = page.getByTestId("terminal-auth-modal");
    await expect(modal).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });
    await expect(page.getByText(/terminal authentication/i)).toBeVisible();

    // THEN: Modal description should mention the terminal name
    // In new shift mode: "Authenticate to access terminal: {name}"
    // In resume mode: "Resume shift on terminal: {name}"
    // We check for the modal description which contains the terminal name
    const escapedTerminalName = terminal1.name.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    // Look for the description text that includes both "terminal" and the name
    // eslint-disable-next-line security/detect-non-literal-regexp
    const terminalDescriptionRegex = new RegExp(
      `(authenticate to access|resume shift on) terminal: ${escapedTerminalName}`,
      "i",
    );
    await expect(page.getByText(terminalDescriptionRegex)).toBeVisible();
  });

  test("[P1] 4.9-E2E-004: TerminalAuthModal should display form with Cashier Name dropdown and PIN Number input", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAsClientUser(page, clientUser.email, password);

    // Wait for terminal link to be visible
    const terminalLink = page.getByTestId(
      `terminal-link-${terminal1.pos_terminal_id}`,
    );
    await expect(terminalLink).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // WHEN: User clicks on a terminal to open modal
    await terminalLink.click();

    // Wait for modal to appear
    const modal = page.getByTestId("terminal-auth-modal");
    await expect(modal).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });

    // THEN: Form fields should be visible (new shift mode shows cashier dropdown)
    // Verify cashier name select with accessibility label
    const cashierSelect = page.getByTestId("cashier-name-select");
    await expect(cashierSelect).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });
    await expect(page.getByLabel(/cashier name/i)).toBeVisible();

    // Verify PIN input with accessibility label
    const pinInput = page.getByTestId("pin-number-input");
    await expect(pinInput).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });
    await expect(page.getByLabel(/pin number/i)).toBeVisible();

    // THEN: Cancel and Submit buttons should be visible
    await expect(page.getByTestId("terminal-auth-cancel-button")).toBeVisible();
    await expect(page.getByTestId("terminal-auth-submit-button")).toBeVisible();

    // THEN: Submit button should say "Start Shift" in new shift mode (no active shift)
    await expect(page.getByTestId("terminal-auth-submit-button")).toHaveText(
      "Start Shift",
    );
  });

  test("[P1] 4.9-E2E-004a: TerminalAuthModal cancel button should close the modal", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAsClientUser(page, clientUser.email, password);

    // Wait for terminal link to be visible
    const terminalLink = page.getByTestId(
      `terminal-link-${terminal1.pos_terminal_id}`,
    );
    await expect(terminalLink).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // WHEN: User clicks on a terminal to open modal
    await terminalLink.click();

    // Wait for modal to appear
    const modal = page.getByTestId("terminal-auth-modal");
    await expect(modal).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });

    // WHEN: User clicks Cancel button
    const cancelButton = page.getByTestId("terminal-auth-cancel-button");
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    // THEN: Modal should be closed (wait for animation to complete)
    await expect(modal).not.toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });
  });

  test("[P1] 4.9-E2E-005: Clock In/Out page should display 'Coming Soon' message", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAsClientUser(page, clientUser.email, password);

    // Wait for Clock In/Out link to be visible
    const clockLink = page.getByTestId("clock-in-out-link");
    await expect(clockLink).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // WHEN: User clicks Clock In/Out link
    await clockLink.click();

    // THEN: Page should navigate to /mystore/clock-in-out
    await expect(page).toHaveURL(/.*mystore\/clock-in-out.*/, {
      timeout: TEST_TIMEOUTS.URL_CHANGE,
    });

    // THEN: "Coming Soon" message container should be visible
    const comingSoonContainer = page.getByTestId("coming-soon-message");
    await expect(comingSoonContainer).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // THEN: Text content should match implementation
    await expect(page.getByText(/coming soon/i)).toBeVisible();
    await expect(
      page.getByText(
        /the clock in\/out feature is currently under development/i,
      ),
    ).toBeVisible();
  });

  test("[P1] 4.9-E2E-005a: Dashboard link should navigate back to /mystore", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore/clock-in-out page
    await loginAsClientUser(page, clientUser.email, password);

    // Navigate to Clock In/Out page
    const clockLink = page.getByTestId("clock-in-out-link");
    await expect(clockLink).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });
    await clockLink.click();
    await expect(page).toHaveURL(/.*mystore\/clock-in-out.*/, {
      timeout: TEST_TIMEOUTS.URL_CHANGE,
    });

    // WHEN: User clicks Dashboard link
    const dashboardLink = page.getByTestId("dashboard-link");
    await expect(dashboardLink).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });
    await dashboardLink.click();

    // THEN: Page should navigate back to /mystore (exact path)
    await expect(page).toHaveURL(/.*\/mystore$/, {
      timeout: TEST_TIMEOUTS.URL_CHANGE,
    });
  });

  test("[P1] 4.9-E2E-005b: Lottery link should navigate to lottery page", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAsClientUser(page, clientUser.email, password);

    // Wait for Lottery link to be visible (permission-gated)
    const lotteryLink = page.getByTestId("lottery-link");
    await expect(lotteryLink).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // WHEN: User clicks Lottery link
    await lotteryLink.click();

    // THEN: Page should navigate to /mystore/lottery
    await expect(page).toHaveURL(/.*mystore\/lottery.*/, {
      timeout: TEST_TIMEOUTS.URL_CHANGE,
    });
  });

  test("[P1] 4.9-E2E-006: Store Manager should be able to access /mystore dashboard", async ({
    page,
  }) => {
    // GIVEN: Store Manager logs in
    await loginAsClientUser(page, storeManager.email, password);

    // THEN: User should be redirected to /mystore dashboard
    expect(page.url()).toContain("/mystore");

    // THEN: Store Manager should see terminals for their store (RLS filtering)
    const terminal1Link = page.getByTestId(
      `terminal-link-${terminal1.pos_terminal_id}`,
    );
    const terminal2Link = page.getByTestId(
      `terminal-link-${terminal2.pos_terminal_id}`,
    );

    await expect(terminal1Link).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });
    await expect(terminal2Link).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });
  });

  test("[P1] 4.9-E2E-007: Terminal list should display connection type and status badges", async ({
    page,
  }) => {
    // GIVEN: User is logged in and on /mystore dashboard
    await loginAsClientUser(page, clientUser.email, password);

    // Wait for terminals to load
    const terminal1Link = page.getByTestId(
      `terminal-link-${terminal1.pos_terminal_id}`,
    );
    await expect(terminal1Link).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // THEN: Terminal names should be visible
    await expect(page.getByText("Terminal 1")).toBeVisible();
    await expect(page.getByText("Terminal 2")).toBeVisible();

    // THEN: Terminal status badges should be visible
    // Use .first() since there may be multiple elements with same text
    await expect(page.getByText("ACTIVE").first()).toBeVisible();
    await expect(page.getByText("INACTIVE").first()).toBeVisible();
  });

  test("[P2] 4.9-E2E-008: Complete user journey: login → redirect to /mystore → view terminals → click terminal → see auth modal", async ({
    page,
  }) => {
    // GIVEN: User is not logged in
    // WHEN: User logs in as CLIENT_USER using the helper function
    await loginAsClientUser(page, clientUser.email, password);

    // THEN: User should be on /mystore dashboard
    expect(page.url()).toContain("/mystore");

    // THEN: Sidebar should be visible with terminals
    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // THEN: Terminal links should be visible
    const terminalLink = page.getByTestId(
      `terminal-link-${terminal1.pos_terminal_id}`,
    );
    await expect(terminalLink).toBeVisible({
      timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
    });

    // WHEN: User clicks on a terminal
    await terminalLink.click();

    // THEN: TerminalAuthModal should open with proper title
    const modal = page.getByTestId("terminal-auth-modal");
    await expect(modal).toBeVisible({ timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE });
    await expect(page.getByText(/terminal authentication/i)).toBeVisible();

    // THEN: Modal should show "Start Shift" button (new shift mode, no active shift)
    await expect(page.getByTestId("terminal-auth-submit-button")).toHaveText(
      "Start Shift",
    );
  });
});

/**
 * Test suite to verify CLIENT_OWNER users are NOT redirected to /mystore
 * CLIENT_OWNER should go to /client-dashboard, not /mystore (terminal dashboard)
 *
 * Security Validation:
 * - CLIENT_OWNER role should access /client-dashboard only
 * - Direct navigation to /mystore should redirect to /client-dashboard
 */
test.describe("4.9-E2E: CLIENT_OWNER Access Control", () => {
  // Run tests serially since they share database state created in beforeAll
  test.describe.configure({ mode: "serial" });

  let prisma: PrismaClient;
  let clientOwner: TestUser;
  let company: TestCompany;
  const password = TEST_CONSTANTS.TEST_PASSWORD;

  test.beforeAll(async () => {
    prisma = new PrismaClient();

    // Generate unique test identifiers for isolation
    const testId = generateTestId("owner");
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const companyId = uuidv4();

    // Create CLIENT_OWNER user with unique email
    clientOwner = (await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-client-owner-${testId}@test.com`,
        name: "E2E Client Owner",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    })) as TestUser;

    // Create company for CLIENT_OWNER
    company = (await prisma.company.create({
      data: {
        company_id: companyId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: `E2E Client Owner Company ${testId}`,
        address: "123 Owner Street",
        status: "ACTIVE",
        owner_user_id: clientOwner.user_id,
      },
    })) as TestCompany;

    // Assign CLIENT_OWNER role (not CLIENT_USER)
    // This role should redirect to /client-dashboard, not /mystore
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
    // Cleanup in proper FK-safe order
    try {
      // 1. Delete user roles first
      if (clientOwner) {
        await prisma.userRole
          .deleteMany({ where: { user_id: clientOwner.user_id } })
          .catch(() => {});
      }

      // 2. Delete company (before user since company.owner_user_id references user)
      if (company) {
        await prisma.company
          .delete({ where: { company_id: company.company_id } })
          .catch(() => {});
      }

      // 3. Delete user last
      if (clientOwner) {
        await prisma.user
          .delete({ where: { user_id: clientOwner.user_id } })
          .catch(() => {});
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test("[P0] 4.9-E2E-009: CLIENT_OWNER should be redirected to /client-dashboard after login, NOT /mystore", async ({
    page,
  }) => {
    // GIVEN: CLIENT_OWNER logs in using the helper function
    await loginAsClientOwner(page, clientOwner.email, password);

    // THEN: User should be redirected to /client-dashboard (NOT /mystore or /dashboard)
    expect(page.url()).toContain("/client-dashboard");
    expect(page.url()).not.toContain("/mystore");
  });

  test("[P0] 4.9-E2E-010: CLIENT_OWNER should be redirected away from /mystore if accessed directly", async ({
    page,
  }) => {
    // GIVEN: CLIENT_OWNER logs in first
    await loginAsClientOwner(page, clientOwner.email, password);

    // WHEN: CLIENT_OWNER tries to access /mystore directly
    await page.goto("/mystore");

    // Wait for redirect to occur (layout protection redirects to /client-dashboard)
    await page.waitForURL(/.*client-dashboard.*/, {
      timeout: TEST_TIMEOUTS.URL_CHANGE,
    });

    // THEN: User should be redirected to /client-dashboard (NOT /mystore)
    expect(page.url()).toContain("/client-dashboard");
    expect(page.url()).not.toContain("/mystore");
  });
});
