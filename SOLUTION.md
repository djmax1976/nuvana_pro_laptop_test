# Solution for 36 Failing Tests - Comprehensive Fix Plan

## Executive Summary
The 36 failing tests are caused by **infrastructure configuration issues**, NOT missing features. All client management features are fully implemented and working. The fixes are straightforward configuration changes.

---

## Root Causes Identified

### 1. RabbitMQ Queues Not Initialized (CRITICAL)
- **Impact**: Tests that trigger transaction processing fail
- **Error**: `NOT_FOUND - no queue 'transactions.processing'`
- **Cause**: App connects to RabbitMQ but doesn't create the required queues

### 2. RLS Blocking Test Cleanup (CRITICAL)
- **Impact**: Test fixtures can't clean up between tests
- **Error**: `PrismaClientKnownRequestError: Invalid prismaClient.shift.deleteMany()`
- **Cause**: Test cleanup uses tenant-scoped Prisma client blocked by RLS policies

### 3. Audit Log Creation Failing Silently (MEDIUM)
- **Impact**: Tests expect audit logs that don't exist
- **Cause**: RLS or user context issues prevent audit log creation, but error is caught silently

---

## Solution Implementation

### Fix #1: Initialize RabbitMQ Queues During Startup

**File**: `backend/src/app.ts`
**Line**: After line 211

```typescript
// Initialize RabbitMQ connection with retry
app.log.info("Initializing RabbitMQ connection...");
try {
  await initializeRabbitMQ();
  app.log.info("RabbitMQ connection established");

  // NEW: Initialize queues
  app.log.info("Setting up RabbitMQ queues...");
  await setupTransactionsQueue();
  app.log.info("RabbitMQ queues initialized successfully");
} catch (err) {
  app.log.warn(
    { err },
    "RabbitMQ setup failed - server will start but health checks will report degraded",
  );
}
```

**Import required**: Add to top of file
```typescript
import {
  initializeRabbitMQ,
  closeRabbitMQ,
  setupTransactionsQueue  // ADD THIS
} from "./utils/rabbitmq";
```

---

### Fix #2: Use RLS-Bypass Prisma Client for Test Cleanup

**File**: `tests/support/fixtures/rbac.fixture.ts`
**Lines**: 456-469

**Current problematic code**:
```typescript
// Uses tenant-scoped client - blocked by RLS!
await prismaClient.shift.deleteMany({
  where: { cashier_id: user.user_id },
});
```

**Solution**: Create an RLS-bypass Prisma client for cleanup

**New helper file**: `tests/support/prisma-bypass.ts`
```typescript
import { PrismaClient } from "@prisma/client";

/**
 * Create a Prisma client that bypasses RLS for test cleanup
 * This uses a superuser connection string to avoid RLS restrictions
 */
export function createBypassPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL?.replace('?', '?options=-c%20row_security%3Doff&')
          || process.env.DATABASE_URL,
      },
    },
  });
}
```

**Update rbac.fixture.ts**:
```typescript
import { createBypassPrismaClient } from './prisma-bypass';

// ... in the fixture ...

await use(corporateAdminUser);

// Cleanup - Use bypass client to avoid RLS restrictions
const bypassClient = createBypassPrismaClient();
try {
  // 1. Delete shifts first (references user via cashier_id)
  await bypassClient.shift.deleteMany({
    where: { cashier_id: user.user_id },
  });
  // 2. Delete user roles
  await bypassClient.userRole.deleteMany({
    where: { user_id: user.user_id },
  });
  // 3. Delete user
  await bypassClient.user.delete({ where: { user_id: user.user_id } });
  // 4. Delete company last
  await bypassClient.company.delete({
    where: { company_id: company.company_id },
  });
} finally {
  await bypassClient.$disconnect();
}
```

---

### Fix #3: Make Audit Log Failures Visible in Tests

**File**: `backend/src/services/client.service.ts`
**Lines**: 106-125

**Current code** (hides failures):
```typescript
try {
  await prisma.auditLog.create({ ... });
} catch (auditError) {
  console.error("Failed to create audit log...", auditError);
  // ❌ Test doesn't know this failed!
}
```

**Solution**: Add environment-based behavior
```typescript
try {
  await prisma.auditLog.create({
    data: {
      user_id: auditContext.userId,
      action: "CREATE",
      table_name: "clients",
      record_id: client.client_id,
      new_values: client as unknown as Prisma.JsonObject,
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      reason: `Client created by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
    },
  });
} catch (auditError) {
  console.error("Failed to create audit log for client creation:", auditError);

  // In test environment, fail loudly so we can fix the issue
  if (process.env.NODE_ENV === 'test') {
    throw new Error(`Audit log creation failed: ${auditError instanceof Error ? auditError.message : 'Unknown error'}`);
  }
  // In production, continue despite audit failure
}
```

---

## Implementation Priority

### Phase 1: Critical Fixes (Will fix most test failures)
1. ✅ Fix #1: Initialize RabbitMQ queues - **5 minutes**
2. ✅ Fix #2: RLS-bypass for test cleanup - **15 minutes**

**Expected result**: ~30-32 tests will pass

### Phase 2: Enhanced Error Reporting
3. ✅ Fix #3: Audit log failures visible in tests - **10 minutes**

**Expected result**: All 36 tests should pass

---

## Testing the Fixes

### Local Testing
```bash
# 1. Apply fixes
# 2. Restart backend
cd backend && npm run build && npm run start:test

# 3. Run the failing tests
npm run test:api -- --grep "\[P0\]"
```

### CI/CD Testing
```bash
# Push changes and monitor CI
git add backend/src/app.ts tests/support/
git commit -m "Fix test failures: Initialize RabbitMQ queues and RLS-bypass cleanup"
git push origin development
```

---

## Why These Tests Were Failing

### ❌ **What We're NOT Missing:**
- Client CRUD operations (fully implemented ✅)
- Audit logging functionality (implemented ✅)
- Public ID support (implemented ✅)
- Email/password fields (implemented ✅)
- RabbitMQ integration (connection implemented ✅)

### ✅ **What WAS Missing:**
- Queue initialization during app startup
- RLS-bypass mechanism for test cleanup
- Proper error visibility in test environment

---

## Verification Checklist

After applying fixes, verify:

- [ ] RabbitMQ queues are created during app startup
- [ ] Test cleanup completes without Prisma errors
- [ ] Audit logs are created successfully in tests
- [ ] All 36 failing tests now pass
- [ ] No new failures introduced

---

## Additional Recommendations

### 1. Add Health Check for RabbitMQ Queues
Update `backend/src/routes/health.ts` to verify queues exist:
```typescript
const rabbitmqHealth = await checkRabbitMQHealth();
if (!rabbitmqHealth.healthy || !rabbitmqHealth.queues?.length) {
  status = 'degraded';
}
```

### 2. Add Test Environment Documentation
Document that tests require:
- PostgreSQL with RLS enabled
- Redis running
- RabbitMQ with management plugin
- Proper test secrets configured

### 3. Consider Test Database Seeding Script
Create a script to pre-populate test database with roles and permissions
before running tests.

---

## Estimated Time to Fix
- **Total implementation time**: 30 minutes
- **Testing and verification**: 15 minutes
- **Total**: 45 minutes

## Success Criteria
- ✅ All 36 tests pass in CI/CD
- ✅ No RabbitMQ queue errors in logs
- ✅ No Prisma errors during test cleanup
- ✅ Audit logs created successfully
- ✅ Clean CI/CD pipeline (all jobs green)
