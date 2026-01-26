/**
 * Unit Tests: Store POS Configuration Validation
 *
 * Story: Store-level POS Connection Configuration
 *
 * @test-level UNIT
 * @justification Unit tests for POS configuration validation in store service
 * @feature Store POS Configuration
 * @created 2026-01-25
 * @priority P0 (Critical)
 *
 * BUSINESS RULES TESTED:
 * - BR-POS-001: pos_type must be from allowlist of valid POS system types
 * - BR-POS-002: pos_connection_type must be from allowlist (NETWORK, API, WEBHOOK, FILE, MANUAL)
 * - BR-POS-003: pos_connection_config must be a valid JSON object
 * - BR-POS-004: pos_connection_config is validated for XSS attacks
 * - BR-POS-005: pos_connection_config has size limit (10KB max)
 * - BR-POS-006: Default values are MANUAL_ENTRY and MANUAL when not provided
 *
 * SECURITY FOCUS:
 * - SEC-014: INPUT_VALIDATION - Allowlist validation for pos_type and pos_connection_type
 * - SEC-004: XSS - JSON config content validation
 * - SEC-006: SQL_INJECTION - ORM prevents injection (Prisma)
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on validation logic and error messages
 * - Snake_case keys in pos_connection_config (matches desktop app schema)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { StoreService } from "../../../backend/src/services/store.service";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const storeService = new StoreService();

// Shared test data
let testOwnerUser: any;
let testCompany: any;

const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdStoreIds: string[] = [];

// Global setup
beforeAll(async () => {
  // Create a test owner user
  const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
  testOwnerUser = await prisma.user.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
      email: `store-pos-config-test-owner-${Date.now()}@test.com`,
      name: "Store POS Config Test Owner",
      password_hash: hashedPassword,
      status: "ACTIVE",
    },
  });
  createdUserIds.push(testOwnerUser.user_id);

  // Create a test company (ACTIVE by default)
  testCompany = await prisma.company.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
      name: `Store POS Config Test Company ${Date.now()}`,
      address: "123 Test Street",
      status: "ACTIVE",
      owner_user_id: testOwnerUser.user_id,
    },
  });
  createdCompanyIds.push(testCompany.company_id);
});

// Global cleanup
afterAll(async () => {
  // Cleanup stores
  for (const storeId of createdStoreIds) {
    try {
      await prisma.store.delete({ where: { store_id: storeId } });
    } catch (e) {
      // Ignore
    }
  }

  // Cleanup companies
  for (const companyId of createdCompanyIds) {
    try {
      await prisma.store.deleteMany({ where: { company_id: companyId } });
      await prisma.company.delete({ where: { company_id: companyId } });
    } catch (e) {
      // Ignore
    }
  }

  // Cleanup users
  for (const userId of createdUserIds) {
    try {
      await prisma.userRole.deleteMany({ where: { user_id: userId } });
      await prisma.user.delete({ where: { user_id: userId } });
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  await prisma.$disconnect();
});

describe("Store POS Configuration - Creation", () => {
  /**
   * BR-POS-001: pos_type must be from allowlist of valid POS system types
   */
  describe("pos_type Validation", () => {
    it("[P0-BR-POS-001] should accept valid GILBARCO_NAXML pos_type", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `NAXML Store ${Date.now()}`,
        pos_type: "GILBARCO_NAXML",
        pos_connection_type: "FILE",
        pos_connection_config: { import_path: "c:\\naxml" },
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_type).toBe("GILBARCO_NAXML");
      expect(store.pos_connection_type).toBe("FILE");
    });

    it("[P0-BR-POS-001] should accept valid SQUARE_REST pos_type", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `Square Store ${Date.now()}`,
        pos_type: "SQUARE_REST",
        pos_connection_type: "API",
        pos_connection_config: {
          base_url: "https://connect.squareup.com",
          api_key: "EAAAL...",
        },
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_type).toBe("SQUARE_REST");
      expect(store.pos_connection_type).toBe("API");
    });

    it("[P0-BR-POS-001] should reject invalid pos_type", async () => {
      await expect(
        storeService.createStore({
          company_id: testCompany.company_id,
          name: `Invalid POS Type Store ${Date.now()}`,
          pos_type: "INVALID_POS_TYPE" as any,
        }),
      ).rejects.toThrow(/Invalid pos_type/);
    });

    it("[P0-BR-POS-001] should accept all valid POS system types", async () => {
      const validTypes = [
        "GILBARCO_PASSPORT",
        "GILBARCO_NAXML",
        "GILBARCO_COMMANDER",
        "VERIFONE_RUBY2",
        "VERIFONE_COMMANDER",
        "VERIFONE_SAPPHIRE",
        "CLOVER_REST",
        "ORACLE_SIMPHONY",
        "NCR_ALOHA",
        "LIGHTSPEED_REST",
        "SQUARE_REST",
        "TOAST_REST",
        "GENERIC_XML",
        "GENERIC_REST",
        "MANUAL_ENTRY",
      ];

      for (const posType of validTypes) {
        const store = await storeService.createStore({
          company_id: testCompany.company_id,
          name: `${posType} Store ${Date.now()}`,
          pos_type: posType as any,
        });
        createdStoreIds.push(store.store_id);
        expect(store.pos_type).toBe(posType);
      }
    });
  });

  /**
   * BR-POS-002: pos_connection_type must be from allowlist
   */
  describe("pos_connection_type Validation", () => {
    it("[P0-BR-POS-002] should accept valid NETWORK connection type", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `Network Store ${Date.now()}`,
        pos_connection_type: "NETWORK",
        pos_connection_config: {
          host: "192.168.1.100",
          port: 8080,
          protocol: "TCP",
        },
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_connection_type).toBe("NETWORK");
    });

    it("[P0-BR-POS-002] should accept valid API connection type", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `API Store ${Date.now()}`,
        pos_connection_type: "API",
        pos_connection_config: {
          base_url: "https://api.example.com",
          api_key: "secret-key",
        },
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_connection_type).toBe("API");
    });

    it("[P0-BR-POS-002] should accept valid WEBHOOK connection type", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `Webhook Store ${Date.now()}`,
        pos_connection_type: "WEBHOOK",
        pos_connection_config: {
          webhook_url: "https://example.com/webhook",
          secret: "webhook-secret",
        },
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_connection_type).toBe("WEBHOOK");
    });

    it("[P0-BR-POS-002] should accept valid FILE connection type", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `File Store ${Date.now()}`,
        pos_connection_type: "FILE",
        pos_connection_config: {
          import_path: "c:\\XMLGateway",
        },
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_connection_type).toBe("FILE");
    });

    it("[P0-BR-POS-002] should accept valid MANUAL connection type", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `Manual Store ${Date.now()}`,
        pos_connection_type: "MANUAL",
        pos_connection_config: null,
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_connection_type).toBe("MANUAL");
    });

    it("[P0-BR-POS-002] should reject invalid connection type", async () => {
      await expect(
        storeService.createStore({
          company_id: testCompany.company_id,
          name: `Invalid Connection Type Store ${Date.now()}`,
          pos_connection_type: "INVALID_TYPE" as any,
        }),
      ).rejects.toThrow(/Invalid pos_connection_type/);
    });
  });

  /**
   * BR-POS-003: pos_connection_config must be a valid JSON object
   */
  describe("pos_connection_config Structure Validation", () => {
    it("[P0-BR-POS-003] should accept valid JSON object config", async () => {
      const config = {
        import_path: "c:\\XMLGateway_new",
        poll_interval_seconds: 60,
      };
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `Valid Config Store ${Date.now()}`,
        pos_connection_config: config,
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_connection_config).toMatchObject(config);
    });

    it("[P0-BR-POS-003] should accept null config", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `Null Config Store ${Date.now()}`,
        pos_connection_config: null,
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_connection_config).toBeNull();
    });

    it("[P0-BR-POS-003] should reject array as config", async () => {
      await expect(
        storeService.createStore({
          company_id: testCompany.company_id,
          name: `Array Config Store ${Date.now()}`,
          pos_connection_config: ["invalid", "array"] as any,
        }),
      ).rejects.toThrow(/must be a JSON object/);
    });
  });

  /**
   * BR-POS-004: pos_connection_config is validated for XSS attacks
   * SEC-004: XSS protection
   */
  describe("pos_connection_config XSS Protection", () => {
    it("[P0-SEC-004] should reject config with script tag", async () => {
      await expect(
        storeService.createStore({
          company_id: testCompany.company_id,
          name: `XSS Script Store ${Date.now()}`,
          pos_connection_config: {
            import_path: "<script>alert('xss')</script>",
          },
        }),
      ).rejects.toThrow(/contains invalid content/);
    });

    it("[P0-SEC-004] should reject config with javascript: URL", async () => {
      await expect(
        storeService.createStore({
          company_id: testCompany.company_id,
          name: `XSS JS URL Store ${Date.now()}`,
          pos_connection_config: {
            webhook_url: "javascript:alert('xss')",
          },
        }),
      ).rejects.toThrow(/contains invalid content/);
    });

    it("[P0-SEC-004] should reject config with onerror handler", async () => {
      await expect(
        storeService.createStore({
          company_id: testCompany.company_id,
          name: `XSS Onerror Store ${Date.now()}`,
          pos_connection_config: {
            description: 'path" onerror="alert(1)"',
          },
        }),
      ).rejects.toThrow(/contains invalid content/);
    });

    it("[P0-SEC-004] should reject config with iframe tag", async () => {
      await expect(
        storeService.createStore({
          company_id: testCompany.company_id,
          name: `XSS Iframe Store ${Date.now()}`,
          pos_connection_config: {
            import_path: "<iframe src='evil.com'></iframe>",
          },
        }),
      ).rejects.toThrow(/contains invalid content/);
    });

    it("[P1-SEC-004] should accept config with safe special characters", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `Safe Special Chars Store ${Date.now()}`,
        pos_connection_config: {
          import_path: "c:\\XMLGateway\\<data>",
          description: "Path with < and > characters",
        },
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_connection_config).toBeDefined();
    });
  });

  /**
   * BR-POS-005: pos_connection_config has size limit (10KB max)
   */
  describe("pos_connection_config Size Limit", () => {
    it("[P1-BR-POS-005] should reject config exceeding 10KB", async () => {
      const largeValue = "a".repeat(11000);
      await expect(
        storeService.createStore({
          company_id: testCompany.company_id,
          name: `Large Config Store ${Date.now()}`,
          pos_connection_config: {
            data: largeValue,
          },
        }),
      ).rejects.toThrow(/exceeds maximum size/);
    });

    it("[P1-BR-POS-005] should accept config under 10KB", async () => {
      const reasonableValue = "a".repeat(5000);
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `Reasonable Config Store ${Date.now()}`,
        pos_connection_config: {
          data: reasonableValue,
        },
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_connection_config).toBeDefined();
    });
  });

  /**
   * BR-POS-006: Default values are MANUAL_ENTRY and MANUAL when not provided
   */
  describe("Default Values", () => {
    it("[P0-BR-POS-006] should default pos_type to MANUAL_ENTRY", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `Default POS Type Store ${Date.now()}`,
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_type).toBe("MANUAL_ENTRY");
    });

    it("[P0-BR-POS-006] should default pos_connection_type to MANUAL", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `Default Connection Type Store ${Date.now()}`,
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_connection_type).toBe("MANUAL");
    });

    it("[P0-BR-POS-006] should default pos_connection_config to null", async () => {
      const store = await storeService.createStore({
        company_id: testCompany.company_id,
        name: `Default Config Store ${Date.now()}`,
      });
      createdStoreIds.push(store.store_id);

      expect(store.pos_connection_config).toBeNull();
    });
  });
});

