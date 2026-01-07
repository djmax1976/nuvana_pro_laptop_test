# OCR Document Scanning Test Suite

## Overview

Comprehensive enterprise-grade test suite for the OCR document scanning functionality.
Follows the testing pyramid with unit, integration, component, and security tests.

## Test Structure

```
tests/
├── unit/
│   └── services/
│       ├── ocr-service.test.ts           # OCR parsing logic tests
│       ├── image-preprocessing.test.ts   # Image validation & preprocessing
│       └── ocr-edge-cases.test.ts        # Edge cases & boundary conditions
├── integration/
│   └── document-scanning-service.integration.test.ts  # Full workflow tests
├── component/
│   └── document-scanning/
│       └── ScanReportModal.test.tsx      # React component tests
└── security/
    └── ocr-security.test.ts              # Security validation tests
```

## Traceability Matrix

### Requirements → Test Coverage

| Requirement ID | Description | Test File(s) | Test Count |
|---------------|-------------|--------------|------------|
| REQ-OCR-001 | Extract online sales from NET SALES | ocr-service.test.ts | 6 |
| REQ-OCR-002 | Extract online cashes from ONLINE SUMMARY | ocr-service.test.ts | 7 |
| REQ-OCR-003 | Extract instant cashes from INSTANT SUMMARY | ocr-service.test.ts | 6 |
| REQ-OCR-004 | Handle OCR text variations | ocr-service.test.ts | 4 |
| REQ-OCR-005 | Calculate confidence scores | ocr-service.test.ts | 3 |
| REQ-OCR-006 | Handle empty/whitespace text | ocr-edge-cases.test.ts | 3 |
| REQ-OCR-007 | Handle partial extractions | ocr-edge-cases.test.ts | 3 |
| REQ-OCR-008 | Handle very long text | ocr-edge-cases.test.ts | 2 |
| REQ-OCR-009 | Handle special characters | ocr-edge-cases.test.ts | 4 |
| REQ-OCR-010 | Handle multiple match scenarios | ocr-edge-cases.test.ts | 3 |
| REQ-OCR-011 | Handle boundary values | ocr-edge-cases.test.ts | 5 |
| REQ-IMG-001 | Support JPEG, PNG, WebP, TIFF, BMP | image-preprocessing.test.ts | 6 |
| REQ-IMG-002 | Validate file size limits | image-preprocessing.test.ts | 4 |
| REQ-IMG-003 | Apply preprocessing for OCR | image-preprocessing.test.ts | 12 |
| REQ-IMG-004 | Generate SHA-256 hash | image-preprocessing.test.ts | 3 |
| REQ-SCAN-001 | Complete scan workflow | document-scanning-service.integration.test.ts | 8 |
| REQ-SCAN-002 | Document verification workflow | document-scanning-service.integration.test.ts | 2 |
| REQ-SCAN-003 | Document rejection workflow | document-scanning-service.integration.test.ts | 1 |

### Security Requirements → Test Coverage

| Security ID | Description | Test File(s) | Test Count |
|-------------|-------------|--------------|------------|
| SEC-014 | Input validation | ocr-security.test.ts | 25 |
| SEC-015 | File security (magic bytes) | ocr-security.test.ts, image-preprocessing.test.ts | 15 |
| SEC-015 | EXIF stripping | image-preprocessing.test.ts | 2 |
| DB-006 | Tenant isolation | document-scanning-service.integration.test.ts | 2 |
| LM-001 | Audit trail logging | document-scanning-service.integration.test.ts | 2 |
| API-003 | Structured error handling | All test files | 10+ |
| OWASP-001 | File upload validation | ocr-security.test.ts | 8 |
| OWASP-002 | Path traversal prevention | ocr-security.test.ts | 2 |
| OWASP-003 | Content-type spoofing | ocr-security.test.ts | 2 |

### UI Requirements → Test Coverage

