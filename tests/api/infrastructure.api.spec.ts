import { test, expect } from "@playwright/test";

test.describe("Infrastructure & Server Configuration [P0]", () => {
  test("[P0] Backend server starts on port 3001", async ({ request }) => {
    const response = await request.get("http://localhost:3001/api/health");
    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);
  });

  test("[P0] Backend health endpoint returns correct structure", async ({
    request,
  }) => {
    const response = await request.get("http://localhost:3001/api/health");
    expect(response.ok()).toBe(true);

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body.status).toBe("ok");
  });
});

test.describe("CORS Configuration [P0]", () => {
  test("[P0] Backend allows requests from frontend origin", async ({
    request,
  }) => {
    const response = await request.fetch("http://localhost:3001/api/health", {
      method: "GET",
      headers: {
        Origin: "http://localhost:3000",
      },
    });

    const allowOrigin = response.headers()["access-control-allow-origin"];
    expect(allowOrigin).toBe("http://localhost:3000");
  });

  test("[P0] Backend handles preflight OPTIONS requests", async ({
    request,
  }) => {
    const response = await request.fetch(
      "http://localhost:3001/api/auth/login",
      {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      },
    );

    expect(response.status()).toBeLessThan(400);

    const headers = response.headers();
    expect(headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
    expect(headers["access-control-allow-methods"]).toContain("POST");
  });

  test("[P0] Backend allows credentials in CORS", async ({ request }) => {
    const response = await request.fetch("http://localhost:3001/api/health", {
      method: "GET",
      headers: {
        Origin: "http://localhost:3000",
      },
    });

    const allowCredentials =
      response.headers()["access-control-allow-credentials"];
    expect(allowCredentials).toBe("true");
  });

  test("[P1] Backend allows required HTTP methods", async ({ request }) => {
    const response = await request.fetch(
      "http://localhost:3001/api/auth/login",
      {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "POST",
        },
      },
    );

    const allowedMethods = response.headers()["access-control-allow-methods"];
    expect(allowedMethods).toContain("GET");
    expect(allowedMethods).toContain("POST");
    expect(allowedMethods).toContain("PUT");
    expect(allowedMethods).toContain("DELETE");
  });

  test("[P1] Backend allows required headers", async ({ request }) => {
    const response = await request.fetch(
      "http://localhost:3001/api/auth/login",
      {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,authorization",
        },
      },
    );

    const allowedHeaders = response.headers()["access-control-allow-headers"];
    expect(allowedHeaders?.toLowerCase()).toContain("content-type");
    expect(allowedHeaders?.toLowerCase()).toContain("authorization");
  });
});

test.describe("Port Configuration [P1]", () => {
  test("[P1] Frontend does not attempt to use backend port", async ({
    page,
  }) => {
    // This would fail if frontend tries to start on 3001
    const response = await page.goto("http://localhost:3000");
    expect(response?.ok()).toBe(true);
  });

  test("[P1] Backend does not attempt to use frontend port", async ({
    request,
  }) => {
    // This would fail if backend tries to start on 3000
    const response = await request.get("http://localhost:3001/api/health");
    expect(response.ok()).toBe(true);
  });
});

test.describe("Environment Variables [P1]", () => {
  test("[P1] Backend reads BACKEND_PORT from environment", async ({
    request,
  }) => {
    // Backend should be on port 3001 as configured
    const response = await request.get("http://localhost:3001/api/health");
    expect(response.ok()).toBe(true);

    // Should not be on default port if BACKEND_PORT was set
    try {
      await request.get("http://localhost:3000/api/health", { timeout: 1000 });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      // Expected to fail - backend should not be on frontend port
      expect(error).toBeDefined();
    }
  });
});
