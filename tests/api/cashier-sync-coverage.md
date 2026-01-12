# Cashier Sync Feature - Test Coverage & Traceability

## Feature Overview

The Cashier Sync feature enables desktop POS applications to synchronize cashier data (including bcrypt-hashed PINs) for offline authentication. This follows enterprise POS patterns used by NCR Aloha, Microsoft Dynamics 365, and Oracle MICROS.

## Implementation Files

| File | Purpose | Lines |
|------|---------|-------|
| `backend/src/services/api-key/cashier-sync.service.ts` | Core sync service logic | 347 |
| `backend/src/routes/device-api.ts` | API endpoint handler | 843 |
| `backend/src/types/api-key.types.ts` | Type definitions | 901 |
| `backend/src/schemas/api-key.schema.ts` | Input validation schemas | 437 |
| `backend/src/services/api-key/api-key-audit.service.ts` | Audit logging (extended) | 345+ |
| `backend/src/services/api-key/index.ts` | Module exports | 12 |

## Test Files

| File | Test Type | Test Count | Priority Coverage |
|------|-----------|------------|-------------------|
| `tests/unit/cashier-sync-service.unit.spec.ts` | Unit | 25 | P0-P2 |
| `tests/api/cashier-sync.api.spec.ts` | Integration | 20 | P0-P2 |
| `tests/api/cashier-sync-security.api.spec.ts` | Security | 20 | P0-P1 |
| `tests/api/cashier-sync-edge-cases.api.spec.ts` | Edge Cases | 20 | P1-P2 |

## Test Coverage Matrix

### Unit Tests (cashier-sync-service.unit.spec.ts)

| Test ID | Description | Category | Priority |
|---------|-------------|----------|----------|
| CSYNC-U-001 | Session validation - valid session | Validation | P0 |
| CSYNC-U-002 | Session validation - not found | Validation | P0 |
| CSYNC-U-003 | Session validation - wrong owner | Security | P0 |
| CSYNC-U-004 | Session validation - inactive session | Validation | P0 |
| CSYNC-U-005 | Session validation - expired session | Validation | P0 |
| CSYNC-U-006 | Get cashiers - store isolation | Security | P0 |
| CSYNC-U-007 | Get cashiers - delta sync timestamp | Business | P1 |
| CSYNC-U-008 | Get cashiers - delta sync sequence | Business | P1 |
| CSYNC-U-009 | Get cashiers - include inactive | Business | P1 |
| CSYNC-U-010 | Get cashiers - exclude inactive default | Business | P1 |
| CSYNC-U-011 | Get cashiers - pagination limit | Business | P1 |
| CSYNC-U-012 | Get cashiers - max limit enforcement | Validation | P1 |
| CSYNC-U-013 | Get cashiers - hasMore flag true | Business | P2 |
| CSYNC-U-014 | Get cashiers - hasMore flag false | Business | P2 |
| CSYNC-U-015 | Get cashiers - sync sequence generation | Business | P1 |
| CSYNC-U-016 | Get cashiers - next cursor calculation | Business | P2 |
| CSYNC-U-017 | Get cashiers - PIN hash included | Security | P0 |
| CSYNC-U-018 | Get cashiers - empty store | Edge Case | P2 |
| CSYNC-U-019 | Store mismatch detection | Security | P0 |
| CSYNC-U-020 | Sync stats calculation | Business | P2 |
| CSYNC-U-021 | Get by employee ID - found | Business | P1 |
| CSYNC-U-022 | Get by employee ID - not found | Business | P1 |
| CSYNC-U-023 | Sync response structure | Contract | P0 |
| CSYNC-U-024 | Cashier record structure | Contract | P0 |
| CSYNC-U-025 | Server time in response | Contract | P1 |

### Integration Tests (cashier-sync.api.spec.ts)

