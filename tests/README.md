# Test Suite Documentation

This directory contains the automated test suite for the Nuvana project backend API.

## Test Structure

```
tests/
├── e2e/                   # End-to-end tests (full user workflows)
├── api/                   # API integration tests
│   ├── backend-setup.api.spec.ts      # Backend infrastructure tests
│   ├── database-setup/                # Database and Prisma tests (split by concern)
│   │   ├── prisma-config.api.spec.ts      # Prisma Client configuration
│   │   ├── schema-validation.api.spec.ts  # Schema validation tests
│   │   ├── migrations.api.spec.ts        # Migration tests
│   │   └── indexes.api.spec.ts            # Index validation tests
│   ├── error-handling.api.spec.ts      # Error scenarios and negative paths
│   ├── edge-cases.api.spec.ts         # Edge cases and boundary conditions
│   ├── redis-rabbitmq-configuration.api.spec.ts  # Redis and RabbitMQ integration tests
│   └── supabase-oauth-integration.api.spec.ts    # Supabase OAuth authentication tests
├── support/
│   ├── fixtures/          # Test fixtures (setup/teardown)
│   │   ├── index.ts                  # Central export for all fixtures
│   │   ├── backend.fixture.ts         # Backend API request fixtures
│   │   └── database.fixture.ts        # Database and Prisma fixtures
│   ├── factories/         # Data factories for test data
│   │   ├── index.ts                  # Central export for all factories
│   │   ├── database.factory.ts        # User, Company, Store factories
│   │   ├── server.factory.ts          # Health check and error response factories
│   │   ├── redis.factory.ts           # Redis connection factories
│   │   └── rabbitmq.factory.ts        # RabbitMQ connection factories
│   └── helpers/           # Pure utility functions
│       ├── index.ts                  # Central export for all helpers
│       └── server-helpers.ts          # Server validation helpers
```

## Running Tests

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Ensure backend server is running or will be started automatically:
   ```bash
   cd backend && npm run dev
   ```

### Test Execution

```bash
# Run E2E tests
npm run test:e2e              # Run all end-to-end tests
npm run test:e2e:ui           # Run E2E tests in UI mode

# Run API tests
npm run test:api               # Run all API tests
npm run test:api:p0            # Critical paths only (P0)
npm run test:api:p1            # P0 + P1 tests (high priority)
npm run test:api:p2            # P0 + P1 + P2 tests (medium priority)

# Run specific file
npm run test:api -- backend-setup.api.spec.ts

# Run in headed mode (with browser)
npm run test:api -- --headed

# Debug specific test
npm run test:api -- backend-setup.api.spec.ts --debug

# Run with UI mode
npm run test:api:ui            # Run API tests in UI mode
```

## Priority Tags

Tests are tagged with priority levels to enable selective execution:

- **[P0]**: Critical paths, run every commit
  - Health check endpoints
  - Security headers
  - Server startup

- **[P1]**: High priority, run on PR to main
  - CORS middleware
  - Rate limiting
  - API endpoint validation

- **[P2]**: Medium priority, run nightly
  - Graceful shutdown
  - Edge cases

- **[P3]**: Low priority, run on-demand
  - Nice-to-have validations

## Test Patterns

### Given-When-Then Format

All tests follow the Given-When-Then structure:

```typescript
test('[P0] should return health status', async ({ apiRequest }) => {
  // GIVEN: Backend server is running
  // WHEN: Health check endpoint is called
  const response = await apiRequest.get('/health');

  // THEN: Response is 200 OK
  expect(response.status()).toBe(200);
});
```

### Using Fixtures

Tests use fixtures for consistent setup. Import from the central index:

```typescript
// Import from central index (recommended)
import { test, expect } from './support/fixtures';

// Or import specific fixture (if needed)
import { test, expect } from './support/fixtures/backend.fixture';

test('example', async ({ apiRequest, backendUrl }) => {
  // apiRequest provides helper methods
  const response = await apiRequest.get('/health');
});
```

### Using Factories

Use factories for test data generation. Import from the central index:

```typescript
// Import from central index (recommended)
import { createHealthCheckResponse, createUser } from './support/factories';

// Or import specific factory (if needed)
import { createHealthCheckResponse } from './support/factories/server.factory';

const healthData = createHealthCheckResponse({ status: 'ok' });
const userData = createUser({ email: 'test@example.com' });
```

### Using Helpers

Import helper functions from the central index:

```typescript
import { validateHealthCheckResponse, validateCorsHeaders } from './support/helpers';

const isValid = validateHealthCheckResponse(responseBody);
```

## Test Quality Standards

All tests must follow these standards:

- ✅ **Given-When-Then format**: Clear test structure
- ✅ **Priority tags**: Every test has [P0], [P1], [P2], or [P3] tag
- ✅ **One assertion per test**: Atomic tests
- ✅ **No hard waits**: Use explicit waits (`waitForResponse`)
- ✅ **Self-cleaning**: Fixtures handle cleanup automatically
- ✅ **Deterministic**: No flaky patterns
- ✅ **Fast**: Tests complete in under 1.5 minutes
- ✅ **Lean**: Test files under 300 lines

## Forbidden Patterns

❌ **Hard waits**: `await page.waitForTimeout(2000)`
❌ **Conditional flow**: `if (await element.isVisible()) { ... }`
❌ **Try-catch for flow control**: Use for cleanup only
❌ **Hardcoded test data**: Use factories instead
❌ **Shared state between tests**: Each test is isolated

## Common Patterns

