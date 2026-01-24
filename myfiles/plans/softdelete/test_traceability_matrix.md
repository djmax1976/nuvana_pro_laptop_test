# Soft Delete & Cascade Delete Test Traceability Matrix

**Document Version:** 1.0
**Created:** 2026-01-22
**Author:** Enterprise QA
**Related Plan:** soft_delete.md

---

## 1. Executive Summary

This document provides a comprehensive traceability matrix mapping requirements, bugs, and business risks to their corresponding test cases. It ensures complete test coverage for the Soft Delete & Cascade Delete implementation.

### 1.1 Test Coverage Summary

| Test Category | Test Count | Priority |
|---------------|------------|----------|
| Unit Tests (Cascade Delete Utility) | 18 | P0 |
| Integration Tests (User Deletion Cascade) | 10 | P0 |
| Integration Tests (Company Deletion Cascade) | 8 | P0 |
| Integration Tests (API Key Integrity) | 13 | P0 |
| **Total** | **49** | - |

### 1.2 Test Files

| File | Location | Test Type |
|------|----------|-----------|
| cascade-delete.utils.test.ts | `backend/tests/unit/utils/` | Unit |
| user-deletion-cascade.api.spec.ts | `tests/api/` | Integration |
| company-deletion-cascade.api.spec.ts | `tests/api/` | Integration |
| api-keys-integrity.api.spec.ts | `tests/api/` | Integration |

---

## 2. Requirement to Test Mapping

### 2.1 BUG-001: Prisma deleteMany() Does Not Trigger Cascade

**Description:** Prisma `deleteMany()` does not trigger `onDelete: Cascade` referential actions, causing orphaned records.

**Business Impact:** CRITICAL - 500 errors on API Keys page, broken Super Admin dashboard

| Test ID | Test Name | Test File | Priority | Status |
|---------|-----------|-----------|----------|--------|
| CD-UTIL-001 | Should delete API keys for given store IDs | cascade-delete.utils.test.ts | P0 | PASS |
| CD-UTIL-005 | Should delete sync sessions before API keys (FK constraint) | cascade-delete.utils.test.ts | P0 | PASS |
| CD-UTIL-006 | Should delete audit events before API keys (FK constraint) | cascade-delete.utils.test.ts | P0 | PASS |
| CD-UTIL-007 | Should follow correct deletion order | cascade-delete.utils.test.ts | P0 | PASS |
| UDC-001 | Deleting CLIENT_OWNER should cascade to delete API keys | user-deletion-cascade.api.spec.ts | P0 | PENDING |
| UDC-002 | Deleting user with multiple stores should cascade to all API keys | user-deletion-cascade.api.spec.ts | P0 | PENDING |
| CDC-001 | Deleting company should cascade to delete all store API keys | company-deletion-cascade.api.spec.ts | P0 | PENDING |
| AKIN-007 | API should handle queries gracefully even with orphans | api-keys-integrity.api.spec.ts | P0 | PENDING |

### 2.2 BUG-002: No Explicit API Key Cleanup in Deletion Flows

**Description:** User and company deletion flows do not explicitly delete API keys before stores/companies.

**Business Impact:** HIGH - Orphaned records accumulate in production

| Test ID | Test Name | Test File | Priority | Status |
|---------|-----------|-----------|----------|--------|
| UDC-003 | Deleting user should also delete API key audit events | user-deletion-cascade.api.spec.ts | P0 | PENDING |
| UDC-004 | Deleting user should delete API key sync sessions | user-deletion-cascade.api.spec.ts | P0 | PENDING |
| CDC-004 | Deleting company should delete API key audit events | company-deletion-cascade.api.spec.ts | P1 | PENDING |
| CD-UTIL-011 | Should delete API keys for all stores in a company | cascade-delete.utils.test.ts | P0 | PASS |
| CD-UTIL-014 | Should delete API keys for multiple companies | cascade-delete.utils.test.ts | P0 | PASS |

### 2.3 REQ-001: No Orphaned Records After Deletion

