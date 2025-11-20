# Test Strategy

## Overview
This document outlines our testing strategy to prevent infrastructure, UX, and accessibility issues from reaching development or production.

## Test Categories

### P0 - Critical (Must Pass)
Tests that verify core functionality and prevent show-stopping bugs:
- Server startup and port configuration
- CORS configuration
- Mobile sidebar interaction (overlay click, content access)
- Accessibility requirements (screen reader support)
- Basic navigation flows

### P1 - Important (Should Pass)
Tests that verify important features and edge cases:
- Responsive design behavior
- Navigation interactions
- Environment variable handling
- HTTP method support

### P2 - Nice to Have
Tests for enhancements and edge cases

## Test Structure

```
tests/
├── api/                          # API & Infrastructure tests
│   ├── infrastructure.api.spec.ts  # Port, CORS, server startup
│   └── backend-setup.api.spec.ts   # Existing API tests
├── e2e/                          # End-to-end tests
│   ├── mobile-sidebar.spec.ts     # Mobile UX interactions
│   └── health-check.spec.ts       # Existing E2E tests
└── component/                    # Component unit tests
    ├── DashboardLayout.test.tsx   # Layout accessibility
    └── ContactForm.test.tsx       # Existing component tests
```

## Running Tests

### Quick Smoke Test (Run Before Committing)
```bash
npm run test:smoke
```
Runs all P0 infrastructure tests to ensure servers start correctly.

### Full P0 Suite
```bash
npm run test:p0
```
Runs all P0 tests across API and E2E.

### Specific Test Suites
```bash
# Infrastructure (ports, CORS, servers)
npm run test:api:infrastructure

# Mobile sidebar interactions
npm run test:e2e:mobile

# Component accessibility
npm run test:component:layout

# All component tests
npm run test:component
```

### Watch Mode (Development)
```bash
# Component tests with hot reload
npm run test:component -- --watch

# E2E tests with UI
npm run test:e2e:ui
```

## What These Tests Prevent

### Infrastructure Tests (`infrastructure.api.spec.ts`)
**Prevents:**
- Port conflicts between frontend/backend
- CORS misconfiguration blocking API calls
- Server startup failures
- Missing environment variables

**Would Have Caught:**
- ✅ Backend and frontend fighting for port 3001
- ✅ CORS errors preventing login
- ✅ Connection leaks causing crashes

### Mobile Sidebar Tests (`mobile-sidebar.spec.ts`)
**Prevents:**
- Overlay blocking content interaction
- Sidebar not closing on outside click
- Navigation links not working on mobile
- Missing responsive behavior

**Would Have Caught:**
- ✅ Overlay blocking content when sidebar is visible
- ✅ Users unable to interact with content on mobile

### Accessibility Tests (`DashboardLayout.test.tsx`)
**Prevents:**
- Missing screen reader labels
- Dialog without title/description
- Non-compliant ARIA attributes
- Console warnings from Radix UI

**Would Have Caught:**
- ✅ Missing DialogTitle and DialogDescription warnings
- ✅ Accessibility violations for screen readers

## CI/CD Integration

### Pre-commit Hook
```bash
# Add to .husky/pre-commit or package.json
npm run test:smoke
```

### GitHub Actions / CI Pipeline
```yaml
- name: Run P0 Tests
  run: npm run test:p0

- name: Run Full Test Suite
  run: |
    npm run test:component
    npm run test:api
    npm run test:e2e
```

## Test-Driven Development Workflow

### For New Features
1. **Write tests first** (Red)
   - Infrastructure test if adding new endpoints
   - E2E test for user interactions
   - Component test for UI changes

2. **Implement feature** (Green)
   - Make tests pass

3. **Refactor** (Refactor)
   - Clean up code while keeping tests green

### For Bug Fixes
1. **Reproduce bug with a failing test**
2. **Fix the bug**
3. **Verify test now passes**
4. **Add to regression suite**

## Test Coverage Goals

| Category | Current | Target |
|----------|---------|--------|
| Infrastructure | ✅ 100% | 100% |
| CORS | ✅ 100% | 100% |
| Mobile Sidebar | ✅ 90% | 100% |
| Accessibility | ✅ 80% | 100% |
| API Endpoints | 📊 60% | 90% |
| E2E User Flows | 📊 40% | 80% |

## Common Test Patterns

### Testing Mobile Behavior
```typescript
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
});
```

### Testing Accessibility
```typescript
// Check for accessible dialog
const dialog = screen.getByRole('dialog', { name: /navigation menu/i });
expect(dialog).toBeInTheDocument();
```

### Testing CORS
```typescript
const response = await request.fetch(url, {
  headers: { 'Origin': 'http://localhost:3000' }
});
expect(response.headers()['access-control-allow-origin']).toBe('http://localhost:3000');
```

## Troubleshooting Failed Tests

### "Port already in use"
- Kill existing dev servers: `npm run dev` (new launcher handles this)
- Or manually: `npx kill-port 3000 3001`

### "Dialog not found" in E2E tests
- Ensure dev server is running
- Check viewport size is set correctly for mobile tests

### Component tests failing
- Clear test cache: `npx vitest run --clearCache`
- Check for stale mocks

## Next Steps

1. **Add visual regression tests** (Percy, Chromatic)
2. **Add performance tests** (Lighthouse CI)
3. **Add security tests** (OWASP ZAP)
4. **Add load tests** (k6, Artillery)
