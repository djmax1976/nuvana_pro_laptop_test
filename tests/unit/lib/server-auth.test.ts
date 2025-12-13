/**
 * Unit Tests: Server-Side Authentication Utilities
 *
 * Tests for src/lib/server/auth.ts
 *
 * CRITICAL TEST COVERAGE:
 * - isCrossOriginDeployment() detection logic
 * - checkSuperAdminPermission() return values for different scenarios
 * - Cross-origin handling to prevent broken redirects on Railway
 *
 * @test-level Unit
 * @story cross-origin-authentication
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock next/headers cookies() function
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe("UNIT: Server Auth - isCrossOriginDeployment Detection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isCrossOriginDeployment logic", () => {
    it("[P0] should detect cross-origin when production + external backend URL", async () => {
      // Arrange
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv(
        "NEXT_PUBLIC_BACKEND_URL",
        "https://backend-production.up.railway.app",
      );

      // Import fresh module with new env
      const { checkSuperAdminPermission } =
        await import("../../../src/lib/server/auth");
      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue(undefined), // No cookie accessible
      } as any);

      // Act
      const result = await checkSuperAdminPermission();

      // Assert - should return isCrossOrigin: true when no cookie in cross-origin mode
      expect(result.isCrossOrigin).toBe(true);
      expect(result.isAuthorized).toBe(true); // Optimistically allow
      expect(result.isAuthenticated).toBe(true);
      expect(result.user).toBeNull();
    });

    it("[P0] should NOT detect cross-origin in development", async () => {
      // Arrange
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:3001");

      // Import fresh module with new env
      const { checkSuperAdminPermission } =
        await import("../../../src/lib/server/auth");
      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue(undefined), // No cookie
      } as any);

      // Act
      const result = await checkSuperAdminPermission();

      // Assert - should return not authorized (no cross-origin fallback)
      expect(result.isCrossOrigin).toBeUndefined();
      expect(result.isAuthorized).toBe(false);
      expect(result.isAuthenticated).toBe(false);
    });

    it("[P0] should NOT detect cross-origin when backend URL contains localhost", async () => {
      // Arrange
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:3001");

      // Import fresh module with new env
      const { checkSuperAdminPermission } =
        await import("../../../src/lib/server/auth");
      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue(undefined), // No cookie
      } as any);

      // Act
      const result = await checkSuperAdminPermission();

      // Assert - localhost in production should not trigger cross-origin
      expect(result.isCrossOrigin).toBeUndefined();
      expect(result.isAuthorized).toBe(false);
    });

    it("[P0] should NOT detect cross-origin when NEXT_PUBLIC_BACKEND_URL is not set", async () => {
      // Arrange
      vi.stubEnv("NODE_ENV", "production");
      // Don't stub NEXT_PUBLIC_BACKEND_URL - leave it undefined

      // Import fresh module with new env
      const { checkSuperAdminPermission } =
        await import("../../../src/lib/server/auth");
      const { cookies } = await import("next/headers");
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue(undefined), // No cookie
      } as any);

      // Act
      const result = await checkSuperAdminPermission();

      // Assert - no backend URL means not cross-origin
      expect(result.isCrossOrigin).toBeUndefined();
      expect(result.isAuthorized).toBe(false);
    });
  });
});

describe("UNIT: Server Auth - checkSuperAdminPermission", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "development"); // Default to development for most tests
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:3001");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("with valid access token", () => {
    it("[P0] should return authorized when user has ADMIN_SYSTEM_CONFIG permission", async () => {
      // Arrange
      const { checkSuperAdminPermission } =
        await import("../../../src/lib/server/auth");
      const { cookies } = await import("next/headers");

      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-token" }),
      } as any);

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          user: {
            id: "user-123",
            email: "admin@test.com",
            name: "Admin",
            roles: ["SUPERADMIN"],
            permissions: ["ADMIN_SYSTEM_CONFIG", "USER_READ"],
            is_client_user: false,
          },
          message: "Success",
        }),
      } as any);

      // Act
      const result = await checkSuperAdminPermission();

      // Assert
      expect(result.isAuthorized).toBe(true);
      expect(result.isAuthenticated).toBe(true);
      expect(result.user).not.toBeNull();
      expect(result.user?.email).toBe("admin@test.com");
    });

    it("[P0] should return authorized when user has wildcard (*) permission", async () => {
      // Arrange
      const { checkSuperAdminPermission } =
        await import("../../../src/lib/server/auth");
      const { cookies } = await import("next/headers");

      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-token" }),
      } as any);

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          user: {
            id: "user-123",
            email: "superadmin@test.com",
            name: "Super Admin",
            roles: ["SUPERADMIN"],
            permissions: ["*"],
            is_client_user: false,
          },
          message: "Success",
        }),
      } as any);

      // Act
      const result = await checkSuperAdminPermission();

      // Assert
      expect(result.isAuthorized).toBe(true);
      expect(result.isAuthenticated).toBe(true);
    });

    it("[P0] should return NOT authorized when user lacks ADMIN_SYSTEM_CONFIG permission", async () => {
      // Arrange
      const { checkSuperAdminPermission } =
        await import("../../../src/lib/server/auth");
      const { cookies } = await import("next/headers");

      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-token" }),
      } as any);

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          user: {
            id: "user-456",
            email: "client@test.com",
            name: "Client Owner",
            roles: ["CLIENT_OWNER"],
            permissions: ["CLIENT_DASHBOARD_ACCESS", "STORE_READ"],
            is_client_user: true,
          },
          message: "Success",
        }),
      } as any);

      // Act
      const result = await checkSuperAdminPermission();

      // Assert
      expect(result.isAuthorized).toBe(false);
      expect(result.isAuthenticated).toBe(true);
      expect(result.user).toBeNull(); // User not returned when not authorized
    });
  });

  describe("without access token", () => {
    it("[P0] should return not authenticated when no cookie (same-origin)", async () => {
      // Arrange - NODE_ENV already set to development in beforeEach

      const { checkSuperAdminPermission } =
        await import("../../../src/lib/server/auth");
      const { cookies } = await import("next/headers");

      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue(undefined),
      } as any);

      // Act
      const result = await checkSuperAdminPermission();

      // Assert
      expect(result.isAuthorized).toBe(false);
      expect(result.isAuthenticated).toBe(false);
      expect(result.user).toBeNull();
      expect(result.isCrossOrigin).toBeUndefined();
    });
  });

  describe("API error handling", () => {
    it("[P1] should return not authenticated when API returns 401", async () => {
      // Arrange
      const { checkSuperAdminPermission } =
        await import("../../../src/lib/server/auth");
      const { cookies } = await import("next/headers");

      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "expired-token" }),
      } as any);

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as any);

      // Act
      const result = await checkSuperAdminPermission();

      // Assert
      expect(result.isAuthorized).toBe(false);
      expect(result.isAuthenticated).toBe(false);
    });

    it("[P1] should return not authenticated when API request fails", async () => {
      // Arrange
      const { checkSuperAdminPermission } =
        await import("../../../src/lib/server/auth");
      const { cookies } = await import("next/headers");

      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-token" }),
      } as any);

      vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

      // Act
      const result = await checkSuperAdminPermission();

      // Assert
      expect(result.isAuthorized).toBe(false);
      expect(result.isAuthenticated).toBe(false);
    });

    it("[P1] should return not authenticated when API request times out", async () => {
      // Arrange
      process.env.AUTH_REQUEST_TIMEOUT_MS = "100"; // Very short timeout

      const { checkSuperAdminPermission } =
        await import("../../../src/lib/server/auth");
      const { cookies } = await import("next/headers");

      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "valid-token" }),
      } as any);

      // Create an AbortError
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      vi.mocked(fetch).mockRejectedValue(abortError);

      // Act
      const result = await checkSuperAdminPermission();

      // Assert
      expect(result.isAuthorized).toBe(false);
      expect(result.isAuthenticated).toBe(false);
    });
  });
});

describe("UNIT: Server Auth - Security Edge Cases", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("[P0] SECURITY: should not authorize with empty permissions array", async () => {
    // Arrange
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:3001");

    const { checkSuperAdminPermission } =
      await import("../../../src/lib/server/auth");
    const { cookies } = await import("next/headers");

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "valid-token" }),
    } as any);

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        user: {
          id: "user-123",
          email: "user@test.com",
          name: "User",
          roles: [],
          permissions: [], // Empty permissions
          is_client_user: false,
        },
        message: "Success",
      }),
    } as any);

    // Act
    const result = await checkSuperAdminPermission();

    // Assert
    expect(result.isAuthorized).toBe(false);
    expect(result.isAuthenticated).toBe(true);
  });

  it("[P0] SECURITY: should not authorize with similar but wrong permission name", async () => {
    // Arrange
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:3001");

    const { checkSuperAdminPermission } =
      await import("../../../src/lib/server/auth");
    const { cookies } = await import("next/headers");

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "valid-token" }),
    } as any);

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        user: {
          id: "user-123",
          email: "user@test.com",
          name: "User",
          roles: ["ADMIN"],
          permissions: [
            "ADMIN_SYSTEM", // Close but not ADMIN_SYSTEM_CONFIG
            "ADMIN_CONFIG", // Close but not ADMIN_SYSTEM_CONFIG
            "SYSTEM_CONFIG", // Close but not ADMIN_SYSTEM_CONFIG
          ],
          is_client_user: false,
        },
        message: "Success",
      }),
    } as any);

    // Act
    const result = await checkSuperAdminPermission();

    // Assert - should NOT be authorized with similar-looking permissions
    expect(result.isAuthorized).toBe(false);
  });

  it("[P0] SECURITY: cross-origin mode should still require client-side validation", async () => {
    // This test documents the expected behavior:
    // In cross-origin mode, server returns isAuthorized: true optimistically
    // but the CLIENT is responsible for actual validation

    // Arrange
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "NEXT_PUBLIC_BACKEND_URL",
      "https://backend-production.up.railway.app",
    );

    const { checkSuperAdminPermission } =
      await import("../../../src/lib/server/auth");
    const { cookies } = await import("next/headers");

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined), // No cookie in cross-origin
    } as any);

    // Act
    const result = await checkSuperAdminPermission();

    // Assert
    expect(result.isCrossOrigin).toBe(true);
    expect(result.isAuthorized).toBe(true); // Optimistically true
    expect(result.user).toBeNull(); // But no user data - client must verify
  });
});