**Description:** System must ensure no orphaned records exist after any deletion operation.

**Business Impact:** CRITICAL - Data integrity requirement

| Test ID | Test Name | Test File | Priority | Status |
|---------|-----------|-----------|----------|--------|
| UDC-005 | No orphaned API keys should exist after user deletion | user-deletion-cascade.api.spec.ts | P0 | PENDING |
| UDC-006 | API Keys page should load after user deletion | user-deletion-cascade.api.spec.ts | P0 | PENDING |
| CDC-005 | No orphaned API keys after company deletion | company-deletion-cascade.api.spec.ts | P0 | PENDING |
| CDC-006 | API Keys page loads after company deletion | company-deletion-cascade.api.spec.ts | P0 | PENDING |
| AKIN-004 | Orphaned API key query should detect orphans | api-keys-integrity.api.spec.ts | P0 | PENDING |
| AKIN-005 | Orphaned API keys identifiable by missing store | api-keys-integrity.api.spec.ts | P0 | PENDING |
| AKIN-006 | Orphaned API keys identifiable by missing company | api-keys-integrity.api.spec.ts | P0 | PENDING |

### 2.4 REQ-002: Deletion Order Must Satisfy FK Constraints

**Description:** Child records must be deleted before parent records to satisfy foreign key constraints.

**Business Impact:** HIGH - Database integrity

| Test ID | Test Name | Test File | Priority | Status |
|---------|-----------|-----------|----------|--------|
| CD-UTIL-005 | Should delete sync sessions before API keys | cascade-delete.utils.test.ts | P0 | PASS |
| CD-UTIL-006 | Should delete audit events before API keys | cascade-delete.utils.test.ts | P0 | PASS |
| CD-UTIL-007 | Should follow correct deletion order | cascade-delete.utils.test.ts | P0 | PASS |
| CD-UTIL-017 | Should handle realistic deletion scenario | cascade-delete.utils.test.ts | P0 | PASS |

---

## 3. Test ID to Requirement Mapping (Reverse Lookup)

### 3.1 Unit Tests (cascade-delete.utils.test.ts)

| Test ID | Test Name | Requirements Covered |
|---------|-----------|---------------------|
| CD-UTIL-001 | Delete API keys for given store IDs | BUG-001 |
| CD-UTIL-002 | Handle empty store IDs array | Edge Case |
| CD-UTIL-003 | Handle null/undefined store IDs | Edge Case |
| CD-UTIL-004 | Return zero counts when no API keys | Edge Case |
| CD-UTIL-005 | Delete sync sessions before API keys | BUG-001, REQ-002 |
| CD-UTIL-006 | Delete audit events before API keys | BUG-001, REQ-002 |
| CD-UTIL-007 | Correct deletion order | BUG-001, REQ-002 |
| CD-UTIL-008 | Propagate errors from API key lookup | Error Handling |
| CD-UTIL-009 | Propagate errors from sync session deletion | Error Handling |
| CD-UTIL-010 | Propagate errors from audit event deletion | Error Handling |
| CD-UTIL-011 | Delete API keys for all stores in company | BUG-002 |
| CD-UTIL-012 | Handle empty company ID | Edge Case |
| CD-UTIL-013 | Handle company with no stores | Edge Case |
| CD-UTIL-014 | Delete API keys for multiple companies | BUG-002 |
| CD-UTIL-015 | Handle empty company IDs array | Edge Case |
| CD-UTIL-016 | Handle null/undefined company IDs | Edge Case |
| CD-UTIL-017 | Realistic deletion scenario | BUG-001, REQ-002 |
| CD-UTIL-018 | API keys with no related records | Edge Case |

### 3.2 Integration Tests (user-deletion-cascade.api.spec.ts)

