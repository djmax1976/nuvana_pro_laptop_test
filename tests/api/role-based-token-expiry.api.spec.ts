import { test, expect } from "@playwright/test";
import { AuthService } from "../../backend/src/services/auth.service";
import jwt from "jsonwebtoken";

test.describe("Role-Based Token Expiry", () => {
  let authService: AuthService;

  test.beforeEach(() => {
    authService = new AuthService();
  });

  test("[P0] Super admin should receive 8 hour access token", async () => {
    // GIVEN: A super admin user
    const userId = "test-super-admin-id";
    const email = "superadmin@test.com";
    const roles = ["SUPERADMIN"];
    const permissions = ["ALL"];

    // WHEN: Generating access token
    const accessToken = authService.generateAccessToken(
      userId,
      email,
      roles,
      permissions,
    );

    // THEN: Token should be valid and have 8 hour expiry
    const decoded = jwt.decode(accessToken) as any;
    expect(decoded).toBeTruthy();
    expect(decoded.user_id).toBe(userId);
    expect(decoded.email).toBe(email);
    expect(decoded.roles).toEqual(roles);

    // Verify expiry is approximately 8 hours (28800 seconds)
    const expiryTime = decoded.exp - decoded.iat;
    expect(expiryTime).toBeGreaterThanOrEqual(28790); // 8h - 10s tolerance
    expect(expiryTime).toBeLessThanOrEqual(28810); // 8h + 10s tolerance
  });

  test("[P0] Regular user should receive 1 hour access token", async () => {
    // GIVEN: A regular user with CLIENT_OWNER role
    const userId = "test-user-id";
    const email = "user@test.com";
    const roles = ["CLIENT_OWNER"];
    const permissions = ["CLIENT_READ", "CLIENT_UPDATE"];

    // WHEN: Generating access token
    const accessToken = authService.generateAccessToken(
      userId,
      email,
      roles,
      permissions,
    );

    // THEN: Token should be valid and have 1 hour expiry
    const decoded = jwt.decode(accessToken) as any;
    expect(decoded).toBeTruthy();
    expect(decoded.user_id).toBe(userId);
    expect(decoded.email).toBe(email);
    expect(decoded.roles).toEqual(roles);

    // Verify expiry is approximately 1 hour (3600 seconds)
    const expiryTime = decoded.exp - decoded.iat;
    expect(expiryTime).toBeGreaterThanOrEqual(3590); // 1h - 10s tolerance
    expect(expiryTime).toBeLessThanOrEqual(3610); // 1h + 10s tolerance
  });

  test("[P0] User with multiple roles including SUPERADMIN should receive 8 hour token", async () => {
    // GIVEN: A user with SUPERADMIN and other roles
    const userId = "test-multi-role-id";
    const email = "multirole@test.com";
    const roles = ["SUPERADMIN", "CLIENT_OWNER"];
    const permissions = ["ALL"];

    // WHEN: Generating access token
    const accessToken = authService.generateAccessToken(
      userId,
      email,
      roles,
      permissions,
    );

    // THEN: Token should have 8 hour expiry (SUPERADMIN takes precedence)
    const decoded = jwt.decode(accessToken) as any;
    expect(decoded).toBeTruthy();

    // Verify expiry is approximately 8 hours (28800 seconds)
    const expiryTime = decoded.exp - decoded.iat;
    expect(expiryTime).toBeGreaterThanOrEqual(28790); // 8h - 10s tolerance
    expect(expiryTime).toBeLessThanOrEqual(28810); // 8h + 10s tolerance
  });

  test("[P0] User with no roles should receive 1 hour token", async () => {
    // GIVEN: A user with no roles assigned yet
    const userId = "test-no-roles-id";
    const email = "noroles@test.com";
    const roles: string[] = [];
    const permissions: string[] = [];

    // WHEN: Generating access token
    const accessToken = authService.generateAccessToken(
      userId,
      email,
      roles,
      permissions,
    );

    // THEN: Token should have default 1 hour expiry
    const decoded = jwt.decode(accessToken) as any;
    expect(decoded).toBeTruthy();

    // Verify expiry is approximately 1 hour (3600 seconds)
    const expiryTime = decoded.exp - decoded.iat;
    expect(expiryTime).toBeGreaterThanOrEqual(3590); // 1h - 10s tolerance
    expect(expiryTime).toBeLessThanOrEqual(3610); // 1h + 10s tolerance
  });
});