describe("Store POS Configuration - Updates", () => {
  let testStore: any;

  beforeAll(async () => {
    testStore = await storeService.createStore({
      company_id: testCompany.company_id,
      name: `Update Test Store ${Date.now()}`,
      pos_type: "MANUAL_ENTRY",
      pos_connection_type: "MANUAL",
    });
    createdStoreIds.push(testStore.store_id);
  });

  it("[P0] should update pos_type from MANUAL_ENTRY to GILBARCO_NAXML", async () => {
    const updated = await storeService.updateStore(
      testStore.store_id,
      testCompany.company_id,
      {
        pos_type: "GILBARCO_NAXML",
        pos_connection_type: "FILE",
        pos_connection_config: {
          import_path: "c:\\XMLGateway_updated",
        },
      },
    );

    expect(updated.pos_type).toBe("GILBARCO_NAXML");
    expect(updated.pos_connection_type).toBe("FILE");
    expect(updated.pos_connection_config).toMatchObject({
      import_path: "c:\\XMLGateway_updated",
    });
  });

  it("[P0] should reject update with invalid pos_type", async () => {
    await expect(
      storeService.updateStore(testStore.store_id, testCompany.company_id, {
        pos_type: "INVALID_TYPE" as any,
      }),
    ).rejects.toThrow(/Invalid pos_type/);
  });

  it("[P0] should reject update with invalid pos_connection_type", async () => {
    await expect(
      storeService.updateStore(testStore.store_id, testCompany.company_id, {
        pos_connection_type: "INVALID" as any,
      }),
    ).rejects.toThrow(/Invalid pos_connection_type/);
  });

  it("[P0-SEC-004] should reject update with XSS in config", async () => {
    await expect(
      storeService.updateStore(testStore.store_id, testCompany.company_id, {
        pos_connection_config: {
          import_path: "<script>evil()</script>",
        },
      }),
    ).rejects.toThrow(/contains invalid content/);
  });

  it("[P1] should clear pos_connection_config with null", async () => {
    const updated = await storeService.updateStore(
      testStore.store_id,
      testCompany.company_id,
      {
        pos_connection_config: null,
      },
    );

    expect(updated.pos_connection_config).toBeNull();
  });
});

