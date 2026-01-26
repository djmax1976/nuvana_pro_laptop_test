/**
 * Device API Activation - POS Connection Config Tests
 *
 * Story: Store-level POS Connection Configuration
 *
 * @test-level API
 * @justification API-level tests for POS connection config returned by activation endpoint
 * @feature Device API Activation
 * @created 2026-01-25
 * @priority P0 (Critical)
 *
 * BUSINESS RULES TESTED:
 * - BR-ACT-001: Activation response includes posConnectionConfig from Store
 * - BR-ACT-002: posConnectionConfig contains pos_type from Store
 * - BR-ACT-003: posConnectionConfig contains pos_connection_type from Store
 * - BR-ACT-004: posConnectionConfig contains pos_connection_config from Store
 * - BR-ACT-005: Config keys are in snake_case format (import_path, not importPath)
 * - BR-ACT-006: MANUAL stores return null for pos_connection_config
 *
 * SECURITY FOCUS:
 * - API key authentication required
 * - Store isolation (only returns config for store bound to API key)
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on the exact format of posConnectionConfig (snake_case keys)
 * - This was the root cause of the desktop app bug
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createStore, createCompany, createUser } from "../support/helpers";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import jwt from "jsonwebtoken";

test.describe("Device API Activation - POS Connection Config", () => {
  const JWT_SECRET =
    process.env.API_KEY_SECRET || process.env.JWT_SECRET || "test-secret";

  /**
   * Helper to create an API key for a store
   */
  async function createApiKey(
    prisma: any,
    storeId: string,
    companyId: string,
    storeName: string,
    companyName: string,
    timezone: string,
    stateId?: string,
    stateCode?: string,
  ) {
    const apiKeyValue = `bmad_${crypto.randomBytes(32).toString("hex")}`;
    const hashedKey = crypto
      .createHash("sha256")
      .update(apiKeyValue)
      .digest("hex");

    const identityPayload = {
      store_id: storeId,
      store_name: storeName,
      store_public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
      company_id: companyId,
      company_name: companyName,
      timezone: timezone,
      state_id: stateId || null,
      state_code: stateCode || null,
      offline_permissions: ["TRANSACTION_CREATE", "SHIFT_OPEN", "SHIFT_CLOSE"],
      metadata: {},
    };

    const identityToken = jwt.sign(identityPayload, JWT_SECRET, {
      algorithm: "HS256",
    });

    const apiKey = await prisma.apiKey.create({
      data: {
        hashed_key: hashedKey,
        store_id: storeId,
        company_id: companyId,
        status: "PENDING",
        identity_payload: identityToken,
        notes: "Test API key for POS config tests",
      },
    });

    return { apiKeyValue, apiKey, identityPayload };
  }

  /**
   * BR-ACT-001: Activation response includes posConnectionConfig from Store
   * BR-ACT-005: Config keys are in snake_case format
   *
   * WHY: Desktop app expects snake_case keys (import_path) not camelCase (importPath)
   * RISK: App fails to read file path if keys don't match
   * VALIDATES: Store-level POS config is returned with snake_case keys
   */
  test("[P0-BR-ACT-001/005] should return posConnectionConfig with snake_case keys for FILE connection", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A store with GILBARCO_NAXML FILE connection config using snake_case keys
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "NAXML Test Company",
      owner_user_id: owner.user_id,
    });

    const store = await prismaClient.store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "NAXML Test Store",
        pos_type: "GILBARCO_NAXML",
        pos_connection_type: "FILE",
        pos_connection_config: {
          import_path: "c:\\XMLGateway_new",
          poll_interval_seconds: 60,
        },
      },
    });

    const { apiKeyValue } = await createApiKey(
      prismaClient,
      store.store_id,
      company.company_id,
      store.name,
      company.name,
      "America/New_York",
    );

    // WHEN: Activating the API key
    const response = await request.post(`${backendUrl}/api/v1/keys/activate`, {
      headers: {
        "X-API-Key": apiKeyValue,
        "Content-Type": "application/json",
      },
      data: {
        deviceFingerprint: "test-device-fingerprint",
        appVersion: "1.0.0",
      },
    });

    // THEN: Response includes posConnectionConfig with snake_case keys
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify posConnectionConfig structure
    expect(body.data).toHaveProperty("posConnectionConfig");
    const posConfig = body.data.posConnectionConfig;

    expect(posConfig.pos_type).toBe("GILBARCO_NAXML");
    expect(posConfig.pos_connection_type).toBe("FILE");
    expect(posConfig.pos_connection_config).toBeDefined();

    // CRITICAL: Verify snake_case keys
    expect(posConfig.pos_connection_config).toHaveProperty("import_path");
    expect(posConfig.pos_connection_config).not.toHaveProperty("importPath");
    expect(posConfig.pos_connection_config.import_path).toBe(
      "c:\\XMLGateway_new",
    );
    expect(posConfig.pos_connection_config.poll_interval_seconds).toBe(60);
  });

  /**
   * BR-ACT-005: Config keys are in snake_case format for API connection
   */
  test("[P0-BR-ACT-005] should return posConnectionConfig with snake_case keys for API connection", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A store with SQUARE_REST API connection config using snake_case keys
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Square Test Company",
      owner_user_id: owner.user_id,
    });

    const store = await prismaClient.store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "Square Test Store",
        pos_type: "SQUARE_REST",
        pos_connection_type: "API",
        pos_connection_config: {
          base_url: "https://connect.squareup.com",
          api_key: "EAAAL...",
          location_id: "L123456",
        },
      },
    });

    const { apiKeyValue } = await createApiKey(
      prismaClient,
      store.store_id,
      company.company_id,
      store.name,
      company.name,
      "America/New_York",
    );

    // WHEN: Activating the API key
    const response = await request.post(`${backendUrl}/api/v1/keys/activate`, {
      headers: {
        "X-API-Key": apiKeyValue,
        "Content-Type": "application/json",
      },
      data: {
        deviceFingerprint: "test-device-fingerprint",
        appVersion: "1.0.0",
      },
    });

    // THEN: Response includes posConnectionConfig with snake_case keys
    expect(response.status()).toBe(200);
    const body = await response.json();

    const posConfig = body.data.posConnectionConfig;
    expect(posConfig.pos_type).toBe("SQUARE_REST");
    expect(posConfig.pos_connection_type).toBe("API");

    // CRITICAL: Verify snake_case keys (not camelCase)
    expect(posConfig.pos_connection_config).toHaveProperty("base_url");
    expect(posConfig.pos_connection_config).toHaveProperty("api_key");
    expect(posConfig.pos_connection_config).not.toHaveProperty("baseUrl");
    expect(posConfig.pos_connection_config).not.toHaveProperty("apiKey");
  });

  /**
   * BR-ACT-006: MANUAL stores return null for pos_connection_config
   */
  test("[P0-BR-ACT-006] should return null pos_connection_config for MANUAL stores", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A store with MANUAL_ENTRY connection type
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Manual Test Company",
      owner_user_id: owner.user_id,
    });

    const store = await prismaClient.store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "Manual Test Store",
        pos_type: "MANUAL_ENTRY",
        pos_connection_type: "MANUAL",
        pos_connection_config: Prisma.DbNull,
      },
    });

    const { apiKeyValue } = await createApiKey(
      prismaClient,
      store.store_id,
      company.company_id,
      store.name,
      company.name,
      "America/New_York",
    );

    // WHEN: Activating the API key
    const response = await request.post(`${backendUrl}/api/v1/keys/activate`, {
      headers: {
        "X-API-Key": apiKeyValue,
        "Content-Type": "application/json",
      },
      data: {
        deviceFingerprint: "test-device-fingerprint",
        appVersion: "1.0.0",
      },
    });

    // THEN: Response includes posConnectionConfig with null config
    expect(response.status()).toBe(200);
    const body = await response.json();

    const posConfig = body.data.posConnectionConfig;
    expect(posConfig.pos_type).toBe("MANUAL_ENTRY");
    expect(posConfig.pos_connection_type).toBe("MANUAL");
    expect(posConfig.pos_connection_config).toBeNull();
  });

  /**
   * BR-ACT-002/003/004: posConnectionConfig contains correct Store-level config
   */
  test("[P0-BR-ACT-002/003/004] should return complete posConnectionConfig from Store", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A store with NETWORK connection config
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Network Test Company",
      owner_user_id: owner.user_id,
    });

    const networkConfig = {
      host: "192.168.1.100",
      port: 9876,
      protocol: "TCP",
    };

    const store = await prismaClient.store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "Network Test Store",
        pos_type: "GILBARCO_PASSPORT",
        pos_connection_type: "NETWORK",
        pos_connection_config: networkConfig,
      },
    });

    const { apiKeyValue } = await createApiKey(
      prismaClient,
      store.store_id,
      company.company_id,
      store.name,
      company.name,
      "America/New_York",
    );

    // WHEN: Activating the API key
    const response = await request.post(`${backendUrl}/api/v1/keys/activate`, {
      headers: {
        "X-API-Key": apiKeyValue,
        "Content-Type": "application/json",
      },
      data: {
        deviceFingerprint: "test-device-fingerprint",
        appVersion: "1.0.0",
      },
    });

    // THEN: Response includes complete posConnectionConfig
    expect(response.status()).toBe(200);
    const body = await response.json();

    const posConfig = body.data.posConnectionConfig;

    // BR-ACT-002: pos_type from Store
    expect(posConfig.pos_type).toBe("GILBARCO_PASSPORT");

    // BR-ACT-003: pos_connection_type from Store
    expect(posConfig.pos_connection_type).toBe("NETWORK");

    // BR-ACT-004: pos_connection_config from Store
    expect(posConfig.pos_connection_config).toMatchObject(networkConfig);
  });

  /**
   * Verify WEBHOOK connection config with snake_case keys
   */
  test("[P1] should return posConnectionConfig with snake_case keys for WEBHOOK connection", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A store with WEBHOOK connection config
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Webhook Test Company",
      owner_user_id: owner.user_id,
    });

    const store = await prismaClient.store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "Webhook Test Store",
        pos_type: "GENERIC_REST",
        pos_connection_type: "WEBHOOK",
        pos_connection_config: {
          webhook_url: "https://example.com/webhook",
          secret: "webhook-secret-123",
        },
      },
    });

    const { apiKeyValue } = await createApiKey(
      prismaClient,
      store.store_id,
      company.company_id,
      store.name,
      company.name,
      "America/New_York",
    );

    // WHEN: Activating the API key
    const response = await request.post(`${backendUrl}/api/v1/keys/activate`, {
      headers: {
        "X-API-Key": apiKeyValue,
        "Content-Type": "application/json",
      },
      data: {
        deviceFingerprint: "test-device-fingerprint",
        appVersion: "1.0.0",
      },
    });

    // THEN: Response includes posConnectionConfig with snake_case keys
    expect(response.status()).toBe(200);
    const body = await response.json();

    const posConfig = body.data.posConnectionConfig;

    // Verify snake_case keys
    expect(posConfig.pos_connection_config).toHaveProperty("webhook_url");
    expect(posConfig.pos_connection_config).toHaveProperty("secret");
    expect(posConfig.pos_connection_config).not.toHaveProperty("webhookUrl");
  });

  /**
   * Verify default values for stores without explicit POS config
   */
  test("[P1] should return default MANUAL_ENTRY config for stores without POS config", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A store created without explicit POS config (using defaults)
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Default Config Test Company",
      owner_user_id: owner.user_id,
    });

    // Create store without POS config - should get defaults
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Default Config Test Store",
    });

    const { apiKeyValue } = await createApiKey(
      prismaClient,
      store.store_id,
      company.company_id,
      store.name,
      company.name,
      "America/New_York",
    );

    // WHEN: Activating the API key
    const response = await request.post(`${backendUrl}/api/v1/keys/activate`, {
      headers: {
        "X-API-Key": apiKeyValue,
        "Content-Type": "application/json",
      },
      data: {
        deviceFingerprint: "test-device-fingerprint",
        appVersion: "1.0.0",
      },
    });

    // THEN: Response includes default MANUAL_ENTRY config
    expect(response.status()).toBe(200);
    const body = await response.json();

    const posConfig = body.data.posConnectionConfig;
    expect(posConfig.pos_type).toBe("MANUAL_ENTRY");
    expect(posConfig.pos_connection_type).toBe("MANUAL");
    expect(posConfig.pos_connection_config).toBeNull();
  });

  /**
   * Security: API key required for activation
   */
  test("[P0] should reject activation without API key", async ({
    request,
    backendUrl,
  }) => {
    // WHEN: Attempting activation without API key
    const response = await request.post(`${backendUrl}/api/v1/keys/activate`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        deviceFingerprint: "test-device-fingerprint",
        appVersion: "1.0.0",
      },
    });

    // THEN: Request is rejected
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  /**
   * Security: Invalid API key rejected
   */
  test("[P0] should reject activation with invalid API key", async ({
    request,
    backendUrl,
  }) => {
    // WHEN: Attempting activation with invalid API key
    const response = await request.post(`${backendUrl}/api/v1/keys/activate`, {
      headers: {
        "X-API-Key": "bmad_invalid_key_that_does_not_exist",
        "Content-Type": "application/json",
      },
      data: {
        deviceFingerprint: "test-device-fingerprint",
        appVersion: "1.0.0",
      },
    });

    // THEN: Request is rejected
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});
