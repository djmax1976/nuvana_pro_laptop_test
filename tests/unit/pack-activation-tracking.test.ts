/**
 * Unit Tests: Pack Activation Tracking - Schema Migration
 *
 * Tests schema migration validation for pack activation tracking fields:
 * - Migration adds activated_by column (UUID, nullable, FK to users)
 * - Migration adds activated_shift_id column (UUID, nullable, FK to shifts)
 * - Migration adds depleted_by column (UUID, nullable, FK to users)
 * - Migration adds depleted_shift_id column (UUID, nullable, FK to shifts)
 * - Indexes are created for new columns
 *
 * @test-level UNIT
 * @justification Tests schema structure and migration validation without database operations
 * @story 10.2 - Database Schema & Pack Activation Tracking
 * @priority P0 (Critical - Schema Changes, Data Integrity)
 *
 * RED PHASE: These tests will fail until migration is created and schema is updated.
 */

import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA MIGRATION VALIDATION TESTS (AC #1)
// ═══════════════════════════════════════════════════════════════════════════

describe("10.2-UNIT: Pack Activation Tracking - Schema Migration", () => {
  it("TEST-10.2-U1: [P0] Migration adds activated_by column with correct type (UUID, nullable)", async () => {
    // GIVEN: Schema has been migrated
    // WHEN: Querying LotteryPack model structure
    const modelFields = await prisma.$queryRaw<
      Array<{ column_name: string; data_type: string; is_nullable: string }>
    >`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'lottery_packs' AND column_name = 'activated_by'
    `;

    // THEN: activated_by column exists with UUID type and nullable
    expect(modelFields.length, "activated_by column should exist").toBe(1);
    expect(modelFields[0].data_type, "activated_by should be UUID type").toBe(
      "uuid",
    );
    expect(modelFields[0].is_nullable, "activated_by should be nullable").toBe(
      "YES",
    );
  });

  it("TEST-10.2-U2: [P0] Migration adds activated_shift_id column with foreign key to shifts table", async () => {
    // GIVEN: Schema has been migrated
    // WHEN: Querying LotteryPack model structure and foreign key constraints
    const columnInfo = await prisma.$queryRaw<
      Array<{ column_name: string; data_type: string; is_nullable: string }>
    >`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'lottery_packs' AND column_name = 'activated_shift_id'
    `;

    const foreignKeyInfo = await prisma.$queryRaw<
      Array<{ constraint_name: string; foreign_table_name: string }>
    >`
      SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'lottery_packs'
        AND kcu.column_name = 'activated_shift_id'
        AND tc.constraint_type = 'FOREIGN KEY'
    `;

    // THEN: activated_shift_id column exists with UUID type and foreign key to shifts
    expect(columnInfo.length, "activated_shift_id column should exist").toBe(1);
    expect(
      columnInfo[0].data_type,
      "activated_shift_id should be UUID type",
    ).toBe("uuid");
    expect(
      columnInfo[0].is_nullable,
      "activated_shift_id should be nullable",
    ).toBe("YES");
    expect(
      foreignKeyInfo.length,
      "Foreign key constraint should exist",
    ).toBeGreaterThan(0);
    expect(
      foreignKeyInfo[0].foreign_table_name,
      "Should reference shifts table",
    ).toBe("shifts");
  });

  it("TEST-10.2-U3: [P0] Migration adds depleted_by column with foreign key to users table", async () => {
    // GIVEN: Schema has been migrated
    // WHEN: Querying LotteryPack model structure and foreign key constraints
    const columnInfo = await prisma.$queryRaw<
      Array<{ column_name: string; data_type: string; is_nullable: string }>
    >`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'lottery_packs' AND column_name = 'depleted_by'
    `;

    const foreignKeyInfo = await prisma.$queryRaw<
      Array<{ constraint_name: string; foreign_table_name: string }>
    >`
      SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'lottery_packs'
        AND kcu.column_name = 'depleted_by'
        AND tc.constraint_type = 'FOREIGN KEY'
    `;

    // THEN: depleted_by column exists with UUID type and foreign key to users
    expect(columnInfo.length, "depleted_by column should exist").toBe(1);
    expect(columnInfo[0].data_type, "depleted_by should be UUID type").toBe(
      "uuid",
    );
    expect(columnInfo[0].is_nullable, "depleted_by should be nullable").toBe(
      "YES",
    );
    expect(
      foreignKeyInfo.length,
      "Foreign key constraint should exist",
    ).toBeGreaterThan(0);
    expect(
      foreignKeyInfo[0].foreign_table_name,
      "Should reference users table",
    ).toBe("users");
  });

  it("TEST-10.2-U4: [P0] Migration adds depleted_shift_id column with foreign key to shifts table", async () => {
    // GIVEN: Schema has been migrated
    // WHEN: Querying LotteryPack model structure and foreign key constraints
    const columnInfo = await prisma.$queryRaw<
      Array<{ column_name: string; data_type: string; is_nullable: string }>
    >`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'lottery_packs' AND column_name = 'depleted_shift_id'
    `;

    const foreignKeyInfo = await prisma.$queryRaw<
      Array<{ constraint_name: string; foreign_table_name: string }>
    >`
      SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'lottery_packs'
        AND kcu.column_name = 'depleted_shift_id'
        AND tc.constraint_type = 'FOREIGN KEY'
    `;

    // THEN: depleted_shift_id column exists with UUID type and foreign key to shifts
    expect(columnInfo.length, "depleted_shift_id column should exist").toBe(1);
    expect(
      columnInfo[0].data_type,
      "depleted_shift_id should be UUID type",
    ).toBe("uuid");
    expect(
      columnInfo[0].is_nullable,
      "depleted_shift_id should be nullable",
    ).toBe("YES");
    expect(
      foreignKeyInfo.length,
      "Foreign key constraint should exist",
    ).toBeGreaterThan(0);
    expect(
      foreignKeyInfo[0].foreign_table_name,
      "Should reference shifts table",
    ).toBe("shifts");
  });

  it("TEST-10.2-U5: [P0] Indexes are created for all new foreign key columns", async () => {
    // GIVEN: Schema has been migrated
    // WHEN: Querying indexes on lottery_packs table
    const indexes = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'lottery_packs'
        AND (
          indexdef LIKE '%activated_by%' OR
          indexdef LIKE '%activated_shift_id%' OR
          indexdef LIKE '%depleted_by%' OR
          indexdef LIKE '%depleted_shift_id%'
        )
    `;

    // THEN: Indexes exist for all four new columns
    const indexColumns = indexes.map((idx) => idx.indexdef).join(" ");
    expect(indexColumns, "Should have index on activated_by").toContain(
      "activated_by",
    );
    expect(indexColumns, "Should have index on activated_shift_id").toContain(
      "activated_shift_id",
    );
    expect(indexColumns, "Should have index on depleted_by").toContain(
      "depleted_by",
    );
    expect(indexColumns, "Should have index on depleted_shift_id").toContain(
      "depleted_shift_id",
    );
  });

  it("TEST-10.2-U6: [P1] Enhanced assertions - activated_by column accepts null values", async () => {
    // GIVEN: Schema has been migrated
    // WHEN: Verifying column nullability
    const columnInfo = await prisma.$queryRaw<
      Array<{ column_name: string; is_nullable: string }>
    >`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'lottery_packs' AND column_name = 'activated_by'
    `;

    // THEN: activated_by should be nullable
    expect(columnInfo.length, "activated_by column should exist").toBe(1);
    expect(
      columnInfo[0].is_nullable,
      "activated_by should be nullable (YES)",
    ).toBe("YES");
  });

  it("TEST-10.2-U7: [P1] Enhanced assertions - All new columns have correct data type (UUID)", async () => {
    // GIVEN: Schema has been migrated
    // WHEN: Querying all new columns
    const columns = await prisma.$queryRaw<
      Array<{ column_name: string; data_type: string }>
    >`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'lottery_packs'
        AND column_name IN ('activated_by', 'activated_shift_id', 'depleted_by', 'depleted_shift_id')
      ORDER BY column_name
    `;

    // THEN: All columns should be UUID type
    expect(columns.length, "Should have 4 new columns").toBe(4);
    columns.forEach((col) => {
      expect(col.data_type, `${col.column_name} should be UUID type`).toBe(
        "uuid",
      );
    });
  });

  it("TEST-10.2-U8: [P1] Enhanced assertions - Foreign key constraints have correct ON DELETE behavior", async () => {
    // GIVEN: Schema has been migrated
    // WHEN: Querying foreign key constraints
    const fkConstraints = await prisma.$queryRaw<
      Array<{ constraint_name: string; delete_rule: string }>
    >`
      SELECT
        tc.constraint_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.table_name = 'lottery_packs'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND (
          tc.constraint_name LIKE '%activated_by%' OR
          tc.constraint_name LIKE '%activated_shift_id%' OR
          tc.constraint_name LIKE '%depleted_by%' OR
          tc.constraint_name LIKE '%depleted_shift_id%'
        )
    `;

    // THEN: All foreign keys should have ON DELETE SET NULL (nullable columns)
    expect(
      fkConstraints.length,
      "Should have 4 foreign key constraints",
    ).toBeGreaterThanOrEqual(4);
    fkConstraints.forEach((fk) => {
      expect(
        fk.delete_rule,
        `${fk.constraint_name} should have ON DELETE SET NULL`,
      ).toBe("SET NULL");
    });
  });
});