| UI ID | Description | Test File(s) | Test Count |
|-------|-------------|--------------|------------|
| UI-001 | Modal states | ScanReportModal.test.tsx | 15 |
| UI-002 | File upload handling | ScanReportModal.test.tsx | 5 |
| UI-003 | Camera capture | ScanReportModal.test.tsx | 1 |
| UI-004 | OCR verification display | ScanReportModal.test.tsx | 5 |
| FE-001 | State management | ScanReportModal.test.tsx | 5 |
| FE-002 | Form validation | ScanReportModal.test.tsx | 5 |

## Testing Pyramid

```
                    ┌─────────────┐
                    │   E2E (0)   │  ← Manual/future
                    ├─────────────┤
                    │Integration  │  ← 25+ tests
                    │  (25+)      │
                    ├─────────────┤
                    │ Component   │  ← 35+ tests
                    │   (35+)     │
                    ├─────────────┤
                    │    Unit     │  ← 80+ tests
                    │   (80+)     │
                    └─────────────┘
```

## Running Tests

### All OCR Tests
```bash
npm run test -- tests/unit/services/ocr*.test.ts tests/unit/services/image*.test.ts tests/integration/document*.test.ts tests/component/document-scanning/*.test.tsx tests/security/ocr*.test.ts
```

### Unit Tests Only
```bash
npm run test -- tests/unit/services/ocr*.test.ts tests/unit/services/image*.test.ts
```

### Integration Tests Only
```bash
npm run test -- tests/integration/document*.test.ts
```

### Component Tests Only
```bash
npm run test -- tests/component/document-scanning/*.test.tsx
```

### Security Tests Only
```bash
npm run test -- tests/security/ocr*.test.ts
```

## Test Data

### Lottery Report Samples
The tests use realistic Georgia Lottery report text patterns:

1. **Clean Report** - Well-recognized text with all fields
2. **OCR Errors Report** - Common misreads (O/0, GASHES/CASHES)
3. **Minimal Values Report** - Small amounts, few transactions
4. **Large Values Report** - High-volume store data
5. **Zero Cashes Report** - Edge case with no redemptions
6. **Missing Sections Report** - Incomplete OCR read
7. **Formatting Issues Report** - Extra whitespace, spacing problems

### Expected Extraction Results
| Report Type | Online Sales | Online Cashes | Instant Cashes |
|------------|--------------|---------------|----------------|
| Clean | 2738.50 | 1857.00 | 1597.00 |
| Minimal | 52.00 | 12.00 | 4.00 |
| Large | 127,485.50 | 45,678.00 | 23,456.00 |
| Zero | 1000.00 | 0.00 | 0.00 |

## Code Coverage Goals

| Category | Target | Current |
|----------|--------|---------|
| Statements | 80% | TBD |
| Branches | 75% | TBD |
| Functions | 80% | TBD |
| Lines | 80% | TBD |

## Best Practices Applied

1. **No Mocked Data** - Uses realistic OCR text patterns
2. **Isolation** - Each test is independent
3. **Descriptive Names** - Tests describe what they verify
4. **AAA Pattern** - Arrange, Act, Assert structure
5. **Error Cases** - Tests both success and failure paths
6. **Boundary Testing** - Tests limits and edge cases
7. **Security First** - Dedicated security test suite
8. **Traceability** - Requirements linked to tests

## Maintenance

### Adding New Tests
1. Identify requirement being tested
2. Add to appropriate test file based on pyramid layer
3. Update traceability matrix in this file
4. Follow existing patterns for consistency

### Updating Patterns
When OCR patterns change in production:
1. Update LOTTERY_REPORT_SAMPLES in test files
2. Add regression tests for fixed issues
3. Document pattern changes

## Files Tested

| Source File | Test File(s) |
|-------------|--------------|
| backend/src/services/ocr/ocr.service.ts | ocr-service.test.ts, ocr-edge-cases.test.ts |
| backend/src/services/ocr/image-preprocessing.service.ts | image-preprocessing.test.ts |
| backend/src/services/ocr/document-scanning.service.ts | document-scanning-service.integration.test.ts |
| backend/src/types/document-scanning.types.ts | ocr-security.test.ts |
| src/components/document-scanning/ScanReportModal.tsx | ScanReportModal.test.tsx |