### Network-First Pattern

Intercept routes BEFORE navigation to prevent race conditions:

```typescript
test('should load data', async ({ page }) => {
  // CRITICAL: Intercept BEFORE navigate
  await page.route('**/api/data', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ data: 'test' }) })
  );

  // NOW navigate
  await page.goto('/dashboard');
});
```

### API Testing Pattern

```typescript
test('[P1] POST /api/users should create user', async ({ apiRequest }) => {
  // GIVEN: User data
  const userData = createUser({ email: 'test@example.com' });

  // WHEN: Creating user via API
  const response = await apiRequest.post('/api/users', userData);

  // THEN: User is created
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body).toHaveProperty('id');
});
```

## Environment Variables

Tests use the following environment variables:

- `BACKEND_URL`: Backend server URL (default: `http://localhost:3001`)
- `CI`: Set to `true` in CI environments (enables retries, disables video)

## CI Integration

Tests run automatically in CI with:

- 2 retries on failure
- HTML report generation
- JUnit XML output for test reporting tools
- Artifacts (traces, screenshots, videos) on failure

## Troubleshooting

### Tests fail with connection errors

1. Ensure backend server is running: `cd backend && npm run dev`
2. Check `BACKEND_URL` environment variable matches server port
3. Verify firewall/network settings

### Tests are flaky

1. Check for hard waits (`waitForTimeout`) - replace with explicit waits
2. Verify network-first pattern is used (intercept before navigate)
3. Check for race conditions in parallel test execution

### Tests timeout

1. Increase timeout in `playwright.config.ts` if needed
2. Check server response times
3. Verify network conditions

## Test Coverage

### Current Coverage

- **Backend Infrastructure**: Health checks, CORS, security headers, rate limiting
- **Database Setup**: Prisma Client, schema validation, migrations, indexes
- **Error Handling**: 404 responses, invalid methods, malformed requests
- **Edge Cases**: Empty values, special characters, boundary conditions, concurrent requests

### Test Files

1. **backend-setup.api.spec.ts** (156 lines)
   - Health check endpoint (P0)
   - CORS middleware (P1)
   - Security headers (P0)
   - Rate limiting (P1)
   - Server configuration (P0, P2)

2. **database-setup/** (4 files, 421 lines total)
   - **prisma-config.api.spec.ts** (70 lines) - Prisma Client configuration (P0)
   - **schema-validation.api.spec.ts** (216 lines) - Schema validation (P0, P1)
   - **migrations.api.spec.ts** (37 lines) - Migrations (P0, P1)
   - **indexes.api.spec.ts** (98 lines) - Indexes (P1)

3. **error-handling.api.spec.ts** (180 lines)
   - 404 Not Found scenarios (P1)
   - Invalid HTTP methods (P1)
   - Malformed requests (P1)
   - Request size limits (P2)
   - CORS error scenarios (P1)
   - Server error handling (P1)

4. **edge-cases.api.spec.ts** (200 lines)
   - Empty and null values (P2)
   - Special characters (P2)
   - Boundary values (P2)
   - HTTP headers (P2)
   - Concurrent requests (P2)
   - Response format validation (P2)

5. **supabase-oauth-integration.api.spec.ts** (496 lines)
   - OAuth callback endpoint (P0, P1)
   - Token validation middleware (P0, P1)
   - User service - getUserOrCreate (P0, P1)
   - CSRF protection (state parameter validation) (P1)
   - Edge cases: malformed tokens, concurrent requests, missing claims (P1)

6. **e2e/supabase-oauth-login.spec.ts** (203 lines)
   - OAuth login flow (P0, P1)
   - Session management (P0, P1)
   - Error handling (P0)
   - Network timeout scenarios (P1)
   - Multiple login attempts prevention (P1)
   - Session persistence (P1)

### Priority Breakdown

- **P0 (Critical)**: 22 tests - Health checks, security, database connection, OAuth authentication
- **P1 (High)**: 38 tests - Error handling, CORS, rate limiting, schema validation, OAuth edge cases
- **P2 (Medium)**: 18 tests - Edge cases, boundary conditions, concurrent requests

**Total**: 78 tests across 6 test files (API: 70 tests, E2E: 8 tests)

### Homepage Tests (NEW)

7. **e2e/homepage.spec.ts** (8 tests, 145 lines)
   - Homepage hero section display (P0)
   - Pain points section visibility (P0)
   - Scroll to contact form (P1)
   - Contact form fields display (P1)
   - Benefits section display (P1)
   - Key statistics display (P2)
   - Dashboard navigation (P1)
   - Responsive layout (P2)

8. **e2e/homepage-contact-form.spec.ts** (6 tests, 140 lines)
   - Form submission with valid data (P0)
   - Required field validation (P1)
   - Email format validation (P1)
   - Submit button loading state (P1)
   - Form field clearing after submission (P2)
   - Error message display (P1)

9. **component/ContactForm.test.tsx** (7 tests, 95 lines)
   - Form field rendering (P1)
   - Form state updates (P1)
   - Submit button enable/disable (P1)
   - Loading state during submission (P1)
   - Success message display (P1)
   - Form field clearing (P1)
   - Required field indicators (P2)

**Updated Total**: 99 tests across 9 test files (API: 70 tests, E2E: 22 tests, Component: 7 tests)

## Next Steps

- Add more API endpoint tests as features are implemented
- Expand factory coverage for different data types
- Add unit tests for utility functions when created
- Set up test coverage reporting
- Integrate contact form backend API endpoint

