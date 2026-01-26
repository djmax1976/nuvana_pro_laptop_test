# Client Owner Setup Wizard - Test Traceability Matrix

## Overview

This document provides traceability between business requirements, security standards, and test coverage for the Client Owner Setup Wizard feature.

**Feature**: Client Owner Setup Wizard (5-step atomic creation)
**API Endpoint**: `POST /api/admin/client-owner-setup`
**Test Files**:
- API Integration Tests: `tests/api/client-owner-setup-wizard.api.spec.ts`
- Unit Tests (Schema): `tests/unit/schemas/client-owner-setup.schema.test.ts`

---

## Business Rules Traceability

| Rule ID | Business Rule Description | Unit Test | API Integration Test | Status |
|---------|--------------------------|-----------|---------------------|--------|
| BR-COS-001 | All 5 entities created atomically (all-or-nothing) | N/A (service layer) | `[P0-BR-COS-001]` | ✅ |
| BR-COS-002 | All emails must be unique in database | N/A (database) | `[P0-BR-COS-002]` | ✅ |
| BR-COS-003a | User email must differ from store login email | `ClientOwnerSetupRequestSchema - Cross-Email Validation` | `[P0-BR-COS-003a]` | ✅ |
| BR-COS-003b | User email must differ from store manager email | `ClientOwnerSetupRequestSchema - Cross-Email Validation` | `[P0-BR-COS-003b]` | ✅ |
| BR-COS-003c | Store login email must differ from store manager email | `ClientOwnerSetupRequestSchema - Cross-Email Validation` | `[P0-BR-COS-003c]` | ✅ |
| BR-COS-004 | Password requirements (8+ chars, upper, lower, number, special) | `SetupUserSchema - Password Validation` | `[P0-BR-COS-004a]`, `[P0-BR-COS-004b]` | ✅ |
| BR-COS-005 | Company address uses structured fields with state/county validation | `SetupCompanySchema` | Happy path tests | ✅ |
| BR-COS-006 | Store timezone must be valid IANA format | `SetupStoreSchema - Timezone Validation` | `[P0-BR-COS-006]` | ✅ |
| BR-COS-007 | Store manager is required (for desktop app) | `SetupStoreManagerSchema` | `[P0-BR-COS-007]` | ✅ |
| BR-COS-008 | Transaction rollback on any failure | N/A (service layer) | `[P0-BR-COS-008]` | ✅ |

---

## Security Standards Traceability

| Security ID | Security Requirement | Unit Test | API Integration Test | Status |
|-------------|---------------------|-----------|---------------------|--------|
| SEC-001 | Password hashing with bcrypt | N/A (service layer) | `[P1-SEC] should not expose password hashes` | ✅ |
| SEC-006 | ORM-based queries (no SQL injection) | `Input Sanitization - Security` | `[P0-SEC-INJ]` | ✅ |
| SEC-014 | Input validation and sanitization | All schema unit tests | `[P0-VAL]` tests | ✅ |
| API-004 | ADMIN_SYSTEM_CONFIG permission required | N/A (middleware) | `[P0-SEC] should require ADMIN_SYSTEM_CONFIG` | ✅ |
| AUTH-001 | Authentication required | N/A (middleware) | `[P0-SEC] should require authentication` | ✅ |

---

## Security Abuse Cases Traceability

| Abuse Case | Description | Unit Test | API Integration Test | Status |
|------------|-------------|-----------|---------------------|--------|
| SQL Injection | SQL injection in name/text fields | `Input Sanitization - Security` | `[P0-SEC-INJ]` | ✅ |
| XSS | Cross-site scripting in name fields | `Input Sanitization - Security` | `[P0-SEC-XSS]` | ✅ |
| Prototype Pollution | __proto__ and constructor manipulation | `Input Sanitization - Security` | `[P0-SEC-PROTO]` | ✅ |
| NoSQL Injection | MongoDB-style operators in strings | N/A | `[P0-SEC-NOSQL]` | ✅ |
| Privilege Escalation | Injecting roles in payload | N/A | `[P0-SEC-PRIV]` | ✅ |
| Password Exposure | Password/hash in response | N/A | `[P1-SEC] password hashes` | ✅ |

---

## Edge Cases and Boundary Tests Traceability