| Test ID | Test Name | Requirements Covered |
|---------|-----------|---------------------|
| UDC-001 | CLIENT_OWNER cascade to API keys | BUG-001 |
| UDC-002 | Multiple stores cascade to all API keys | BUG-001 |
| UDC-003 | Delete API key audit events | BUG-002 |
| UDC-004 | Delete API key sync sessions | BUG-002 |
| UDC-005 | No orphaned API keys after deletion | REQ-001 |
| UDC-006 | API Keys page loads after deletion | REQ-001 |
| UDC-007 | Store deletion verification | REQ-001 |
| UDC-008 | Company deletion verification | REQ-001 |
| UDC-009 | Delete user with no API keys | Edge Case |
| UDC-010 | Delete user with revoked API keys | Edge Case |

### 3.3 Integration Tests (company-deletion-cascade.api.spec.ts)

| Test ID | Test Name | Requirements Covered |
|---------|-----------|---------------------|
| CDC-001 | Company cascade to store API keys | BUG-001 |
| CDC-002 | Multiple stores cascade to all API keys | BUG-001 |
| CDC-003 | Delete all stores | REQ-001 |
| CDC-004 | Delete API key audit events | BUG-002 |
| CDC-005 | No orphaned API keys | REQ-001 |
| CDC-006 | API Keys page loads after deletion | REQ-001 |
| CDC-007 | Delete company with no stores | Edge Case |
| CDC-008 | Delete company with stores but no API keys | Edge Case |

### 3.4 Integration Tests (api-keys-integrity.api.spec.ts)

| Test ID | Test Name | Requirements Covered |
|---------|-----------|---------------------|
| AKIN-001 | API Keys list endpoint returns 200 | System Stability |
| AKIN-002 | API Keys list returns array | System Stability |
| AKIN-003 | API Keys include company/store info | Data Integrity |
| AKIN-004 | Orphan detection works | REQ-001 |
| AKIN-005 | Orphans identifiable by missing store | REQ-001 |
| AKIN-006 | Orphans identifiable by missing company | REQ-001 |
| AKIN-007 | Handle queries with orphans gracefully | BUG-001 |
| AKIN-008 | Invalid API key ID returns 404 | Error Handling |
| AKIN-009 | Malformed API key ID returns 400 | Error Handling |
| AKIN-010 | Pagination support | Functionality |
| AKIN-011 | Status filter support | Functionality |
| AKIN-012 | Authentication required | Security |
| AKIN-013 | SUPERADMIN role required | Security |

---

## 4. Test Priority Distribution

### 4.1 By Priority Level

| Priority | Count | Percentage | Description |
|----------|-------|------------|-------------|
| P0 | 35 | 71% | Critical - Must pass for release |
| P1 | 14 | 29% | High - Should pass for release |

### 4.2 By Test Type

| Type | Count | Percentage |
|------|-------|------------|
| Unit | 18 | 37% |
| Integration | 31 | 63% |

### 4.3 By Requirement Category

| Category | Count | Percentage |
|----------|-------|------------|
| BUG-001 (Cascade) | 12 | 24% |
| BUG-002 (Explicit Cleanup) | 5 | 10% |
| REQ-001 (No Orphans) | 10 | 20% |
| REQ-002 (Deletion Order) | 4 | 8% |
| Edge Cases | 9 | 18% |
| Error Handling | 5 | 10% |
| Security | 2 | 4% |
| System Stability | 2 | 4% |

---

## 5. Test Execution Commands

### 5.1 Unit Tests

```bash
# Run cascade delete utility tests
cd backend
npm run test -- --run tests/unit/utils/cascade-delete.utils.test.ts
```

### 5.2 Integration Tests

```bash
# Run all cascade delete integration tests
npm run test:api -- user-deletion-cascade.api.spec.ts
npm run test:api -- company-deletion-cascade.api.spec.ts
npm run test:api -- api-keys-integrity.api.spec.ts

# Run all soft delete related tests
npm run test:api -- --grep "CASCADE|INTEGRITY"
```

### 5.3 Full Test Suite

```bash
# Run complete test suite
npm run test
```

---

## 6. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Tech Lead | | | |
| Product Owner | | | |

---

## 7. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-22 | Enterprise QA | Initial document |
