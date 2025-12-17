/**
 * Terminal Auth PIN Debug E2E Test
 *
 * DEBUGGING: Investigating PIN input not accepting user input in the browser
 *
 * Story: 4.9 - MyStore Terminal Dashboard
 *
 * This test uses the real credentials provided by the user to:
 * 1. Login to the application
 * 2. Navigate to /mystore dashboard
 * 3. Click on a terminal to open the auth modal
 * 4. Attempt to type in the PIN input field
 * 5. Capture screenshots and video to debug the issue
 */

import { test, expect, Page } from "@playwright/test";

/**
 * Helper function to perform login with specified credentials
 */
async function login(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for any redirect to complete
  await page.waitForLoadState("networkidle");
}

test.describe("PIN Input Debug Tests", () => {
  // Use real credentials for debugging
  const testEmail = "kfpuser@kfp.com";
  const testPassword = "Milkey27#";

  test("DEBUG-001: Verify PIN input accepts user input in new shift mode", async ({
    page,
  }) => {
    // STEP 1: Login with real credentials
    console.log("Step 1: Logging in...");
    await login(page, testEmail, testPassword);

    // Wait for redirect - could be /mystore or /client-dashboard depending on role
    await page.waitForURL(/\/(mystore|client-dashboard)/, { timeout: 15000 });
    console.log("Step 1 Complete: Logged in, current URL:", page.url());

    // If redirected to client-dashboard, navigate to mystore
    if (page.url().includes("client-dashboard")) {
      console.log("Navigating to /mystore...");
      await page.goto("/mystore");
      await page.waitForLoadState("networkidle");
    }

    // Take a screenshot of the dashboard
    await page.screenshot({
      path: "test-results/debug-001-dashboard.png",
      fullPage: true,
    });

    // STEP 2: Find and click on a terminal
    console.log("Step 2: Looking for terminal links...");

    // Wait for sidebar to load
    const sidebar = page.getByTestId("mystore-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // IMPORTANT: Wait for terminals to load - they load asynchronously!
    // Wait up to 30 seconds for at least one terminal link to appear
    console.log("Waiting for terminal links to load...");
    const terminalLinks = page.locator('[data-testid^="terminal-link-"]');

    try {
      await terminalLinks.first().waitFor({ state: "visible", timeout: 30000 });
      console.log("Terminal links are now visible");
    } catch (e) {
      console.log("Timeout waiting for terminals - taking screenshot...");
      await page.screenshot({
        path: "test-results/debug-001-no-terminals-after-wait.png",
        fullPage: true,
      });
      // Also capture the page HTML for debugging
      const html = await page.content();
      console.log("Page HTML (first 5000 chars):", html.substring(0, 5000));
    }

    const terminalCount = await terminalLinks.count();
    console.log(`Found ${terminalCount} terminal links`);

    if (terminalCount === 0) {
      console.log(
        "No terminals found after waiting. Taking screenshot and exiting.",
      );
      await page.screenshot({
        path: "test-results/debug-001-no-terminals.png",
        fullPage: true,
      });
      test.skip(true, "No terminals available for this user");
      return;
    }

    // Click the first terminal
    const firstTerminal = terminalLinks.first();
    const terminalTestId = await firstTerminal.getAttribute("data-testid");
    console.log(`Clicking terminal: ${terminalTestId}`);
    await firstTerminal.click();

    // STEP 3: Wait for the auth modal to appear
    console.log("Step 3: Waiting for auth modal...");
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
      timeout: 10000,
    });
    console.log("Auth modal is visible");

    // Take a screenshot of the modal
    await page.screenshot({
      path: "test-results/debug-001-modal-opened.png",
      fullPage: true,
    });

    // STEP 4: Find the PIN input
    console.log("Step 4: Finding PIN input...");
    const pinInput = page.getByTestId("pin-number-input");
    await expect(pinInput).toBeVisible({ timeout: 5000 });
    console.log("PIN input is visible");

    // Check if it's disabled
    const isDisabled = await pinInput.isDisabled();
    console.log(`PIN input disabled state: ${isDisabled}`);

    // Check input attributes
    const inputType = await pinInput.getAttribute("type");
    const inputPlaceholder = await pinInput.getAttribute("placeholder");
    const inputReadonly = await pinInput.getAttribute("readonly");
    const inputAriaDisabled = await pinInput.getAttribute("aria-disabled");
    console.log(
      `PIN input type: ${inputType}, placeholder: ${inputPlaceholder}`,
    );
    console.log(
      `PIN input readonly: ${inputReadonly}, aria-disabled: ${inputAriaDisabled}`,
    );

    // Get computed styles
    const isEditable = await pinInput.isEditable();
    console.log(`PIN input isEditable: ${isEditable}`);

    // STEP 5: Try to type in the PIN input
    console.log("Step 5: Attempting to type in PIN input...");

    // First, click to focus the input
    await pinInput.click();
    console.log("Clicked on PIN input");

    // Take screenshot after focus
    await page.screenshot({
      path: "test-results/debug-001-pin-focused.png",
      fullPage: true,
    });

    // Try typing using different methods
    console.log("Trying to type '1234' using fill()...");
    await pinInput.fill("1234");

    // Check the value
    const valueAfterFill = await pinInput.inputValue();
    console.log(`Value after fill(): "${valueAfterFill}"`);

    // Take screenshot after fill attempt
    await page.screenshot({
      path: "test-results/debug-001-after-fill.png",
      fullPage: true,
    });

    // Clear and try keyboard input
    await pinInput.clear();
    console.log("Cleared input, trying keyboard.type()...");
    await page.keyboard.type("5678");

    const valueAfterType = await pinInput.inputValue();
    console.log(`Value after keyboard.type(): "${valueAfterType}"`);

    // Take screenshot after type attempt
    await page.screenshot({
      path: "test-results/debug-001-after-type.png",
      fullPage: true,
    });

    // STEP 6: Check for any error messages or overlays
    console.log("Step 6: Checking for error messages...");
    const alerts = page.locator('[role="alert"]');
    const alertCount = await alerts.count();
    if (alertCount > 0) {
      for (let i = 0; i < alertCount; i++) {
        const alertText = await alerts.nth(i).textContent();
        console.log(`Alert ${i}: ${alertText}`);
      }
    }

    // Check for loading states
    const loadingSpinner = page.locator(".animate-spin");
    const spinnerVisible = await loadingSpinner.isVisible().catch(() => false);
    console.log(`Loading spinner visible: ${spinnerVisible}`);

    // STEP 7: Final assertions
    console.log("Step 7: Final assertions...");
    const finalValue = await pinInput.inputValue();
    console.log(`Final PIN input value: "${finalValue}"`);

    // The test should pass if we can type in the input
    expect(finalValue.length).toBeGreaterThan(0);
  });

  test("DEBUG-002: Check for active shift and resume mode", async ({
    page,
  }) => {
    // STEP 1: Login with real credentials
    console.log("Step 1: Logging in...");
    await login(page, testEmail, testPassword);

    // Wait for redirect
    await page.waitForURL(/\/(mystore|client-dashboard)/, { timeout: 15000 });
    console.log("Step 1 Complete: Current URL:", page.url());

    // Navigate to mystore if needed
    if (page.url().includes("client-dashboard")) {
      await page.goto("/mystore");
      await page.waitForLoadState("networkidle");
    }

    // STEP 2: Click on a terminal - wait for them to load first
    console.log("Waiting for terminal links to load...");
    const terminalLinks = page.locator('[data-testid^="terminal-link-"]');

    try {
      await terminalLinks.first().waitFor({ state: "visible", timeout: 30000 });
      console.log("Terminal links loaded");
    } catch {
      console.log("Timeout waiting for terminals");
      await page.screenshot({
        path: "test-results/debug-002-no-terminals.png",
        fullPage: true,
      });
    }

    const terminalCount = await terminalLinks.count();
    console.log(`Found ${terminalCount} terminals`);

    if (terminalCount === 0) {
      test.skip(true, "No terminals available for this user");
      return;
    }

    // Try each terminal to find one that might have an active shift
    for (let i = 0; i < terminalCount; i++) {
      const terminal = terminalLinks.nth(i);
      const terminalId = await terminal.getAttribute("data-testid");
      console.log(`Checking terminal ${i + 1}: ${terminalId}`);

      await terminal.click();

      // Wait for modal
      await expect(page.getByTestId("terminal-auth-modal")).toBeVisible({
        timeout: 5000,
      });

      // Take screenshot
      await page.screenshot({
        path: `test-results/debug-002-terminal-${i + 1}.png`,
        fullPage: true,
      });

      // Check if we're in resume mode (shift owner display visible)
      const shiftOwnerDisplay = page.getByTestId("shift-owner-display");
      const isResumeMode = await shiftOwnerDisplay
        .isVisible()
        .catch(() => false);

      console.log(`Terminal ${i + 1} - Resume mode: ${isResumeMode}`);

      if (isResumeMode) {
        // Get the shift owner name
        const ownerName = await page
          .getByTestId("shift-owner-name")
          .textContent()
          .catch(() => "unknown");
        console.log(`Active shift found! Owner: ${ownerName}`);

        // Check PIN input in resume mode
        const pinInput = page.getByTestId("pin-number-input");
        await expect(pinInput).toBeVisible();

        const isDisabled = await pinInput.isDisabled();
        const isEditable = await pinInput.isEditable();
        console.log(
          `Resume mode PIN - disabled: ${isDisabled}, editable: ${isEditable}`,
        );

        // Try to type
        await pinInput.click();
        await pinInput.fill("1234");
        const value = await pinInput.inputValue();
        console.log(`Resume mode PIN value after fill: "${value}"`);

        await page.screenshot({
          path: `test-results/debug-002-resume-mode-pin.png`,
          fullPage: true,
        });

        // Assert PIN input works
        expect(value).toBe("1234");
      } else {
        // Check PIN input in new shift mode
        const pinInput = page.getByTestId("pin-number-input");
        await expect(pinInput).toBeVisible();

        const isDisabled = await pinInput.isDisabled();
        const isEditable = await pinInput.isEditable();
        console.log(
          `New shift mode PIN - disabled: ${isDisabled}, editable: ${isEditable}`,
        );

        // Try to type
        await pinInput.click();
        await pinInput.fill("1234");
        const value = await pinInput.inputValue();
        console.log(`New shift mode PIN value after fill: "${value}"`);

        // Assert PIN input works
        expect(value).toBe("1234");
      }

      // Close modal and continue
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("terminal-auth-modal")).not.toBeVisible({
        timeout: 5000,
      });
    }
  });

  test("DEBUG-005: Trace events and React Hook Form state", async ({
    page,
  }) => {
    // Capture console messages
    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Login
    await login(page, testEmail, testPassword);
    await page.waitForURL(/\/(mystore|client-dashboard)/, { timeout: 15000 });

    if (page.url().includes("client-dashboard")) {
      await page.goto("/mystore");
      await page.waitForLoadState("networkidle");
    }

    // Wait for terminals
    const terminalLinks = page.locator('[data-testid^="terminal-link-"]');
    await terminalLinks.first().waitFor({ state: "visible", timeout: 30000 });
    await terminalLinks.first().click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible();

    // Add event listeners to trace what's happening
    await page.evaluate(() => {
      const input = document.querySelector(
        '[data-testid="pin-number-input"]',
      ) as HTMLInputElement | null;
      if (!input) return;

      const events = [
        "focus",
        "blur",
        "input",
        "change",
        "keydown",
        "keyup",
        "keypress",
      ];
      events.forEach((eventType) => {
        input.addEventListener(eventType, (e) => {
          console.log(
            `[EVENT] ${eventType}: value="${(e.target as HTMLInputElement).value}"`,
          );
        });
      });
    });

    // Now try different typing methods
    const pinInput = page.getByTestId("pin-number-input");
    await pinInput.click();

    // Method 1: type() - types character by character with events
    console.log("Trying type()...");
    await pinInput.type("1234");
    const valueAfterType = await pinInput.inputValue();
    console.log(`Value after type(): "${valueAfterType}"`);

    if (!valueAfterType) {
      // Method 2: Clear and try pressSequentially with slower delay
      console.log(
        "type() failed, trying pressSequentially with 200ms delay...",
      );
      await pinInput.pressSequentially("5678", { delay: 200 });
    }

    // Wait a bit for React to process
    await page.waitForTimeout(500);

    const valueAfterPress = await pinInput.inputValue();
    console.log(`Value after pressSequentially: "${valueAfterPress}"`);

    // Get React Hook Form state from the window
    const formState = await page.evaluate(() => {
      // Try to find the form context
      const form = document.querySelector("form");
      if (!form) return { error: "Form not found" };

      // Check the input value directly
      const input = document.querySelector(
        '[data-testid="pin-number-input"]',
      ) as HTMLInputElement;
      return {
        inputValue: input?.value,
        inputDisabled: input?.disabled,
        formAction: form.action,
        formMethod: form.method,
      };
    });

    console.log("Form state:", JSON.stringify(formState, null, 2));
    console.log("Console errors:", consoleErrors);
    console.log("Console logs (last 20):", consoleLogs.slice(-20));

    await page.screenshot({
      path: "test-results/debug-005-after-press.png",
      fullPage: true,
    });

    // Check if there's a value
    expect(valueAfterPress.length).toBeGreaterThan(0);
  });

  test("DEBUG-004: Test input with JavaScript directly", async ({ page }) => {
    // Login
    await login(page, testEmail, testPassword);
    await page.waitForURL(/\/(mystore|client-dashboard)/, { timeout: 15000 });

    if (page.url().includes("client-dashboard")) {
      await page.goto("/mystore");
      await page.waitForLoadState("networkidle");
    }

    // Wait for terminals
    console.log("Waiting for terminal links to load...");
    const terminalLinks = page.locator('[data-testid^="terminal-link-"]');
    try {
      await terminalLinks.first().waitFor({ state: "visible", timeout: 30000 });
    } catch {
      console.log("Timeout waiting for terminals");
    }
    if ((await terminalLinks.count()) === 0) {
      test.skip(true, "No terminals available");
      return;
    }

    await terminalLinks.first().click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible();

    // Try to interact with the input using JavaScript directly
    const result = await page.evaluate(() => {
      const input = document.querySelector(
        '[data-testid="pin-number-input"]',
      ) as HTMLInputElement | null;
      if (!input) return { error: "Input not found" };

      // Log all React fiber data
      const reactKey = Object.keys(input).find((key) =>
        key.startsWith("__reactFiber$"),
      );
      const reactProps = Object.keys(input).find((key) =>
        key.startsWith("__reactProps$"),
      );

      console.log("React keys found:", { reactKey, reactProps });

      // Try to set value directly
      input.focus();

      // Method 1: Direct value assignment
      input.value = "1111";
      const value1 = input.value;

      // Method 2: Using native setter
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, "2222");
      }
      const value2 = input.value;

      // Method 3: Dispatch input event
      input.value = "3333";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const value3 = input.value;

      // Method 4: Dispatch change event
      input.value = "4444";
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const value4 = input.value;

      // Method 5: Use InputEvent
      nativeInputValueSetter?.call(input, "");
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: "5555",
        }),
      );
      const value5 = input.value;

      return {
        value1,
        value2,
        value3,
        value4,
        value5,
        hasReactFiber: !!reactKey,
        hasReactProps: !!reactProps,
        inputId: input.id,
        inputName: input.name,
      };
    });

    console.log(
      "JavaScript input test result:",
      JSON.stringify(result, null, 2),
    );

    await page.screenshot({
      path: "test-results/debug-004-js-input.png",
      fullPage: true,
    });

    // The test passes if we can learn something about React's control
    expect(result).not.toBeNull();
  });

  test("DEBUG-003: Inspect DOM structure of PIN input", async ({ page }) => {
    // Login
    await login(page, testEmail, testPassword);
    await page.waitForURL(/\/(mystore|client-dashboard)/, { timeout: 15000 });

    if (page.url().includes("client-dashboard")) {
      await page.goto("/mystore");
      await page.waitForLoadState("networkidle");
    }

    // Click terminal - wait for them to load first
    console.log("Waiting for terminal links to load...");
    const terminalLinks = page.locator('[data-testid^="terminal-link-"]');
    try {
      await terminalLinks.first().waitFor({ state: "visible", timeout: 30000 });
    } catch {
      console.log("Timeout waiting for terminals");
    }
    if ((await terminalLinks.count()) === 0) {
      test.skip(true, "No terminals available");
      return;
    }

    await terminalLinks.first().click();
    await expect(page.getByTestId("terminal-auth-modal")).toBeVisible();

    // Get detailed DOM info about the PIN input
    const pinInputInfo = await page.evaluate(() => {
      const input = document.querySelector(
        '[data-testid="pin-number-input"]',
      ) as HTMLInputElement | null;
      if (!input) return null;

      // Get computed styles
      const styles = window.getComputedStyle(input);

      // Get all attributes
      const attributes: Record<string, string> = {};
      for (let i = 0; i < input.attributes.length; i++) {
        // eslint-disable-next-line security/detect-object-injection -- Safe: reading DOM attributes in controlled test context
        const attr = input.attributes[i];
        // eslint-disable-next-line security/detect-object-injection -- Safe: setting attributes from DOM in controlled test context
        attributes[attr.name] = attr.value;
      }

      // Check for overlapping elements
      const rect = input.getBoundingClientRect();
      const elementsAtCenter = document.elementsFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );

      return {
        tagName: input.tagName,
        type: input.type,
        disabled: input.disabled,
        readOnly: input.readOnly,
        value: input.value,
        attributes,
        styles: {
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          pointerEvents: styles.pointerEvents,
          zIndex: styles.zIndex,
          position: styles.position,
        },
        dimensions: {
          width: rect.width,
          height: rect.height,
          x: rect.x,
          y: rect.y,
        },
        overlappingElements: elementsAtCenter.slice(0, 5).map((el) => ({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
        })),
        parentChain: (() => {
          const chain: string[] = [];
          let parent = input.parentElement;
          while (parent && chain.length < 5) {
            chain.push(
              `${parent.tagName}${parent.className ? "." + parent.className.split(" ").join(".") : ""}`,
            );
            parent = parent.parentElement;
          }
          return chain;
        })(),
      };
    });

    console.log("PIN Input DOM Info:");
    console.log(JSON.stringify(pinInputInfo, null, 2));

    // Take final screenshot
    await page.screenshot({
      path: "test-results/debug-003-dom-inspection.png",
      fullPage: true,
    });

    expect(pinInputInfo).not.toBeNull();
    expect(pinInputInfo?.disabled).toBe(false);
  });
});