| Edge Case | Description | Unit Test | API Integration Test | Status |
|-----------|-------------|-----------|---------------------|--------|
| Password Min Length | Exactly 8 characters | `SetupUserSchema - Password Validation` | `[P1-EDGE] exact minimum length` | ✅ |
| Password Below Min | 7 characters | `SetupUserSchema - Password Validation` | `[P1-EDGE] below minimum length` | ✅ |
| Invalid Email Format | Missing @ or domain | `SetupUserSchema - Email Validation` | `[P1-EDGE] invalid email format` | ✅ |
| Missing Domain | Email with no domain | `SetupUserSchema - Email Validation` | `[P1-EDGE] missing domain` | ✅ |
| Empty Company Name | Empty string | `SetupCompanySchema` | `[P1-EDGE] empty company name` | ✅ |
| Empty User Name | Empty string | `SetupUserSchema - Name Validation` | `[P1-EDGE] empty user name` | ✅ |
| Whitespace-Only Name | Spaces/tabs only | `SetupUserSchema - Name Validation` | `[P1-EDGE] whitespace-only names` | ✅ |
| Special Characters | International chars in names | `SetupUserSchema - Name Validation` | `[P1-EDGE] special characters` | ✅ |
| Invalid State ID | Non-UUID format | `SetupStoreSchema` | `[P1-EDGE] invalid state_id` | ✅ |
| Non-existent State ID | Valid UUID but not in DB | N/A | `[P1-EDGE] non-existent state_id` | ✅ |
| Various Timezones | Multiple valid IANA zones | `SetupStoreSchema - Timezone Validation` | `[P1-EDGE] valid IANA timezones` | ✅ |
| Invalid Timezone | EST, PST abbreviations | `SetupStoreSchema - Timezone Validation` | `[P0-BR-COS-006]` | ✅ |

---

## Input Validation Tests Traceability

| Validation Type | Description | Unit Test | API Integration Test | Status |
|-----------------|-------------|-----------|---------------------|--------|
| Email Normalization | Lowercase + trim | `SetupUserSchema - Email Validation` | `[P0-VAL] normalize email` | ✅ |
| Name Trimming | Whitespace trimming | `SetupUserSchema - Name Validation` | `[P0-VAL] trim whitespace` | ✅ |
| Required Fields | Missing required data | All schema tests | `[P0-VAL]` tests | ✅ |
| UUID Validation | state_id, county_id format | `SetupStoreSchema` | `[P1-EDGE]` tests | ✅ |
| Enum Validation | Status, POS types | `SetupStoreSchema - Status Validation` | N/A | ✅ |

---

## Test Pyramid Summary

| Test Level | File | Test Count | Purpose |
|------------|------|------------|---------|
| Unit Tests | `tests/unit/schemas/client-owner-setup.schema.test.ts` | ~60 | Fast schema validation (< 1s total) |
| API Integration | `tests/api/client-owner-setup-wizard.api.spec.ts` | ~30 | Full API endpoint testing with database |

---

## Test Coverage by Entity

### User (CLIENT_OWNER)
- ✅ Email validation (format, uniqueness, normalization)
- ✅ Name validation (required, trimming, length)
- ✅ Password validation (all requirements)
- ✅ Role assignment (CLIENT_OWNER only)

### Company
- ✅ Name validation (required, trimming, length)
- ✅ Address validation (structured fields)
- ✅ State/county reference validation

### Store
- ✅ Name validation
- ✅ Timezone validation (IANA format)
- ✅ Address fields validation
- ✅ State/county reference validation
- ✅ Status enum validation
- ✅ POS configuration validation

### Store Login (CLIENT_USER)
- ✅ Email validation
- ✅ Password validation
- ✅ Cross-email uniqueness (vs user, vs manager)

### Store Manager (STORE_MANAGER)
- ✅ Email validation
- ✅ Password validation
- ✅ Cross-email uniqueness (vs user, vs login)
- ✅ Required field enforcement

### Terminals (Optional)
- ✅ Name validation
- ✅ Device ID validation
- ✅ POS type enum validation
- ✅ Connection type enum validation
- ✅ Duplicate device ID detection
- ✅ Maximum count enforcement (10)

---

## Cleanup and Test Isolation

- ✅ Cleanup tracker for created entities
- ✅ `test.afterAll` hook for safety net cleanup
- ✅ Temporary user tracking for setup data
- ✅ Uses `cleanupTestData` helper from `tests/support/cleanup-helper.ts`

---

## Notes

1. **Testing Pyramid**: Unit tests provide the base (fast, isolated), API integration tests provide confidence in the full flow.

2. **Security-First**: All injection and abuse cases are tested at both schema and API levels.

3. **Business Rules**: Each business rule (BR-COS-*) has explicit test coverage with naming conventions.

4. **Deterministic Tests**: Tests use timestamps for unique identifiers and proper cleanup ensures no test pollution.

5. **Enterprise Standards**: Tests align with coding-rules MCP server standards:
   - API-001: VALIDATION
   - SEC-001: PASSWORD_HASHING
   - SEC-006: ORM_QUERIES
   - SEC-014: INPUT_VALIDATION
   - DB-006: TENANT_ISOLATION
