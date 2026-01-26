# Traceability Matrix: POS Configuration Read API

**Document Version:** 1.0
**Date:** 2026-01-26
**Fix Reference:** GET /api/stores/:storeId POS field serialization
**Test File:** `tests/api/store-pos-config-read.api.spec.ts`

---

## 1. Defect Summary

| Field | Value |
|-------|-------|
| **Defect ID** | POS-READ-001 |
| **Severity** | P0 - Critical |
| **Root Cause** | Fastify response schema missing POS fields (pos_type, pos_connection_type, pos_connection_config) |
| **Affected File** | `backend/src/routes/store.ts` (lines 1206-1230) |
| **Fix Applied** | Added POS fields to GET response schema (lines 1229-1259) |

---

## 2. Business Requirements Traceability

| Requirement ID | Business Requirement | Risk Level | Test Case(s) | Status |
|----------------|---------------------|------------|--------------|--------|
| BR-001 | Store edit form must display saved POS configuration | P0-Critical | POSREAD-API-001, POSREAD-API-010 | COVERED |
| BR-002 | Default POS values must be MANUAL_ENTRY/MANUAL for new stores | P0-Critical | POSREAD-API-002 | COVERED |
| BR-003 | POS configuration changes must persist across save/reload cycles | P0-Critical | POSREAD-API-010, POSREAD-API-011, POSREAD-API-012, POSREAD-API-013 | COVERED |
| BR-004 | Complex POS connection configs (IP, port, API keys) must be preserved | P1-High | POSREAD-API-050, POSREAD-API-051 | COVERED |
| BR-005 | All 15 POS system types must be supported | P1-High | POSREAD-API-020 | COVERED |
| BR-006 | All 5 connection types must be supported | P1-High | POSREAD-API-021 | COVERED |

---

## 3. Security Requirements Traceability

| Requirement ID | Security Requirement | Standard | Test Case(s) | Status |
|----------------|---------------------|----------|--------------|--------|
| SEC-001 | Tenant isolation - users cannot access other companies' POS configs | API-008/TENANT_ISOLATION | POSREAD-API-030 | COVERED |
| SEC-002 | System admin bypass - admins can access any company's data | RBAC | POSREAD-API-031 | COVERED |
| SEC-003 | Authentication required for all store endpoints | API-001/AUTHENTICATION | POSREAD-API-040 | COVERED |
| SEC-004 | Response schema whitelist (OUTPUT_FILTERING) | API-008 | POSREAD-API-001 | COVERED |

---

## 4. Code Change to Test Mapping

| Code Change | Location | Purpose | Validating Test(s) |
|-------------|----------|---------|-------------------|
| Added `pos_type` to response schema | store.ts:1231-1248 | Return saved POS system type | POSREAD-API-001, POSREAD-API-020 |
| Added `pos_connection_type` to response schema | store.ts:1249-1253 | Return saved connection method | POSREAD-API-001, POSREAD-API-021 |
| Added `pos_connection_config` to response schema | store.ts:1254-1257 | Return saved connection parameters | POSREAD-API-001, POSREAD-API-050, POSREAD-API-051 |

---

## 5. Test Case Inventory

| Test ID | Description | Priority | Category | Pass/Fail |
|---------|-------------|----------|----------|-----------|
| POSREAD-API-001 | GET returns all POS configuration fields | P0 | Functional | PASS |
| POSREAD-API-002 | GET returns default POS values for new store | P0 | Functional | PASS |
| POSREAD-API-003 | GET returns null for empty pos_connection_config | P0 | Edge Case | PASS |
| POSREAD-API-010 | Round-trip: PUT then GET returns identical config | P0 | Integration | PASS |
| POSREAD-API-011 | Round-trip: Square REST configuration | P0 | Integration | PASS |
| POSREAD-API-012 | Round-trip: Changing POS type FILE to API | P0 | Integration | PASS |
| POSREAD-API-013 | Round-trip: Clearing POS config to MANUAL | P0 | Integration | PASS |
| POSREAD-API-020 | All 15 pos_type enum values supported | P1 | Enum Coverage | PASS |
| POSREAD-API-021 | All 5 pos_connection_type enum values supported | P1 | Enum Coverage | PASS |
| POSREAD-API-030 | Corporate admin cannot read other company's POS | P0-SEC | Security | PASS |
| POSREAD-API-031 | System admin can read any company's POS | P0 | RBAC | PASS |
| POSREAD-API-040 | Authentication required | P0-SEC | Security | PASS |
| POSREAD-API-050 | Complex nested config preserved | P1 | Edge Case | PASS |
| POSREAD-API-051 | Snake_case keys in config preserved | P0 | Data Integrity | PASS |
| POSREAD-API-052 | Empty object config handled | P1 | Edge Case | PASS |
| POSREAD-API-053 | 404 for non-existent store | P1 | Error Handling | PASS |
| POSREAD-API-054 | 400 for invalid UUID | P1 | Validation | PASS |

---

## 6. Coverage Summary

| Category | Total | Covered | Coverage |
|----------|-------|---------|----------|
| Business Requirements | 6 | 6 | 100% |
| Security Requirements | 4 | 4 | 100% |
| Code Changes | 3 | 3 | 100% |
| Test Cases | 17 | 17 | 100% PASS |

---

## 7. Risk Mitigation Verification

| Risk | Mitigation | Test Evidence |
|------|------------|---------------|
| POS config lost on save/reload | Response schema includes all POS fields | POSREAD-API-010, 011, 012, 013 |
| Cross-tenant data leakage | company_id validation in queries | POSREAD-API-030 |
| Config corruption (type coercion) | JSON/JSONB integrity tests | POSREAD-API-050, 051, 052 |
| Enum value rejection | Full enum coverage tests | POSREAD-API-020, 021 |

---

## 8. Related Artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| Fix Implementation | `backend/src/routes/store.ts:1229-1259` | Response schema update |
| Test Implementation | `tests/api/store-pos-config-read.api.spec.ts` | Validation test suite |
| Existing PUT Tests | `tests/api/store-pos-config-update.api.spec.ts` | Complementary update tests |
| Database Schema | `backend/prisma/schema.prisma:227,235,254` | POS field definitions |
| Frontend Consumer | `src/components/stores/EditStoreModal.tsx:324-332` | POS config display logic |

---

## 9. Approval

| Role | Status |
|------|--------|
| Code Review | Pending |
| QA Validation | COMPLETE - 17/17 tests passing |
| Security Review | COMPLETE - tenant isolation verified |

---

**Matrix Generated:** 2026-01-26
**Generator:** Claude Code Enterprise QA Protocol