| Test ID | Description | Category | Priority |
|---------|-------------|----------|----------|
| CSYNC-API-001 | Successful cashier sync with valid key | Happy Path | P0 |
| CSYNC-API-002 | Returns correct response structure | Contract | P0 |
| CSYNC-API-003 | Requires valid API key | Security | P0 |
| CSYNC-API-004 | Requires valid sync session | Security | P0 |
| CSYNC-API-005 | Session must belong to API key | Security | P0 |
| CSYNC-API-006 | Enforces store isolation | Security | P0 |
| CSYNC-API-007 | Validates session_id format | Validation | P1 |
| CSYNC-API-008 | Delta sync by since_timestamp | Business | P1 |
| CSYNC-API-009 | Delta sync by since_sequence | Business | P1 |
| CSYNC-API-010 | Include inactive cashiers | Business | P1 |
| CSYNC-API-011 | Pagination with limit | Business | P1 |
| CSYNC-API-012 | Rejects invalid limit values | Validation | P2 |
| CSYNC-API-013 | Includes PIN hash in response | Security | P0 |
| CSYNC-API-014 | Handles empty store | Edge Case | P2 |
| CSYNC-API-015 | Returns server time | Contract | P1 |
| CSYNC-API-016 | Invalid API key returns 401 | Security | P0 |
| CSYNC-API-017 | Expired API key returns 401 | Security | P0 |
| CSYNC-API-018 | Revoked API key returns 401 | Security | P0 |
| CSYNC-API-019 | Rate limiting enforcement | Security | P1 |
| CSYNC-API-020 | Audit logging of sync operations | Compliance | P1 |

### Security Tests (cashier-sync-security.api.spec.ts)

| Test ID | OWASP Category | Threat | Priority |
|---------|----------------|--------|----------|
| CSYNC-SEC-001 | A01:2021 Broken Access Ctrl | Missing Auth | P0 |
| CSYNC-SEC-002 | A01:2021 Broken Access Ctrl | Invalid API Key | P0 |
| CSYNC-SEC-003 | A01:2021 Broken Access Ctrl | Revoked API Key | P0 |
| CSYNC-SEC-004 | A01:2021 Broken Access Ctrl | Expired API Key | P0 |
| CSYNC-SEC-005 | A01:2021 Broken Access Ctrl | Suspended API Key | P0 |
| CSYNC-SEC-006 | A01:2021 Broken Access Ctrl | Cross-Store Access | P0 |
| CSYNC-SEC-007 | A01:2021 Broken Access Ctrl | Cross-Session Access | P0 |
| CSYNC-SEC-008 | A01:2021 Broken Access Ctrl | Session Hijacking | P0 |
| CSYNC-SEC-009 | A03:2021 Injection | SQL Injection session_id | P0 |
| CSYNC-SEC-010 | A03:2021 Injection | SQL Injection timestamp | P0 |
| CSYNC-SEC-011 | A03:2021 Injection | SQL Injection limit | P0 |
| CSYNC-SEC-012 | A03:2021 Injection | NoSQL/JSON Injection | P0 |
| CSYNC-SEC-013 | A04:2021 Insecure Design | IDOR via session_id | P0 |
| CSYNC-SEC-014 | A04:2021 Insecure Design | Enum of cashier data | P1 |
| CSYNC-SEC-015 | A05:2021 Security Misconfig | Verbose Error Messages | P1 |
| CSYNC-SEC-016 | A07:2021 Auth Failures | Brute Force Prevention | P1 |
| CSYNC-SEC-017 | A07:2021 Auth Failures | Rate Limiting | P1 |
| CSYNC-SEC-018 | A09:2021 Security Logging | Audit Trail | P1 |
| CSYNC-SEC-019 | PIN Hash Security | No Plain PIN in Transit | P0 |
| CSYNC-SEC-020 | PIN Hash Security | Bcrypt Cost Factor | P0 |

### Edge Case Tests (cashier-sync-edge-cases.api.spec.ts)

