# Test Cleanup Guide

**IMPORTANT:** All E2E tests MUST clean up after themselves to keep the database clean!

## Why This Matters

Tests that don't clean up properly will:
- ❌ Cause duplicate email/unique constraint errors on subsequent runs
- ❌ Cause foreign key constraint violations
- ❌ Leave hundreds of test users/clients/companies in the database
- ❌ Make debugging extremely difficult

## Database Foreign Key Constraints

Our database has strict foreign key relationships that MUST be respected when deleting records:

```
Transactions → Shifts → Users
           ↘         ↗
            UserRoles

Companies → Stores → Shifts
         ↘       ↗
          UserRoles

Clients (standalone, but linked to Users via email)
```

### Deletion Order (CRITICAL!)

**ALWAYS delete in this order:**

1. **Transactions** (references shifts + users)
2. **Shifts** (references users + stores)
3. **UserRoles** (references users + companies + stores)
4. **Users**
5. **Stores** (references companies)
6. **Companies**
7. **Clients**

## Using the Cleanup Helper

We provide a robust cleanup helper at `tests/support/cleanup-helper.ts` that handles all foreign key constraints automatically.

### Example Usage

```typescript
import { cleanupTestData } from "../support/cleanup-helper";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

test.describe("My Test Suite", () => {
  let testUser: any;
  let testClient: any;
  let testCompany: any;

  test.beforeAll(async () => {
    // Create test data...
    testUser = await prisma.user.create({...});
    testClient = await prisma.client.create({...});
    testCompany = await prisma.company.create({...});
  });

  test.afterAll(async () => {
    // ✅ CORRECT: Use cleanup helper
    await cleanupTestData(prisma, {
      users: testUser ? [testUser.user_id] : [],
      clients: testClient ? [testClient.client_id] : [],
      companies: testCompany ? [testCompany.company_id] : [],
    });

    await prisma.$disconnect();
  });
});
```

### Available Cleanup Functions

#### `cleanupTestData(prisma, cleanup)`
Main cleanup function that handles multiple entities safely.

**Parameters:**
```typescript
{
  users?: string[];      // Array of user IDs to delete
  clients?: string[];    // Array of client IDs to delete
  companies?: string[];  // Array of company IDs to delete
  stores?: string[];     // Array of store IDs to delete
}
```

#### `deleteUserWithRelatedData(prisma, userId, options?)`
Deletes a single user and all related data (transactions, shifts, user roles).

**Options:**
```typescript
{
  deleteShifts?: boolean;        // Default: true
  deleteTransactions?: boolean;  // Default: true
  verbose?: boolean;             // Default: false
}
```

#### `deleteClientWithRelatedData(prisma, clientId, options?)`
Deletes a client and optionally its associated user.

**Options:**
```typescript
{
  deleteAssociatedUser?: boolean;  // Default: true
}
```

#### `deleteCompanyWithRelatedData(prisma, companyId)`
Deletes a company and all related data (stores, user roles).

#### `deleteStoreWithRelatedData(prisma, storeId)`
Deletes a store and all related data (user roles, shifts, transactions).

## Common Cleanup Patterns

### Pattern 1: Test creates super admin + test user

```typescript
test.afterAll(async () => {
  await cleanupTestData(prisma, {
    users: [
      superadminUser?.user_id,
      testUser?.user_id,
    ].filter(Boolean),  // Remove undefined values
  });

  await prisma.$disconnect();
});
```

### Pattern 2: Test creates client (which has an associated user)

```typescript
test.afterAll(async () => {
  await cleanupTestData(prisma, {
    clients: testClient ? [testClient.client_id] : [],
    users: superadminUser ? [superadminUser.user_id] : [],
  });

  await prisma.$disconnect();
});
```

### Pattern 3: Test creates company with stores

```typescript
test.afterAll(async () => {
  await cleanupTestData(prisma, {
    companies: testCompany ? [testCompany.company_id] : [],
    users: superadminUser ? [superadminUser.user_id] : [],
  });

  await prisma.$disconnect();
});
```

### Pattern 4: Complex cleanup (company, stores, multiple users)

```typescript
test.afterAll(async () => {
  await cleanupTestData(prisma, {
    stores: testStore ? [testStore.store_id] : [],
    companies: testCompany ? [testCompany.company_id] : [],
    users: [superadminUser?.user_id, corporateAdmin?.user_id].filter(Boolean),
  });

  await prisma.$disconnect();
});
```

## beforeAll Cleanup

Always clean up BEFORE creating test data to handle leftover data from crashed tests:

```typescript
test.beforeAll(async () => {
  // ✅ CORRECT: Clean up before creating new test data
  const existingUsers = await prisma.user.findMany({
    where: {
      email: { in: ["test-email@example.com", "admin@example.com"] },
    },
    select: { user_id: true },
  });

  for (const user of existingUsers) {
    await prisma.userRole.deleteMany({
      where: { user_id: user.user_id },
    });
  }

  await prisma.user.deleteMany({
    where: {
      email: { in: ["test-email@example.com", "admin@example.com"] },
    },
  });

  // Now create fresh test data...
});
```

## Verifying Cleanup

After running tests, verify the database is clean:

```bash
# Run cleanup verification script
npx tsx scripts/verify-cleanup.ts

# Expected output:
# ✅ SUCCESS! Database is clean.
# Only user: admin@nuvana.com (System Administrator)
```

## Manual Database Cleanup

If tests crash and leave dirty data:

```bash
# Clean database (keeps only admin@nuvana.com)
npx tsx scripts/cleanup-test-users.ts
```

## Common Mistakes to Avoid

### ❌ DON'T: Delete users before their related data
```typescript
// WRONG! Will cause FK violations
await prisma.user.delete({ where: { user_id: userId } });
await prisma.userRole.deleteMany({ where: { user_id: userId } });
```

### ✅ DO: Use the cleanup helper
```typescript
// CORRECT! Handles FK constraints automatically
await cleanupTestData(prisma, {
  users: [userId],
});
```

### ❌ DON'T: Ignore cleanup errors silently
```typescript
// WRONG! Hides problems
await prisma.user.delete({...}).catch(() => {});
```

### ✅ DO: Let cleanup helper handle errors gracefully
```typescript
// CORRECT! Helper logs errors but doesn't throw
await cleanupTestData(prisma, {...});
```

### ❌ DON'T: Create users without cleaning up
```typescript
// WRONG! No afterAll hook
test.beforeAll(async () => {
  testUser = await prisma.user.create({...});
});
```

### ✅ DO: Always add afterAll cleanup
```typescript
// CORRECT!
test.beforeAll(async () => {
  testUser = await prisma.user.create({...});
});

test.afterAll(async () => {
  await cleanupTestData(prisma, { users: [testUser.user_id] });
  await prisma.$disconnect();
});
```

## Checklist for New Tests

Before submitting a new test file, verify:

- [ ] `beforeAll` cleans up existing test data with correct FK order
- [ ] `afterAll` uses `cleanupTestData()` helper
- [ ] All created entities are tracked (users, clients, companies, stores)
- [ ] `prisma.$disconnect()` is called in `afterAll`
- [ ] Test runs successfully multiple times in a row
- [ ] Database is clean after test completes (verify with `verify-cleanup.ts`)

## Questions?

If you encounter cleanup issues:

1. Check the foreign key constraints in `backend/prisma/schema.prisma`
2. Review the cleanup helper source code: `tests/support/cleanup-helper.ts`
3. Run the database cleanup script: `npx tsx scripts/cleanup-test-users.ts`
4. Verify cleanup: `npx tsx scripts/verify-cleanup.ts`
