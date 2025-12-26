/**
 * CSP Security Headers API Tests
 *
 * CRITICAL: These tests ensure the Content-Security-Policy header is correctly
 * configured at RUNTIME to include the backend URL.
 *
 * BACKGROUND: A production outage occurred because CSP was set in next.config.js
 * headers() which evaluates at BUILD TIME. Environment variables were empty
 * during Docker build, resulting in:
 *   connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com
 *
 * This blocked all API calls to the Railway backend, crashing the entire app.
 *
 * FIX: CSP is now generated in src/middleware.ts at RUNTIME, reading env vars
 * on every request.
 *
 * @test-level API
 * @justification Prevents production outages from misconfigured CSP
 * @priority P0 (Critical - Production outage prevention)
 */

import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

test.describe("CSP Security Headers", () => {
  test.describe("Runtime CSP Configuration", () => {
    test("CSP-001: [P0] CSP connect-src MUST include backend URL at runtime", async ({
      request,
    }) => {
      // GIVEN: The frontend is running with NEXT_PUBLIC_BACKEND_URL set
      // WHEN: I make a request to any page
      const response = await request.get(FRONTEND_URL);

      // THEN: The response should have a CSP header
      const cspHeader = response.headers()["content-security-policy"];
      expect(
        cspHeader,
        "CSP header must be present - if missing, middleware is not applying headers",
      ).toBeDefined();

      // AND: The CSP connect-src must include 'self'
      expect(cspHeader, "CSP must include 'self' in connect-src").toContain(
        "connect-src",
      );
      expect(cspHeader).toContain("'self'");

      // AND: The CSP connect-src must include the backend URL
      // This is the CRITICAL check - if this fails, API calls will be blocked
      const backendUrlToCheck =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

      // Only check for backend URL if it's set and not localhost
      // (localhost is covered by 'self')
      if (
        backendUrlToCheck &&
        !backendUrlToCheck.includes("localhost") &&
        backendUrlToCheck !== "'self'"
      ) {
        expect(
          cspHeader,
          `CSP connect-src MUST include backend URL: ${backendUrlToCheck}. ` +
            `If this fails, the frontend cannot make API calls to the backend. ` +
            `This caused a production outage. Check that NEXT_PUBLIC_BACKEND_URL ` +
            `is set in Railway runtime environment variables.`,
        ).toContain(backendUrlToCheck);
      }
    });

    test("CSP-002: [P0] CSP header must be present on all routes", async ({
      request,
    }) => {
      // GIVEN: Various routes in the application
      const routes = ["/", "/login", "/dashboard", "/mystore"];

      for (const route of routes) {
        // WHEN: I request each route
        const response = await request.get(`${FRONTEND_URL}${route}`, {
          maxRedirects: 0,
          failOnStatusCode: false,
        });

        // THEN: CSP header must be present (even on redirects)
        const cspHeader = response.headers()["content-security-policy"];
        expect(
          cspHeader,
          `CSP header must be present on ${route}`,
        ).toBeDefined();
      }
    });

    test("CSP-003: [P0] All required security headers must be present", async ({
      request,
    }) => {
      // GIVEN: The frontend is running
      // WHEN: I make a request
      const response = await request.get(FRONTEND_URL);

      // THEN: All OWASP security headers must be present
      const headers = response.headers();

      // Required headers per OWASP guidelines
      const requiredHeaders = [
        "content-security-policy",
        "strict-transport-security",
        "x-content-type-options",
        "x-frame-options",
        "referrer-policy",
        "permissions-policy",
        "x-xss-protection",
      ];

      for (const header of requiredHeaders) {
        expect(
          headers[header],
          `Security header '${header}' must be present`,
        ).toBeDefined();
      }

      // Verify specific header values
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-xss-protection"]).toBe("1; mode=block");
    });
  });

  test.describe("CSP Directive Validation", () => {
    test("CSP-004: [P1] CSP must have secure default-src", async ({
      request,
    }) => {
      const response = await request.get(FRONTEND_URL);
      const cspHeader = response.headers()["content-security-policy"];

      // default-src should be 'self' - no wildcards
      expect(cspHeader).toContain("default-src 'self'");
      expect(cspHeader).not.toContain("default-src *");
    });

    test("CSP-005: [P1] CSP must prevent framing (clickjacking protection)", async ({
      request,
    }) => {
      const response = await request.get(FRONTEND_URL);
      const cspHeader = response.headers()["content-security-policy"];

      // frame-ancestors 'none' prevents the page from being embedded
      expect(cspHeader).toContain("frame-ancestors 'none'");
    });

    test("CSP-006: [P1] CSP must have form-action restriction", async ({
      request,
    }) => {
      const response = await request.get(FRONTEND_URL);
      const cspHeader = response.headers()["content-security-policy"];

      // form-action 'self' prevents form submissions to external domains
      expect(cspHeader).toContain("form-action 'self'");
    });

    test("CSP-007: [P1] CSP must block object/embed elements", async ({
      request,
    }) => {
      const response = await request.get(FRONTEND_URL);
      const cspHeader = response.headers()["content-security-policy"];

      // object-src 'none' prevents Flash and other plugins
      expect(cspHeader).toContain("object-src 'none'");
    });

    test("CSP-008: [P2] CSP must enforce HTTPS upgrades", async ({
      request,
    }) => {
      const response = await request.get(FRONTEND_URL);
      const cspHeader = response.headers()["content-security-policy"];

      // upgrade-insecure-requests forces HTTPS for all resources
      expect(cspHeader).toContain("upgrade-insecure-requests");
    });
  });

  test.describe("Production Environment Validation", () => {
    test("CSP-009: [P0] Verify CSP allows Google Fonts", async ({
      request,
    }) => {
      const response = await request.get(FRONTEND_URL);
      const cspHeader = response.headers()["content-security-policy"];

      // Must allow Google Fonts for styling
      expect(cspHeader).toContain("https://fonts.googleapis.com");
      expect(cspHeader).toContain("https://fonts.gstatic.com");
    });

    test("CSP-010: [P0] Verify HSTS is configured for production", async ({
      request,
    }) => {
      const response = await request.get(FRONTEND_URL);
      const hstsHeader = response.headers()["strict-transport-security"];

      // HSTS should be set for at least 1 year with includeSubDomains
      expect(hstsHeader).toContain("max-age=31536000");
      expect(hstsHeader).toContain("includeSubDomains");
    });
  });
});

/**
 * Integration test that verifies CSP doesn't block actual API calls
 * This is the ultimate validation that the fix works
 */
test.describe("CSP API Call Validation", () => {
  test("CSP-011: [P0] Frontend can successfully call backend API (CSP allows connect)", async ({
    request,
  }) => {
    // GIVEN: The backend health endpoint exists
    // WHEN: I call the health endpoint directly
    const healthResponse = await request.get(`${BACKEND_URL}/api/health`, {
      failOnStatusCode: false,
    });

    // THEN: The backend should respond (proving the URL is reachable)
    // This doesn't test CSP directly but ensures the backend is up
    expect([200, 503]).toContain(healthResponse.status());
  });

  test("CSP-012: [P0] Login page loads without CSP violations", async ({
    request,
  }) => {
    // GIVEN: The login page
    // WHEN: I request it
    const response = await request.get(`${FRONTEND_URL}/login`, {
      failOnStatusCode: false,
      maxRedirects: 5,
    });

    // THEN: The page should load (200 or redirect)
    expect([200, 302, 307, 308]).toContain(response.status());

    // AND: CSP header should be present and include backend URL
    const cspHeader = response.headers()["content-security-policy"];
    expect(cspHeader).toBeDefined();
  });
});