describe("Store POS Configuration - Snake_case Keys", () => {
  /**
   * Critical test: Ensure snake_case keys are preserved in config
   * This was the root cause of the desktop app bug
   */
  it("[P0] should preserve import_path in snake_case", async () => {
    const store = await storeService.createStore({
      company_id: testCompany.company_id,
      name: `Snake Case Store ${Date.now()}`,
      pos_type: "GILBARCO_NAXML",
      pos_connection_type: "FILE",
      pos_connection_config: {
        import_path: "c:\\XMLGateway",
      },
    });
    createdStoreIds.push(store.store_id);

    // Verify the key is import_path (snake_case), not importPath (camelCase)
    const config = store.pos_connection_config as Record<string, unknown>;
    expect(config).toHaveProperty("import_path");
    expect(config).not.toHaveProperty("importPath");
    expect(config.import_path).toBe("c:\\XMLGateway");
  });

  it("[P0] should preserve base_url and api_key in snake_case", async () => {
    const store = await storeService.createStore({
      company_id: testCompany.company_id,
      name: `API Snake Case Store ${Date.now()}`,
      pos_type: "SQUARE_REST",
      pos_connection_type: "API",
      pos_connection_config: {
        base_url: "https://connect.squareup.com",
        api_key: "EAAL...",
      },
    });
    createdStoreIds.push(store.store_id);

    const config = store.pos_connection_config as Record<string, unknown>;
    expect(config).toHaveProperty("base_url");
    expect(config).toHaveProperty("api_key");
    expect(config).not.toHaveProperty("baseUrl");
    expect(config).not.toHaveProperty("apiKey");
  });

  it("[P0] should preserve webhook_url in snake_case", async () => {
    const store = await storeService.createStore({
      company_id: testCompany.company_id,
      name: `Webhook Snake Case Store ${Date.now()}`,
      pos_type: "GENERIC_REST",
      pos_connection_type: "WEBHOOK",
      pos_connection_config: {
        webhook_url: "https://example.com/webhook",
        secret: "secret123",
      },
    });
    createdStoreIds.push(store.store_id);

    const config = store.pos_connection_config as Record<string, unknown>;
    expect(config).toHaveProperty("webhook_url");
    expect(config).not.toHaveProperty("webhookUrl");
  });
});
