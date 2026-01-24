# Soft Delete & Cascade Delete Implementation Plan

**Document Version:** 1.0
**Created:** 2026-01-22
**Status:** PLANNED
**Priority:** HIGH - Critical Bug Fix
**Estimated Effort:** 3-5 days

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Analysis](#2-problem-analysis)
3. [Current State Assessment](#3-current-state-assessment)
4. [Proposed Solution Architecture](#4-proposed-solution-architecture)
5. [Implementation Plan](#5-implementation-plan)
6. [Database Schema Changes](#6-database-schema-changes)
7. [Service Layer Changes](#7-service-layer-changes)
8. [API Changes](#8-api-changes)
9. [Testing Strategy](#9-testing-strategy)
10. [Migration Strategy](#10-migration-strategy)
11. [Rollback Plan](#11-rollback-plan)
12. [Security Considerations](#12-security-considerations)
13. [Performance Considerations](#13-performance-considerations)
14. [Appendix](#14-appendix)

---

## 1. Executive Summary

### 1.1 Problem Statement

The application experienced a **500 Internal Server Error** on the API Keys management page caused by orphaned database records. When a CLIENT_OWNER user was deleted, the cascade deletion did not properly clean up associated API keys, leaving orphaned records that reference non-existent companies and stores.

### 1.2 Root Causes Identified

| Issue | Severity | Description |
|-------|----------|-------------|
| **BUG-001** | CRITICAL | Prisma `deleteMany()` does not trigger `onDelete: Cascade` referential actions |
| **BUG-002** | HIGH | No explicit API key cleanup in user/company deletion flows |
| **BUG-003** | MEDIUM | No soft delete implementation for User, Company, Store, ApiKey models |
| **BUG-004** | MEDIUM | Inconsistent delete patterns across services |

### 1.3 Business Impact

- **User Experience:** Super Admin cannot access API Keys page
- **Data Integrity:** Orphaned records pollute the database
- **Audit Trail:** Hard deletes lose historical context
- **Compliance:** Cannot track who deleted what and when
- **Recovery:** No ability to restore accidentally deleted data

### 1.4 Solution Overview

Implement a two-phase solution:

1. **Phase 1 (Immediate):** Fix cascade delete logic to prevent orphaned records
2. **Phase 2 (Enterprise):** Implement soft delete across all core models

---

## 2. Problem Analysis

### 2.1 Incident Timeline

```
1. Super Admin deletes a CLIENT_OWNER user
2. deleteUser() calls tx.store.deleteMany() and tx.company.deleteMany()
3. Prisma deleteMany() does NOT trigger onDelete: Cascade
4. API Keys remain in database with references to deleted store/company
5. API Keys list query fails: "Field company is required, got null"
6. 500 Internal Server Error returned to frontend
```

### 2.2 Affected Code Paths

#### 2.2.1 User Deletion Flow
```
deleteUser() [user-admin.service.ts:2029-2217]
├── tx.userRole.deleteMany() ✓
├── tx.store.deleteMany()    ✗ NO CASCADE
├── tx.company.deleteMany()  ✗ NO CASCADE
└── tx.user.delete()         ✓

MISSING:
├── tx.apiKeySyncSession.deleteMany()
├── tx.apiKeyAuditEvent.deleteMany()
└── tx.apiKey.deleteMany()
```

#### 2.2.2 Company Deletion Flow
```
deleteCompany() [company.service.ts:606-724]
├── tx.userRole.deleteMany() ✓
├── tx.store.deleteMany()    ✗ NO CASCADE
└── tx.company.delete()      ✓

MISSING:
├── tx.apiKeySyncSession.deleteMany()
├── tx.apiKeyAuditEvent.deleteMany()
└── tx.apiKey.deleteMany()
```

#### 2.2.3 Store Deletion Flow
```
deleteStore() [store.service.ts:1510-1560]
├── tx.userRole.deleteMany() ✓
└── tx.store.delete()        ✓ CASCADE WORKS

Note: Uses delete() not deleteMany(), so cascade works correctly
```

### 2.3 Prisma Cascade Limitation

From Prisma documentation:
> "Cascading deletes are only triggered by `delete()`, not `deleteMany()`. When using `deleteMany()`, you need to handle related records manually."

**Source:** https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries#cascading-deletes

### 2.4 Data Integrity Check Query

```sql
-- Find orphaned API keys
SELECT
  ak.api_key_id,
  ak.key_prefix,
  ak.store_id,
  ak.company_id,
  CASE WHEN s.store_id IS NULL THEN 'ORPHANED' ELSE 'OK' END as store_status,
  CASE WHEN c.company_id IS NULL THEN 'ORPHANED' ELSE 'OK' END as company_status
FROM api_keys ak
LEFT JOIN stores s ON ak.store_id = s.store_id
LEFT JOIN companies c ON ak.company_id = c.company_id
WHERE s.store_id IS NULL OR c.company_id IS NULL;
```

---

## 3. Current State Assessment

### 3.1 Model Soft Delete Support

| Model | Has `deleted_at` | Has `deleted_by` | Delete Type | Notes |
|-------|------------------|------------------|-------------|-------|
| User | ❌ | ❌ | Hard Delete | Core model, needs soft delete |
| Company | ❌ | ❌ | Hard Delete | Core model, needs soft delete |
| Store | ❌ | ❌ | Hard Delete | Core model, needs soft delete |
| ApiKey | ❌ | ❌ | Hard Delete | Has `revoked_at`, could use for soft delete |
| Role | ✅ | ✅ | Soft Delete | Already implemented correctly |
| POSTerminal | ✅ | ❌ | Soft Delete | Partially implemented |
| Cashier | ❌ | ❌ | Hard Delete | Uses status field |

### 3.2 Current Delete Services

| Service | Method | Uses Transaction | Handles Cascade | Handles API Keys |
|---------|--------|------------------|-----------------|------------------|
| user-admin.service.ts | deleteUser() | ✅ | ❌ Partial | ❌ |
| company.service.ts | deleteCompany() | ✅ | ❌ Partial | ❌ |
| store.service.ts | deleteStore() | ✅ | ✅ | ✅ (via cascade) |

### 3.3 Foreign Key Relationships (API Keys)

```prisma
model ApiKey {
  // Parent Relations (CASCADE expected)
  store    Store   @relation(fields: [store_id], onDelete: Cascade)
  company  Company @relation(fields: [company_id], onDelete: Cascade)
  creator  User    @relation(fields: [created_by], onDelete: Restrict)

  // Child Relations (CASCADE to children)
  audit_events   ApiKeyAuditEvent[]  // onDelete: Cascade
  sync_sessions  ApiKeySyncSession[] // onDelete: Cascade
}
```

---

## 4. Proposed Solution Architecture

### 4.1 Phase 1: Immediate Fix (Cascade Delete)

**Objective:** Prevent orphaned records by explicitly deleting API keys in all deletion flows.

**Approach:** Add explicit API key cleanup before store/company deletion.

**Changes Required:**
1. Modify `deleteUser()` to delete API keys before stores/companies
2. Modify `deleteCompany()` to delete API keys before stores
3. Add utility function for API key cascade deletion

### 4.2 Phase 2: Enterprise Soft Delete

**Objective:** Implement soft delete across all core models for enterprise-grade data management.

**Approach:**
1. Add `deleted_at` and `deleted_by` columns to User, Company, Store
2. Replace hard deletes with soft deletes
3. Add global query filters to exclude soft-deleted records
4. Implement cascade soft delete logic
5. Add restore functionality

### 4.3 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     DELETION FLOW (Phase 2)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  deleteUser(userId)                                              │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────┐                        │
│  │ 1. Validate user can be deleted     │                        │
│  │    - Check status = INACTIVE        │                        │
│  │    - Check no active companies      │                        │
│  │    - Check no active stores         │                        │
│  └─────────────────────────────────────┘                        │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────┐                        │
│  │ 2. Soft delete owned companies      │                        │
│  │    └── cascadeSoftDelete(company)   │                        │
│  │         ├── Soft delete stores      │                        │
│  │         │    └── Soft delete API keys│                       │
│  │         └── Soft delete user roles  │                        │
│  └─────────────────────────────────────┘                        │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────┐                        │
│  │ 3. Soft delete user roles           │                        │
│  └─────────────────────────────────────┘                        │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────┐                        │
│  │ 4. Soft delete user                 │                        │
│  │    - Set deleted_at = NOW()         │                        │
│  │    - Set deleted_by = actor_id      │                        │
│  └─────────────────────────────────────┘                        │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────┐                        │
│  │ 5. Create audit log entry           │                        │
│  └─────────────────────────────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Implementation Plan

### 5.1 Phase 1: Immediate Fix (1-2 days)

#### Task 1.1: Create API Key Cascade Utility
**File:** `backend/src/utils/cascade-delete.utils.ts`

```typescript
/**
 * Cascade delete API keys and related data for given store IDs
 */
export async function cascadeDeleteApiKeys(
  tx: Prisma.TransactionClient,
  storeIds: string[]
): Promise<{ apiKeysDeleted: number; auditEventsDeleted: number; syncSessionsDeleted: number }> {
  // Get API key IDs first
  const apiKeys = await tx.apiKey.findMany({
    where: { store_id: { in: storeIds } },
    select: { api_key_id: true }
  });
  const apiKeyIds = apiKeys.map(k => k.api_key_id);

  if (apiKeyIds.length === 0) {
    return { apiKeysDeleted: 0, auditEventsDeleted: 0, syncSessionsDeleted: 0 };
  }

  // Delete in correct order (children first)
  const syncSessionsDeleted = await tx.apiKeySyncSession.deleteMany({
    where: { api_key_id: { in: apiKeyIds } }
  });

  const auditEventsDeleted = await tx.apiKeyAuditEvent.deleteMany({
    where: { api_key_id: { in: apiKeyIds } }
  });

  const apiKeysDeleted = await tx.apiKey.deleteMany({
    where: { api_key_id: { in: apiKeyIds } }
  });

  return {
    apiKeysDeleted: apiKeysDeleted.count,
    auditEventsDeleted: auditEventsDeleted.count,
    syncSessionsDeleted: syncSessionsDeleted.count
  };
}
```

#### Task 1.2: Update deleteUser()
**File:** `backend/src/services/user-admin.service.ts`

Add API key deletion before store deletion in the transaction block (around line 2140):

```typescript
// NEW: Delete API keys for all stores being deleted
if (storeIds.length > 0) {
  const cascadeResult = await cascadeDeleteApiKeys(tx, storeIds);
  console.log(`[deleteUser] Cascade deleted: ${cascadeResult.apiKeysDeleted} API keys`);
}
```

#### Task 1.3: Update deleteCompany()
**File:** `backend/src/services/company.service.ts`

Add API key deletion before store deletion in the transaction block (around line 660):

```typescript
// NEW: Delete API keys for all stores being deleted
if (storeIds.length > 0) {
  const cascadeResult = await cascadeDeleteApiKeys(tx, storeIds);
  console.log(`[deleteCompany] Cascade deleted: ${cascadeResult.apiKeysDeleted} API keys`);
}
```

#### Task 1.4: Add Data Integrity Check
**File:** `backend/src/utils/data-integrity.utils.ts`

```typescript
/**
 * Check for orphaned API keys and optionally clean them up
 */
export async function checkOrphanedApiKeys(
  cleanup: boolean = false
): Promise<{ orphanedCount: number; cleanedUp: boolean }> {
  const orphaned = await prisma.$queryRaw<Array<{ api_key_id: string }>>`
    SELECT ak.api_key_id
    FROM api_keys ak
    LEFT JOIN stores s ON ak.store_id = s.store_id
    LEFT JOIN companies c ON ak.company_id = c.company_id
    WHERE s.store_id IS NULL OR c.company_id IS NULL
  `;

  if (cleanup && orphaned.length > 0) {
    const ids = orphaned.map(o => o.api_key_id);
    await prisma.apiKeySyncSession.deleteMany({ where: { api_key_id: { in: ids } } });
    await prisma.apiKeyAuditEvent.deleteMany({ where: { api_key_id: { in: ids } } });
    await prisma.apiKey.deleteMany({ where: { api_key_id: { in: ids } } });
    return { orphanedCount: orphaned.length, cleanedUp: true };
  }

  return { orphanedCount: orphaned.length, cleanedUp: false };
}
```

### 5.2 Phase 2: Soft Delete Implementation (2-3 days)

#### Task 2.1: Database Migration
**File:** `backend/prisma/migrations/YYYYMMDD_add_soft_delete_fields/migration.sql`

```sql
-- Add soft delete fields to users table
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN "deleted_by" UUID;
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("user_id") ON DELETE SET NULL;

-- Add soft delete fields to companies table
ALTER TABLE "companies" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "companies" ADD COLUMN "deleted_by" UUID;
CREATE INDEX "companies_deleted_at_idx" ON "companies"("deleted_at");
ALTER TABLE "companies" ADD CONSTRAINT "companies_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("user_id") ON DELETE SET NULL;

-- Add soft delete fields to stores table
ALTER TABLE "stores" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "stores" ADD COLUMN "deleted_by" UUID;
CREATE INDEX "stores_deleted_at_idx" ON "stores"("deleted_at");
ALTER TABLE "stores" ADD CONSTRAINT "stores_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("user_id") ON DELETE SET NULL;

-- Add soft delete fields to api_keys table (use existing revoked fields or add new)
ALTER TABLE "api_keys" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "api_keys" ADD COLUMN "deleted_by" UUID;
CREATE INDEX "api_keys_deleted_at_idx" ON "api_keys"("deleted_at");
```

#### Task 2.2: Update Prisma Schema
**File:** `backend/prisma/schema.prisma`

```prisma
model User {
  // ... existing fields

  // Soft Delete Fields
  deleted_at DateTime? @db.Timestamptz(6)
  deleted_by String?   @db.Uuid
  deleter    User?     @relation("UserDeleter", fields: [deleted_by], references: [user_id], onDelete: SetNull)

  @@index([deleted_at])
}

model Company {
  // ... existing fields

  // Soft Delete Fields
  deleted_at DateTime? @db.Timestamptz(6)
  deleted_by String?   @db.Uuid
  deleter    User?     @relation("CompanyDeleter", fields: [deleted_by], references: [user_id], onDelete: SetNull)

  @@index([deleted_at])
}

model Store {
  // ... existing fields

  // Soft Delete Fields
  deleted_at DateTime? @db.Timestamptz(6)
  deleted_by String?   @db.Uuid
  deleter    User?     @relation("StoreDeleter", fields: [deleted_by], references: [user_id], onDelete: SetNull)

  @@index([deleted_at])
}
```

#### Task 2.3: Create Soft Delete Service
**File:** `backend/src/services/soft-delete.service.ts`

```typescript
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/db";

export interface SoftDeleteResult {
  success: boolean;
  deletedAt: Date;
  cascadeResults: {
    companies?: number;
    stores?: number;
    apiKeys?: number;
    userRoles?: number;
  };
}

export class SoftDeleteService {
  /**
   * Soft delete a user and cascade to owned companies, stores, API keys
   */
  async softDeleteUser(
    userId: string,
    deletedBy: string
  ): Promise<SoftDeleteResult> {
    const deletedAt = new Date();

    return await prisma.$transaction(async (tx) => {
      // Get user with owned companies and stores
      const user = await tx.user.findUnique({
        where: { user_id: userId },
        include: {
          owned_companies: {
            include: { stores: true }
          }
        }
      });

      if (!user) throw new Error(`User ${userId} not found`);
      if (user.deleted_at) throw new Error(`User ${userId} already deleted`);

      let companiesDeleted = 0;
      let storesDeleted = 0;
      let apiKeysDeleted = 0;
      let userRolesDeleted = 0;

      // Cascade soft delete to owned companies
      for (const company of user.owned_companies) {
        const companyResult = await this.softDeleteCompanyInternal(
          tx, company.company_id, deletedBy, deletedAt
        );
        companiesDeleted++;
        storesDeleted += companyResult.storesDeleted;
        apiKeysDeleted += companyResult.apiKeysDeleted;
        userRolesDeleted += companyResult.userRolesDeleted;
      }

      // Soft delete user roles
      const rolesResult = await tx.userRole.updateMany({
        where: { user_id: userId, deleted_at: null },
        data: { deleted_at: deletedAt }
      });
      userRolesDeleted += rolesResult.count;

      // Soft delete user
      await tx.user.update({
        where: { user_id: userId },
        data: { deleted_at: deletedAt, deleted_by: deletedBy }
      });

      return {
        success: true,
        deletedAt,
        cascadeResults: {
          companies: companiesDeleted,
          stores: storesDeleted,
          apiKeys: apiKeysDeleted,
          userRoles: userRolesDeleted
        }
      };
    });
  }

  /**
   * Internal method for soft deleting a company within a transaction
   */
  private async softDeleteCompanyInternal(
    tx: Prisma.TransactionClient,
    companyId: string,
    deletedBy: string,
    deletedAt: Date
  ): Promise<{ storesDeleted: number; apiKeysDeleted: number; userRolesDeleted: number }> {
    let storesDeleted = 0;
    let apiKeysDeleted = 0;
    let userRolesDeleted = 0;

    // Get all stores for this company
    const stores = await tx.store.findMany({
      where: { company_id: companyId, deleted_at: null },
      select: { store_id: true }
    });
    const storeIds = stores.map(s => s.store_id);

    // Soft delete API keys for stores
    if (storeIds.length > 0) {
      const apiKeysResult = await tx.apiKey.updateMany({
        where: { store_id: { in: storeIds }, deleted_at: null },
        data: { deleted_at: deletedAt, deleted_by: deletedBy }
      });
      apiKeysDeleted = apiKeysResult.count;

      // Soft delete user roles for stores
      const storeRolesResult = await tx.userRole.updateMany({
        where: { store_id: { in: storeIds }, deleted_at: null },
        data: { deleted_at: deletedAt }
      });
      userRolesDeleted += storeRolesResult.count;

      // Soft delete stores
      const storesResult = await tx.store.updateMany({
        where: { store_id: { in: storeIds } },
        data: { deleted_at: deletedAt, deleted_by: deletedBy }
      });
      storesDeleted = storesResult.count;
    }

    // Soft delete company user roles
    const companyRolesResult = await tx.userRole.updateMany({
      where: { company_id: companyId, deleted_at: null },
      data: { deleted_at: deletedAt }
    });
    userRolesDeleted += companyRolesResult.count;

    // Soft delete company
    await tx.company.update({
      where: { company_id: companyId },
      data: { deleted_at: deletedAt, deleted_by: deletedBy }
    });

    return { storesDeleted, apiKeysDeleted, userRolesDeleted };
  }

  /**
   * Restore a soft-deleted user and optionally cascade to companies/stores
   */
  async restoreUser(
    userId: string,
    cascadeRestore: boolean = true
  ): Promise<{ restored: boolean; cascadeResults?: object }> {
    // Implementation for restore functionality
    // ...
  }
}

export const softDeleteService = new SoftDeleteService();
```

#### Task 2.4: Update Query Filters
**File:** `backend/src/utils/query-filters.ts`

```typescript
/**
 * Standard where clause to exclude soft-deleted records
 */
export const notDeleted = { deleted_at: null };

/**
 * Include soft-deleted records (for admin views)
 */
export const includeDeleted = {};

/**
 * Only soft-deleted records (for trash/recovery views)
 */
export const onlyDeleted = { deleted_at: { not: null } };
```

---

## 6. Database Schema Changes

### 6.1 New Columns

| Table | Column | Type | Nullable | Default | Index | FK |
|-------|--------|------|----------|---------|-------|-----|
| users | deleted_at | TIMESTAMPTZ(6) | YES | NULL | YES | - |
| users | deleted_by | UUID | YES | NULL | NO | users.user_id |
| companies | deleted_at | TIMESTAMPTZ(6) | YES | NULL | YES | - |
| companies | deleted_by | UUID | YES | NULL | NO | users.user_id |
| stores | deleted_at | TIMESTAMPTZ(6) | YES | NULL | YES | - |
| stores | deleted_by | UUID | YES | NULL | NO | users.user_id |
| api_keys | deleted_at | TIMESTAMPTZ(6) | YES | NULL | YES | - |
| api_keys | deleted_by | UUID | YES | NULL | NO | users.user_id |
| user_roles | deleted_at | TIMESTAMPTZ(6) | YES | NULL | YES | - |

### 6.2 New Indexes

```sql
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
CREATE INDEX "companies_deleted_at_idx" ON "companies"("deleted_at");
CREATE INDEX "stores_deleted_at_idx" ON "stores"("deleted_at");
CREATE INDEX "api_keys_deleted_at_idx" ON "api_keys"("deleted_at");
CREATE INDEX "user_roles_deleted_at_idx" ON "user_roles"("deleted_at");

-- Composite indexes for common queries
CREATE INDEX "users_status_deleted_idx" ON "users"("status", "deleted_at");
CREATE INDEX "companies_status_deleted_idx" ON "companies"("status", "deleted_at");
CREATE INDEX "stores_status_deleted_idx" ON "stores"("status", "deleted_at");
CREATE INDEX "api_keys_status_deleted_idx" ON "api_keys"("status", "deleted_at");
```

---

## 7. Service Layer Changes

### 7.1 Files to Modify

| File | Changes Required |
|------|------------------|
| `user-admin.service.ts` | Add cascade delete, update deleteUser() |
| `company.service.ts` | Add cascade delete, update deleteCompany() |
| `store.service.ts` | Update deleteStore() to use soft delete |
| `api-key.service.ts` | Add soft delete support, update queries |

### 7.2 Query Updates Required

All `findMany`, `findFirst`, `count` queries must add `deleted_at: null` filter:

```typescript
// BEFORE
const users = await prisma.user.findMany({
  where: { status: 'ACTIVE' }
});

// AFTER
const users = await prisma.user.findMany({
  where: { status: 'ACTIVE', deleted_at: null }
});
```

### 7.3 Affected Queries Count (Estimated)

| Service | Estimated Queries to Update |
|---------|----------------------------|
| user-admin.service.ts | ~15 queries |
| company.service.ts | ~8 queries |
| store.service.ts | ~12 queries |
| api-key.service.ts | ~10 queries |
| Other services | ~20 queries |
| **Total** | **~65 queries** |

---

## 8. API Changes

### 8.1 New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/users/deleted` | List soft-deleted users |
| POST | `/api/v1/admin/users/:userId/restore` | Restore soft-deleted user |
| DELETE | `/api/v1/admin/users/:userId/permanent` | Permanently delete user |
| GET | `/api/v1/admin/companies/deleted` | List soft-deleted companies |
| POST | `/api/v1/admin/companies/:companyId/restore` | Restore soft-deleted company |
| GET | `/api/v1/admin/stores/deleted` | List soft-deleted stores |
| POST | `/api/v1/admin/stores/:storeId/restore` | Restore soft-deleted store |

### 8.2 Modified Endpoints

All list endpoints should support `includeDeleted` query parameter for admin views:

```
GET /api/v1/admin/users?includeDeleted=true
GET /api/v1/admin/companies?includeDeleted=true
GET /api/v1/admin/stores?includeDeleted=true
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

#### 9.1.1 Cascade Delete Utility Tests
**File:** `backend/tests/unit/utils/cascade-delete.utils.test.ts`

```typescript
describe('cascadeDeleteApiKeys', () => {
  it('should delete API keys for given store IDs', async () => {
    // Setup: Create store with API keys
    // Execute: Call cascadeDeleteApiKeys
    // Verify: API keys, audit events, sync sessions deleted
  });

  it('should handle empty store IDs array', async () => {
    // Verify: Returns zero counts, no errors
  });

  it('should delete audit events before API keys', async () => {
    // Verify: Correct deletion order (FK constraints)
  });

  it('should delete sync sessions before API keys', async () => {
    // Verify: Correct deletion order (FK constraints)
  });
});
```

#### 9.1.2 Soft Delete Service Tests
**File:** `backend/tests/unit/services/soft-delete.service.test.ts`

```typescript
describe('SoftDeleteService', () => {
  describe('softDeleteUser', () => {
    it('should soft delete user and set deleted_at', async () => {
      // Setup: Create active user
      // Execute: softDeleteUser
      // Verify: deleted_at is set, deleted_by is set
    });

    it('should cascade soft delete to owned companies', async () => {
      // Setup: Create user with companies
      // Execute: softDeleteUser
      // Verify: All companies have deleted_at set
    });

    it('should cascade soft delete to stores', async () => {
      // Setup: Create user with companies and stores
      // Execute: softDeleteUser
      // Verify: All stores have deleted_at set
    });

    it('should cascade soft delete to API keys', async () => {
      // Setup: Create user with stores and API keys
      // Execute: softDeleteUser
      // Verify: All API keys have deleted_at set
    });

    it('should fail if user already deleted', async () => {
      // Setup: Create and soft delete user
      // Execute: softDeleteUser again
      // Verify: Error thrown
    });

    it('should fail if user not found', async () => {
      // Execute: softDeleteUser with invalid ID
      // Verify: Error thrown
    });
  });

  describe('restoreUser', () => {
    it('should restore soft-deleted user', async () => {
      // Setup: Create and soft delete user
      // Execute: restoreUser
      // Verify: deleted_at is null
    });

    it('should cascade restore to companies if enabled', async () => {
      // Setup: Create and soft delete user with companies
      // Execute: restoreUser(cascadeRestore: true)
      // Verify: Companies restored
    });
  });
});
```

### 9.2 Integration Tests

#### 9.2.1 User Deletion Flow Tests
**File:** `tests/api/user-deletion-cascade.api.spec.ts`

```typescript
describe('User Deletion Cascade', () => {
  describe('Phase 1: Hard Delete with Cascade', () => {
    it('should delete user and cascade to API keys', async () => {
      // Setup:
      // 1. Create CLIENT_OWNER user
      // 2. Create company for user
      // 3. Create store for company
      // 4. Create API key for store

      // Execute:
      // 1. Set user status to INACTIVE
      // 2. Set company status to INACTIVE
      // 3. Set store status to INACTIVE
      // 4. Delete user

      // Verify:
      // 1. User deleted
      // 2. Company deleted
      // 3. Store deleted
      // 4. API key deleted (NO ORPHAN!)
      // 5. API key audit events deleted
      // 6. API key sync sessions deleted
    });

    it('should not leave orphaned API keys', async () => {
      // Execute deletion flow
      // Query for orphaned API keys
      // Verify: Zero orphaned records
    });
  });

  describe('Phase 2: Soft Delete with Cascade', () => {
    it('should soft delete user and cascade to all children', async () => {
      // Similar to above but verify deleted_at fields
    });

    it('should allow restore of soft-deleted user', async () => {
      // Delete user
      // Restore user
      // Verify all records restored
    });

    it('should exclude soft-deleted records from queries', async () => {
      // Soft delete user
      // Query users list
      // Verify: Deleted user not in list
    });

    it('should include soft-deleted records when requested', async () => {
      // Soft delete user
      // Query users list with includeDeleted=true
      // Verify: Deleted user in list
    });
  });
});
```

#### 9.2.2 Company Deletion Flow Tests
**File:** `tests/api/company-deletion-cascade.api.spec.ts`

```typescript
describe('Company Deletion Cascade', () => {
  it('should delete company and cascade to API keys', async () => {
    // Setup: Company with stores and API keys
    // Execute: Delete company
    // Verify: All API keys deleted
  });

  it('should prevent deletion of company with active stores', async () => {
    // Setup: Company with active store
    // Execute: Attempt delete
    // Verify: Error returned
  });
});
```

#### 9.2.3 API Keys Page Tests
**File:** `tests/api/api-keys-integrity.api.spec.ts`

```typescript
describe('API Keys Page Integrity', () => {
  it('should load API keys page after user deletion', async () => {
    // Setup: Create and delete user with API keys
    // Execute: GET /api/v1/admin/api-keys
    // Verify: 200 OK, no orphaned records error
  });

  it('should not show orphaned API keys', async () => {
    // Verify API keys list excludes orphaned records
  });

  it('should handle edge case of concurrent deletion', async () => {
    // Test race condition handling
  });
});
```

### 9.3 Data Integrity Tests

#### 9.3.1 Orphan Detection Tests
**File:** `tests/integration/data-integrity.test.ts`

```typescript
describe('Data Integrity', () => {
  it('should detect orphaned API keys', async () => {
    // Manually create orphaned record
    // Run integrity check
    // Verify: Orphan detected
  });

  it('should clean up orphaned API keys', async () => {
    // Create orphaned record
    // Run cleanup
    // Verify: Orphan removed
  });

  it('should have no orphans after standard deletion', async () => {
    // Run full deletion flow
    // Run integrity check
    // Verify: Zero orphans
  });
});
```

### 9.4 Test Data Setup

**File:** `tests/fixtures/soft-delete.fixtures.ts`

```typescript
export async function createUserWithFullHierarchy(): Promise<{
  user: User;
  company: Company;
  store: Store;
  apiKey: ApiKey;
}> {
  // Create complete hierarchy for testing
}

export async function cleanupTestData(userId: string): Promise<void> {
  // Clean up all test data
}
```

### 9.5 Test Execution Plan

| Phase | Test Type | Command | Expected Duration |
|-------|-----------|---------|-------------------|
| 1 | Unit Tests | `npm run test:unit -- cascade-delete` | ~30s |
| 2 | Unit Tests | `npm run test:unit -- soft-delete` | ~45s |
| 3 | Integration Tests | `npm run test:api -- deletion-cascade` | ~2m |
| 4 | Integration Tests | `npm run test:api -- api-keys-integrity` | ~1m |
| 5 | Full Suite | `npm run test` | ~5m |

---

## 10. Migration Strategy

### 10.1 Pre-Migration Checklist

- [ ] Backup production database
- [ ] Run data integrity check for existing orphans
- [ ] Clean up any existing orphaned records
- [ ] Notify stakeholders of maintenance window
- [ ] Prepare rollback scripts

### 10.2 Migration Steps

#### Step 1: Deploy Phase 1 (Immediate Fix)
```bash
# 1. Deploy code changes
git checkout feature/cascade-delete-fix
npm run build

# 2. Run data cleanup for existing orphans
npm run db:cleanup-orphans

# 3. Verify no orphans remain
npm run db:integrity-check
```

#### Step 2: Deploy Phase 2 (Soft Delete)
```bash
# 1. Run database migration
npx prisma migrate deploy

# 2. Regenerate Prisma client
npx prisma generate

# 3. Deploy application code
npm run build
npm run start

# 4. Verify soft delete working
npm run test:integration
```

### 10.3 Data Migration for Existing Records

No data migration required for existing records. New `deleted_at` columns default to NULL, meaning all existing records are considered "not deleted."

---

## 11. Rollback Plan

### 11.1 Phase 1 Rollback

```bash
# Revert code changes
git revert HEAD

# Redeploy previous version
npm run deploy:previous
```

### 11.2 Phase 2 Rollback

```bash
# 1. Revert code changes
git revert HEAD

# 2. Rollback database migration
npx prisma migrate resolve --rolled-back YYYYMMDD_add_soft_delete_fields

# 3. Or manually remove columns
psql -c "ALTER TABLE users DROP COLUMN deleted_at, DROP COLUMN deleted_by;"
psql -c "ALTER TABLE companies DROP COLUMN deleted_at, DROP COLUMN deleted_by;"
psql -c "ALTER TABLE stores DROP COLUMN deleted_at, DROP COLUMN deleted_by;"
```

---

## 12. Security Considerations

### 12.1 Access Control

| Action | Required Role | Notes |
|--------|---------------|-------|
| Soft delete user | SUPERADMIN | Only super admins can delete users |
| Restore user | SUPERADMIN | Restore requires same permission as delete |
| Permanent delete | SUPERADMIN | Should require additional confirmation |
| View deleted records | SUPERADMIN | Admin-only feature |

### 12.2 Audit Trail

All soft delete operations must be logged:

```typescript
await prisma.auditLog.create({
  data: {
    user_id: actorId,
    action: 'SOFT_DELETE',
    table_name: 'users',
    record_id: userId,
    old_values: { deleted_at: null },
    new_values: { deleted_at: deletedAt, deleted_by: actorId },
    ip_address: ipAddress,
    reason: `User soft deleted by ${actorEmail}`
  }
});
```

### 12.3 Data Retention

- Soft-deleted records should be permanently deleted after retention period (e.g., 90 days)
- Implement scheduled job to purge old soft-deleted records
- Ensure compliance with data retention policies

---

## 13. Performance Considerations

### 13.1 Index Strategy

All queries filtering by `deleted_at` should use indexes:

```sql
-- Single column index
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- Composite index for common queries
CREATE INDEX "users_status_deleted_idx" ON "users"("status", "deleted_at");
```

### 13.2 Query Performance

Adding `deleted_at: null` to queries may impact performance. Mitigation:

1. Use composite indexes
2. Consider partial indexes for large tables:
   ```sql
   CREATE INDEX "users_active_idx" ON "users"("status") WHERE deleted_at IS NULL;
   ```

### 13.3 Estimated Impact

| Query Type | Before | After | Notes |
|------------|--------|-------|-------|
| List users | ~10ms | ~12ms | +20% due to additional filter |
| Get user | ~2ms | ~2ms | No impact (primary key lookup) |
| Delete user | ~50ms | ~60ms | +20% due to soft delete logic |

---

## 14. Appendix

### 14.1 Related Files

| File | Purpose |
|------|---------|
| `backend/src/services/user-admin.service.ts` | User CRUD operations |
| `backend/src/services/company.service.ts` | Company CRUD operations |
| `backend/src/services/store.service.ts` | Store CRUD operations |
| `backend/src/services/api-key/api-key.service.ts` | API key management |
| `backend/prisma/schema.prisma` | Database schema |

### 14.2 References

- [Prisma Cascading Deletes Documentation](https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries#cascading-deletes)
- [Soft Delete Pattern](https://www.prisma.io/docs/concepts/components/prisma-client/middleware/soft-delete-middleware)
- [OWASP Data Retention Guidelines](https://owasp.org/www-project-web-security-testing-guide/)

### 14.3 Glossary

| Term | Definition |
|------|------------|
| Hard Delete | Permanent removal of record from database |
| Soft Delete | Marking record as deleted without physical removal |
| Cascade Delete | Automatic deletion of child records when parent is deleted |
| Orphaned Record | Record with foreign key reference to non-existent parent |

### 14.4 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-22 | Claude | Initial document |

---

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Tech Lead | | | |
| Architect | | | |
| QA Lead | | | |
| Product Owner | | | |
