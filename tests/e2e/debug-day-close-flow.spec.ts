/**
 * Debug test to verify day close wizard flow
 * Run with: npx playwright test tests/e2e/debug-day-close-flow.spec.ts --headed
 */
import { test, expect } from "@playwright/test";

/**
 * DEBUG TEST - Skip in CI/CD
 * This test uses hardcoded credentials and is only for manual debugging.
 * Run manually with: npx playwright test tests/e2e/debug-day-close-flow.spec.ts --headed
 */
test.describe.skip("Debug Day Close Flow", () => {
  test("should navigate to lottery scanner wizard when clicking Close Day", async ({
    page,
  }) => {
    // Set longer timeout for debugging
    test.setTimeout(120000);

    // 1. Navigate to login page
    console.log("Step 1: Navigating to login...");
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // 2. Login with user credentials
    console.log("Step 2: Logging in as KFPUSER@KFP.COM...");
    await page.getByLabel(/email/i).fill("KFPUSER@KFP.COM");
    await page.getByLabel(/password/i).fill("Milkey27#");
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Wait for navigation after login
    await page.waitForURL(/\/(mystore|dashboard)/, { timeout: 30000 });
    console.log("Step 2 complete: Logged in, current URL:", page.url());

    // 3. Click on terminal T1 from sidebar
    console.log("Step 3: Looking for terminal T1 in sidebar...");
    await page.waitForTimeout(2000); // Wait for sidebar to load

    // Take screenshot to see what's on the page
    await page.screenshot({ path: "debug-step3-before-terminal.png" });

    // Look for T1 in sidebar - it shows as "T1" with "ACTIVE" badge
    // The sidebar shows terminals as list items with the terminal name
    const t1Link = page.locator("text=T1").first();
    console.log("Looking for T1 text...");

    if (await t1Link.isVisible({ timeout: 5000 })) {
      console.log("Found T1, clicking...");
      await t1Link.click();
      await page.waitForTimeout(1000);
    } else {
      console.log("T1 text not found directly, trying sidebar nav...");
      // Try clicking in the sidebar area where T1 should be
      const sidebarItems = page.locator(
        "nav a, aside a, [role='navigation'] a",
      );
      const count = await sidebarItems.count();
      console.log(`Found ${count} navigation links`);

      for (let i = 0; i < count; i++) {
        const text = await sidebarItems.nth(i).textContent();
        console.log(`  Link ${i}: ${text}`);
        if (text?.includes("T1")) {
          await sidebarItems.nth(i).click();
          break;
        }
      }
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: "debug-step3-after-terminal.png" });
    console.log("Current URL after terminal click:", page.url());

    // 4. Check if we need to enter PIN (terminal auth modal)
    console.log("Step 4: Looking for PIN input modal...");
    await page.waitForTimeout(1000);

    // Look for PIN input in modal
    const pinInput = page.locator(
      'input[inputmode="numeric"], input[type="password"], input[placeholder*="PIN"], input[placeholder*="pin"]',
    );

    if (await pinInput.first().isVisible({ timeout: 5000 })) {
      console.log("Step 4: Found PIN input, entering 3366...");
      await pinInput.first().click();
      await pinInput.first().fill("3366");
      await page.screenshot({ path: "debug-step4-pin-entered.png" });

      // Look for submit/confirm button
      const confirmBtn = page.getByRole("button", {
        name: /confirm|submit|start|continue|ok/i,
      });
      if (await confirmBtn.isVisible({ timeout: 2000 })) {
        console.log("Clicking confirm button...");
        await confirmBtn.click();
      } else {
        // Maybe form auto-submits or has different button
        await page.keyboard.press("Enter");
      }

      await page.waitForTimeout(3000);
    } else {
      console.log(
        "No PIN input found, checking if already on terminal page...",
      );
    }

    await page.screenshot({ path: "debug-step4-after-pin.png" });
    console.log("URL after PIN:", page.url());

    // 5. Wait for shift page to load
    console.log("Step 5: Waiting for shift page to load...");
    await page.waitForTimeout(5000); // Wait for shift to resume
    await page.screenshot({ path: "debug-step5-shift-page.png" });
    console.log("Current URL:", page.url());

    // 6. Click Close Day button
    console.log("Step 6: Looking for Close Day button...");

    // The Close Day button should be on the terminal shift page
    const closeDayBtn = page.getByRole("button", { name: /close day/i });
    const closeDayTestId = page.getByTestId("close-day-button");

    if (await closeDayBtn.isVisible({ timeout: 10000 })) {
      console.log("Step 6: Found Close Day button by role, clicking...");
      await closeDayBtn.click();
    } else if (await closeDayTestId.isVisible({ timeout: 2000 })) {
      console.log("Step 6: Found Close Day button by testid, clicking...");
      await closeDayTestId.click();
    } else {
      console.log("Close Day button not found, dumping page content...");
      const buttons = page.locator("button");
      const btnCount = await buttons.count();
      console.log(`Found ${btnCount} buttons on page:`);
      for (let i = 0; i < Math.min(btnCount, 10); i++) {
        const btnText = await buttons.nth(i).textContent();
        console.log(`  Button ${i}: ${btnText}`);
      }
      await page.screenshot({ path: "debug-step6-no-close-day.png" });
    }

    // 7. Wait and check where we land
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "debug-step7-after-close-day.png" });

    const currentUrl = page.url();
    console.log("Step 7: Current URL after Close Day:", currentUrl);

    // Check if we're on the lottery page with day-close mode
    if (
      currentUrl.includes("/lottery") &&
      currentUrl.includes("mode=day-close")
    ) {
      console.log("✅ SUCCESS: Navigated to lottery scanner wizard!");

      // Look for the scanner interface
      const scannerInterface = page.getByTestId("day-close-mode-scanner");
      if (await scannerInterface.isVisible({ timeout: 5000 })) {
        console.log("✅ Scanner interface is visible!");
        await page.screenshot({ path: "debug-SUCCESS-scanner.png" });
      } else {
        console.log("❌ Scanner interface NOT visible");
      }

      // Check for blocking banner if present
      const blockingBanner = page.getByTestId("open-shifts-blocking-banner");
      if (
        await blockingBanner.isVisible({ timeout: 2000 }).catch(() => false)
      ) {
        console.log("⚠️ Blocking banner is shown (open shifts detected)");
        await page.screenshot({ path: "debug-blocking-banner.png" });
      }
    } else if (currentUrl.includes("/day-close")) {
      console.log(
        "❌ FAIL: Still on old day-close page, NOT redirected to lottery scanner",
      );

      // Wait a bit more for potential redirect
      console.log("Waiting 5 more seconds for potential redirect...");
      await page.waitForTimeout(5000);
      const newUrl = page.url();
      console.log("URL after additional wait:", newUrl);

      // Check what's on the page
      const pageContent = await page.content();
      console.log(
        "Page has 'Close Lottery':",
        pageContent.includes("Close Lottery"),
      );
      console.log(
        "Page has 'Cannot Close Day':",
        pageContent.includes("Cannot Close Day"),
      );
      console.log(
        "Page has 'Checking for open shifts':",
        pageContent.includes("Checking for open shifts"),
      );
      console.log(
        "Page has 'day-close-mode-scanner':",
        pageContent.includes("day-close-mode-scanner"),
      );

      await page.screenshot({
        path: "debug-FAIL-old-page.png",
        fullPage: true,
      });
    } else {
      console.log("❓ Unknown page:", currentUrl);
    }

    // Final screenshot
    await page.screenshot({ path: "debug-final-state.png", fullPage: true });
  });
});
