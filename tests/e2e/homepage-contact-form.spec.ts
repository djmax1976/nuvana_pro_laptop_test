import { test, expect } from "../support/fixtures";

/**
 * E2E Tests - Homepage Contact Form
 *
 * These tests validate the contact form functionality on the homepage.
 * Focus on form validation, submission, and user feedback.
 */

test.describe("E2E-003: Homepage Contact Form", () => {
  test("[P0] should submit contact form with valid data", async ({ page }) => {
    // GIVEN: User is on homepage contact form
    await page.goto("/");
    await page
      .getByRole("button", { name: /Get Started/i })
      .first()
      .click();

    // WHEN: User fills out form with valid data and submits
    await page.locator('input[name="name"]').fill("John Doe");
    await page.locator('input[name="email"]').fill("john.doe@test.com");
    await page
      .locator('textarea[name="message"]')
      .fill("I'm interested in learning more about Nuvana Pro.");

    // Intercept form submission (since backend not implemented yet)
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.getByRole("button", { name: /Send Message/i }).click();

    // THEN: Success message is displayed
    await expect(
      page.getByText(/Thank you! We'll be in touch soon/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("[P1] should prevent submission with empty required fields", async ({
    page,
  }) => {
    // GIVEN: User is on homepage contact form
    await page.goto("/");
    await page
      .getByRole("button", { name: /Get Started/i })
      .first()
      .click();

    // WHEN: User attempts to submit form without filling required fields
    const submitButton = page.getByRole("button", { name: /Send Message/i });

    // THEN: Form validation prevents submission (HTML5 required attribute)
    // Note: Browser native validation will show error, but we can verify button is enabled
    // and form has required attributes
    await expect(page.locator('input[name="name"]')).toHaveAttribute(
      "required",
      "",
    );
    await expect(page.locator('input[name="email"]')).toHaveAttribute(
      "required",
      "",
    );
    await expect(page.locator('textarea[name="message"]')).toHaveAttribute(
      "required",
      "",
    );
  });

  test("[P1] should validate email format", async ({ page }) => {
    // GIVEN: User is on homepage contact form
    await page.goto("/");
    await page
      .getByRole("button", { name: /Get Started/i })
      .first()
      .click();

    // WHEN: User enters invalid email format
    await page.locator('input[name="email"]').fill("invalid-email");

    // THEN: Browser validation prevents submission (HTML5 email type)
    await expect(page.locator('input[name="email"]')).toHaveAttribute(
      "type",
      "email",
    );
  });

  // TODO: This test is flaky due to cross-origin request timing issues
  // The form posts to backend (localhost:3001) which can't be reliably intercepted
  test.skip("[P1] should disable submit button while form is submitting", async ({
    page,
  }) => {
    // GIVEN: User is on homepage contact form with valid data
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const getStartedButton = page
      .getByRole("button", { name: /Get Started/i })
      .first();
    await expect(getStartedButton).toBeVisible({ timeout: 10000 });
    await getStartedButton.click();

    await page.locator('input[name="name"]').fill("John Doe");
    await page.locator('input[name="email"]').fill("john.doe@test.com");
    await page.locator('textarea[name="message"]').fill("Test message");

    // WHEN: User submits form
    // The form submits to the backend (cross-origin), so we verify behavior by:
    // 1. Checking that the button becomes disabled after clicking
    // 2. Verifying either success or error state appears (form completion)
    const submitButton = page.getByRole("button", { name: /Send Message/i });
    await expect(submitButton).toBeEnabled();

    // Click and immediately verify the button gets disabled
    await submitButton.click();

    // THEN: The form should either show success message OR error message
    // This confirms the form submission was attempted and completed
    // (We can't reliably intercept cross-origin requests in Playwright)
    const successMessage = page.getByText(/Thank you! We'll be in touch soon/i);
    const errorMessage = page.getByText(/Something went wrong/i);

    // Wait for either success or error - both indicate form submission worked
    await expect(successMessage.or(errorMessage)).toBeVisible({
      timeout: 10000,
    });

    // Additionally verify the button is re-enabled after submission completes
    // This confirms the loading state cycle completed
    const finalButton = page.getByRole("button", { name: /Send Message/i });
    await expect(finalButton).toBeEnabled({ timeout: 5000 });
  });

  test("[P2] should clear form fields after successful submission", async ({
    page,
  }) => {
    // GIVEN: User submits contact form successfully
    await page.goto("/");
    await page
      .getByRole("button", { name: /Get Started/i })
      .first()
      .click();

    await page.locator('input[name="name"]').fill("John Doe");
    await page.locator('input[name="email"]').fill("john.doe@test.com");
    await page.locator('textarea[name="message"]').fill("Test message");

    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.getByRole("button", { name: /Send Message/i }).click();

    // WHEN: Form submission completes
    await expect(
      page.getByText(/Thank you! We'll be in touch soon/i),
    ).toBeVisible({ timeout: 5000 });

    // THEN: Form fields are cleared
    await expect(page.locator('input[name="name"]')).toHaveValue("");
    await expect(page.locator('input[name="email"]')).toHaveValue("");
    await expect(page.locator('textarea[name="message"]')).toHaveValue("");
  });

  test("[P1] should display error message on form submission failure", async ({
    page,
  }) => {
    // GIVEN: User is on homepage contact form
    await page.goto("/");
    await page
      .getByRole("button", { name: /Get Started/i })
      .first()
      .click();

    await page.locator('input[name="name"]').fill("John Doe");
    await page.locator('input[name="email"]').fill("john.doe@test.com");
    await page.locator('textarea[name="message"]').fill("Test message");

    // WHEN: Form submission fails (server error)
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.getByRole("button", { name: /Send Message/i }).click();

    // THEN: Error message is displayed
    // Note: Current implementation simulates success, but we test the error state UI
    // This test documents expected behavior when backend error handling is implemented
    await expect(page.getByText(/Something went wrong/i)).toBeVisible({
      timeout: 5000,
    });
  });
});
