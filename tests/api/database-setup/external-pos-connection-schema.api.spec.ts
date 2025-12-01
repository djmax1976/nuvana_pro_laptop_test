import { test, expect } from "../../support/fixtures";
import { createStore, createCompany, createUser } from "../../support/helpers";
import { createTerminal } from "../../support/factories/terminal.factory";
import { Prisma } from "@prisma/client";

/**
 * External POS Connection Schema Migration Tests
 *
 * Story: 4-81-external-pos-connection-schema
 * Tests migration for new enums and fields added to POSTerminal and Shift models
 * @enhanced-by workflow-9 on 2025-01-27
 *
 * ACCEPTANCE CRITERIA TESTED:
 * - AC #1: connection_type enum, connection_config, vendor_type, terminal_status, last_sync_at, sync_status
 * - AC #2: external_shift_id, external_data, synced_at fields in Shift model
 */

test.describe("4.81-API: External POS Connection Schema Migration", () => {
  test("4.81-API-035: Migration applies successfully with new enums and fields", async ({
    prismaClient,
  }) => {
    // GIVEN: Migration has been applied
    // WHEN: Querying POSTerminal model
    // THEN: New enum types should be available
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: (
          await createStore(prismaClient, {
            company_id: (
              await createCompany(prismaClient, {
                owner_user_id: (await createUser(prismaClient)).user_id,
              })
            ).company_id,
          })
        ).store_id,
        name: "Test Terminal",
        connection_type: "MANUAL",
        vendor_type: "GENERIC",
        terminal_status: "ACTIVE",
        sync_status: "NEVER",
      },
    });

    expect(terminal.connection_type).toBe("MANUAL");
    expect(terminal.vendor_type).toBe("GENERIC");
    expect(terminal.terminal_status).toBe("ACTIVE");
    expect(terminal.sync_status).toBe("NEVER");
  });

  test("4.81-API-036: Existing terminals get default values", async ({
    prismaClient,
  }) => {
    // GIVEN: A terminal exists before migration
    // WHEN: Querying the terminal after migration
    // THEN: Default values should be applied (connection_type=MANUAL, vendor_type=GENERIC, terminal_status=ACTIVE, sync_status=NEVER)
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // Create terminal (simulating pre-migration terminal)
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: store.store_id,
        name: "Pre-migration Terminal",
        // Not specifying new fields - should use defaults
      },
    });

    // Verify defaults are applied
    expect(terminal.connection_type).toBe("MANUAL");
    expect(terminal.vendor_type).toBe("GENERIC");
    expect(terminal.terminal_status).toBe("ACTIVE");
    expect(terminal.sync_status).toBe("NEVER");
  });

  test("4.81-API-037: New fields are nullable/optional as expected", async ({
    prismaClient,
  }) => {
    // GIVEN: Creating a terminal
    // WHEN: Not providing optional fields
    // THEN: Fields should be nullable/optional
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: store.store_id,
        name: "Optional Fields Terminal",
        connection_config: Prisma.JsonNull,
        last_sync_at: null,
      },
    });

    expect(terminal.connection_config).toBeNull();
    expect(terminal.last_sync_at).toBeNull();
  });

  test("4.81-API-038: Enum values are correct", async ({ prismaClient }) => {
    // GIVEN: Creating terminals with different enum values
    // WHEN: Setting enum fields
    // THEN: All enum values should be accepted
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // Test POSConnectionType enum
    const networkTerminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: store.store_id,
        name: "Network Terminal",
        connection_type: "NETWORK",
        vendor_type: "SQUARE",
        terminal_status: "PENDING",
        sync_status: "IN_PROGRESS",
      },
    });

    expect(networkTerminal.connection_type).toBe("NETWORK");
    expect(networkTerminal.vendor_type).toBe("SQUARE");
    expect(networkTerminal.terminal_status).toBe("PENDING");
    expect(networkTerminal.sync_status).toBe("IN_PROGRESS");
  });

  test("4.81-API-039: Shift model has new external reference fields", async ({
    prismaClient,
  }) => {
    // GIVEN: A shift exists
    // WHEN: Setting external reference fields
    // THEN: Fields should be stored correctly
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: owner.user_id,
        opening_cash: 100,
        external_shift_id: "EXT-12345",
        external_data: { source: "external_pos", raw: "data" },
        synced_at: new Date(),
      },
    });

    expect(shift.external_shift_id).toBe("EXT-12345");
    expect(shift.external_data).toEqual({
      source: "external_pos",
      raw: "data",
    });
    expect(shift.synced_at).toBeDefined();
  });

  test("4.81-API-040: Shift external fields are nullable", async ({
    prismaClient,
  }) => {
    // GIVEN: Creating a shift
    // WHEN: Not providing external fields
    // THEN: Fields should be nullable
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: owner.user_id,
        opening_cash: 100,
        external_shift_id: null,
        external_data: Prisma.JsonNull,
        synced_at: null,
      },
    });

    expect(shift.external_shift_id).toBeNull();
    expect(shift.external_data).toBeNull();
    expect(shift.synced_at).toBeNull();
  });

  // ============================================================================
  // 🔒 SECURITY TESTS (Mandatory - Applied Automatically)
  // ============================================================================

  /**
   * SQL Injection Prevention Tests
   * WHY: Database queries use user input - must prevent SQL injection
   * RISK: Database compromise
   */
  test("4.81-API-041: SQL injection in external_shift_id is sanitized", async ({
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating shift with SQL injection in external_shift_id
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: owner.user_id,
        opening_cash: 100,
        external_shift_id: "'; DROP TABLE shifts; --",
      },
    });

    // THEN: Shift is created safely (Prisma sanitizes input)
    expect(shift.external_shift_id).toBe("'; DROP TABLE shifts; --");

    // AND: Database still intact
    const shifts = await prismaClient.shift.findMany({
      where: { store_id: store.store_id },
    });
    expect(shifts.length).toBeGreaterThan(0);
  });

  /**
   * JSON Injection Prevention Tests
   * WHY: JSON fields (connection_config, external_data) accept user input
   * RISK: JSON injection, data corruption
   */
  test("4.81-API-042: Malicious JSON in connection_config is stored safely", async ({
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with potentially malicious JSON
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: store.store_id,
        name: "JSON Test Terminal",
        connection_type: "API",
        connection_config: {
          baseUrl: "https://api.example.com",
          apiKey: "test-key",
          malicious: "<script>alert('XSS')</script>",
        },
      },
    });

    // THEN: Terminal is created and JSON is stored safely
    expect(terminal.connection_config).toBeDefined();
    expect((terminal.connection_config as any).malicious).toBe(
      "<script>alert('XSS')</script>",
    );
    // NOTE: Frontend should sanitize when rendering
  });

  test("4.81-API-043: Malicious JSON in external_data is stored safely", async ({
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating shift with potentially malicious JSON
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: owner.user_id,
        opening_cash: 100,
        external_data: {
          source: "external_pos",
          malicious: "<script>alert('XSS')</script>",
          sqlInjection: "'; DROP TABLE shifts; --",
        },
      },
    });

    // THEN: Shift is created and JSON is stored safely
    expect(shift.external_data).toBeDefined();
    expect((shift.external_data as any).malicious).toBe(
      "<script>alert('XSS')</script>",
    );
    expect((shift.external_data as any).sqlInjection).toBe(
      "'; DROP TABLE shifts; --",
    );
  });

  // ============================================================================
  // 🔄 ADDITIONAL EDGE CASES (Standard Boundaries)
  // ============================================================================

  test("4.81-API-044: All connection_type enum values are valid", async ({
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminals with all connection_type enum values
    const connectionTypes = [
      "MANUAL",
      "NETWORK",
      "API",
      "WEBHOOK",
      "FILE",
    ] as const;

    for (const connectionType of connectionTypes) {
      const terminal = await prismaClient.pOSTerminal.create({
        data: {
          store_id: store.store_id,
          name: `${connectionType} Terminal`,
          connection_type: connectionType,
        },
      });

      // THEN: Terminal is created with correct enum value
      expect(terminal.connection_type).toBe(connectionType);
    }
  });

  test("4.81-API-045: All vendor_type enum values are valid", async ({
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminals with all vendor_type enum values
    const vendorTypes = [
      "GENERIC",
      "SQUARE",
      "CLOVER",
      "TOAST",
      "LIGHTSPEED",
      "CUSTOM",
    ] as const;

    for (const vendorType of vendorTypes) {
      const terminal = await prismaClient.pOSTerminal.create({
        data: {
          store_id: store.store_id,
          name: `${vendorType} Terminal`,
          vendor_type: vendorType,
        },
      });

      // THEN: Terminal is created with correct enum value
      expect(terminal.vendor_type).toBe(vendorType);
    }
  });

  test("4.81-API-046: All terminal_status enum values are valid", async ({
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminals with all terminal_status enum values
    const statuses = ["ACTIVE", "INACTIVE", "PENDING", "ERROR"] as const;

    for (const status of statuses) {
      const terminal = await prismaClient.pOSTerminal.create({
        data: {
          store_id: store.store_id,
          name: `${status} Terminal`,
          terminal_status: status,
        },
      });

      // THEN: Terminal is created with correct enum value
      expect(terminal.terminal_status).toBe(status);
    }
  });

  test("4.81-API-047: All sync_status enum values are valid", async ({
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminals with all sync_status enum values
    const syncStatuses = ["NEVER", "SUCCESS", "FAILED", "IN_PROGRESS"] as const;

    for (const syncStatus of syncStatuses) {
      const terminal = await prismaClient.pOSTerminal.create({
        data: {
          store_id: store.store_id,
          name: `${syncStatus} Sync Terminal`,
          sync_status: syncStatus,
        },
      });

      // THEN: Terminal is created with correct enum value
      expect(terminal.sync_status).toBe(syncStatus);
    }
  });

  test("4.81-API-048: Connection config with large JSON object is handled", async ({
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with large connection_config
    const largeConfig = {
      baseUrl: "https://api.example.com",
      apiKey: "test-key",
      metadata: Array.from({ length: 100 }, (_, i) => ({
        key: `key-${i}`,
        value: `value-${i}`.repeat(10),
      })),
    };

    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: store.store_id,
        name: "Large Config Terminal",
        connection_type: "API",
        connection_config: largeConfig,
      },
    });

    // THEN: Terminal is created with large config
    expect(terminal.connection_config).toBeDefined();
    expect((terminal.connection_config as any).metadata.length).toBe(100);
  });

  test("4.81-API-049: External data with complex nested JSON is handled", async ({
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating shift with complex nested external_data
    const complexData = {
      source: "external_pos",
      transactions: [
        { id: 1, amount: 10.5, items: [{ name: "Item 1", price: 10.5 }] },
        { id: 2, amount: 20.75, items: [{ name: "Item 2", price: 20.75 }] },
      ],
      metadata: {
        nested: {
          deeply: {
            nested: {
              value: "test",
            },
          },
        },
      },
    };

    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: owner.user_id,
        opening_cash: 100,
        external_data: complexData,
      },
    });

    // THEN: Shift is created with complex nested data
    expect(shift.external_data).toBeDefined();
    expect((shift.external_data as any).transactions.length).toBe(2);
    expect(
      (shift.external_data as any).metadata.nested.deeply.nested.value,
    ).toBe("test");
  });

  test("4.81-API-050: Last_sync_at DateTime field accepts valid dates", async ({
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with last_sync_at
    const syncDate = new Date("2025-01-27T12:00:00Z");
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: store.store_id,
        name: "Sync Date Terminal",
        last_sync_at: syncDate,
      },
    });

    // THEN: Terminal is created with correct sync date
    expect(terminal.last_sync_at).toBeDefined();
    expect(terminal.last_sync_at).toBeInstanceOf(Date);
    expect(terminal.last_sync_at?.getTime()).toBe(syncDate.getTime());
  });

  test("4.81-API-051: Synced_at DateTime field accepts valid dates", async ({
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating shift with synced_at
    const syncDate = new Date("2025-01-27T12:00:00Z");
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: owner.user_id,
        opening_cash: 100,
        synced_at: syncDate,
      },
    });

    // THEN: Shift is created with correct sync date
    expect(shift.synced_at).toBeDefined();
    expect(shift.synced_at).toBeInstanceOf(Date);
    expect(shift.synced_at?.getTime()).toBe(syncDate.getTime());
  });
});