| Test ID | Scenario | Category | Priority |
|---------|----------|----------|----------|
| CSYNC-EDGE-001 | Empty store (0 cashiers) | Empty State | P1 |
| CSYNC-EDGE-002 | Large store (500+ cashiers) | Scale | P1 |
| CSYNC-EDGE-003 | All cashiers inactive | Data State | P1 |
| CSYNC-EDGE-004 | Limit = 1 (minimum) | Boundary | P2 |
| CSYNC-EDGE-005 | Limit = 500 (maximum) | Boundary | P2 |
| CSYNC-EDGE-006 | since_timestamp = very old | Boundary | P2 |
| CSYNC-EDGE-007 | since_timestamp = future | Boundary | P2 |
| CSYNC-EDGE-008 | since_sequence = 0 | Boundary | P2 |
| CSYNC-EDGE-009 | since_sequence = very large | Boundary | P2 |
| CSYNC-EDGE-010 | Concurrent sync requests | Concurrency | P1 |
| CSYNC-EDGE-011 | Session near expiry | Timing | P2 |
| CSYNC-EDGE-012 | Cashier with null fields | Data State | P2 |
| CSYNC-EDGE-013 | Cashier with max length name | Boundary | P2 |
| CSYNC-EDGE-014 | Special characters in cashier name | Data | P2 |
| CSYNC-EDGE-015 | Unicode characters in cashier name | Data | P2 |
| CSYNC-EDGE-016 | Multiple pages of results | Pagination | P1 |
| CSYNC-EDGE-017 | Exactly limit results | Pagination | P2 |
| CSYNC-EDGE-018 | Database connection failure | Failure | P1 |
| CSYNC-EDGE-019 | Timeout during large sync | Failure | P1 |
| CSYNC-EDGE-020 | Malformed JSON in metadata | Data | P2 |

## Coverage Summary

| Category | P0 Tests | P1 Tests | P2 Tests | Total |
|----------|----------|----------|----------|-------|
| Unit | 10 | 9 | 6 | 25 |
| Integration | 9 | 7 | 4 | 20 |
| Security | 14 | 6 | 0 | 20 |
| Edge Cases | 0 | 8 | 12 | 20 |
| **Total** | **33** | **30** | **22** | **85** |

## Security Controls Implemented

1. **Authentication**: API key required via `X-API-Key` header
2. **Authorization**: Store isolation via API key binding
3. **Session Validation**: Session ownership and expiry checks
4. **Input Validation**: Zod schemas for all parameters
5. **Injection Prevention**: Parameterized queries via Prisma
6. **Rate Limiting**: Configurable per API key
7. **Audit Logging**: All sync operations logged

## API Endpoint

```
GET /api/v1/sync/cashiers
```

**Query Parameters:**
- `session_id` (required): UUID - Sync session ID from /sync/start
- `since_timestamp` (optional): ISO 8601 datetime for delta sync
- `since_sequence` (optional): Integer for cursor-based pagination
- `include_inactive` (optional): Boolean to include soft-deleted cashiers
- `limit` (optional): Integer 1-500 (default: 100)

**Headers:**
- `X-API-Key`: Required API key

**Response:**
```json
{
  "success": true,
  "data": {
    "cashiers": [
      {
        "cashierId": "uuid",
        "employeeId": "0001",
        "name": "John Doe",
        "pinHash": "$2a$10$...",
        "isActive": true,
        "disabledAt": null,
        "updatedAt": "2024-01-15T12:00:00.000Z",
        "syncSequence": 1
      }
    ],
    "totalCount": 1,
    "currentSequence": 1,
    "hasMore": false,
    "serverTime": "2024-01-15T12:00:00.000Z",
    "nextCursor": null
  }
}
```

## Enterprise Compliance

This implementation follows enterprise POS patterns:
- **NCR Aloha**: Employee sync with local PIN storage
- **Microsoft Dynamics 365 Commerce**: Offline employee authentication
- **Oracle MICROS**: Store-bound employee data sync
- **Toast/Square**: Secure PIN hash transmission

## Running Tests

```bash
# Unit tests
npm run test:unit -- --grep "Cashier Sync"

# Integration tests
npm run test:api -- --grep "CASHIER-SYNC"

# Security tests
npm run test:api -- --grep "CSYNC-SEC"

# Edge case tests
npm run test:api -- --grep "CSYNC-EDGE"

# All cashier sync tests
npm run test -- --grep "cashier-sync"
```
