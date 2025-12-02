# Testing Strategy

This document outlines the testing strategy for Nuvana Pro, following industry best practices for the testing pyramid.

## Testing Pyramid

```
           /\
          /  \       E2E Tests (5-10%)
         /    \      Critical user journeys only
        /------\
       /        \    Integration Tests (20-30%)
      /          \   API endpoints, middleware, auth
     /------------\
    /              \  Component/Unit Tests (60-70%)
   /                \ UI components, utilities, business logic
  /------------------\
```

## Test Types

### 1. Component Tests (`tests/component/`)

**Purpose**: Test UI component behavior in isolation

**Tools**: Vitest + React Testing Library

**What to test**:
- Component rendering
- User interactions (clicks, inputs)
- State changes
- Callback invocations
- Accessibility attributes

**What NOT to test**:
- Browser-specific behavior (use E2E for that)
- Backend integration
- Real authentication

**Example tests**:
- `Sidebar.test.tsx` - Navigation items, mobile collapse callback
- `ThemeToggle.test.tsx` - Theme switching behavior

**Running**:
```bash
npm run test:component
```

### 2. Integration Tests (`tests/api/`)

**Purpose**: Test API endpoints with real database

**Tools**: Playwright API testing + Prisma

**What to test**:
- API request/response structure
- Authorization (RBAC)
- Database operations
- Business logic
- Error handling

**Example tests**:
- Store CRUD operations
- User management
- Shift lifecycle
- Transaction processing

**Running**:
```bash
npm run test:api
```

### 3. E2E Tests (`tests/e2e/`)

**Purpose**: Test critical user journeys end-to-end

**Tools**: Playwright browser automation

**What to test**:
- Complete user workflows (login → action → verification)
- Cross-page navigation
- Real authentication flows
- Data persistence across sessions

**What NOT to test**:
- Individual UI components (use component tests)
- API responses (use integration tests)
- Styling/visual regression (use visual testing tools)

**Example tests**:
- `client-dashboard-flow.spec.ts` - Login → Dashboard → Data visibility
- `store-management.spec.ts` - Store CRUD with real login
- `company-management.spec.ts` - Company management workflow

**Running**:
```bash
npm run test:e2e
```

## Key Principles

### 1. No Mocking Auth in E2E Tests

E2E tests must use real authentication:
- Use JWT cookies with valid tokens
- Let `/api/auth/me` endpoint validate tokens
- Never use `page.route()` to mock auth responses

**Why**: Mocking auth defeats the purpose of E2E testing. You're not testing the real system.

### 2. Test at the Right Level

| Behavior | Test Type |
|----------|-----------|
| Button click toggles state | Component |
| Sidebar navigation items | Component |
| Dark mode toggle | Component |
| API returns correct data | Integration |
| Role-based access control | Integration |
| Login → Dashboard → Action | E2E |
| Data isolation between users | E2E |

### 3. E2E Tests Should Be Rare and Valuable

Each E2E test should:
- Cover a critical user journey
- Test integration that can't be tested at lower levels
- Have clear business value
- Be worth the maintenance cost

### 4. Fixtures Create Real Data

Test fixtures should:
- Create real users with real password hashes
- Create real JWT tokens (not mocks)
- Use the actual authentication system
- Clean up data after tests

## Files Removed (and Why)

The following E2E tests were removed because they were testing UI behavior that should be component tests:

| Removed File | Reason | Replaced By |
|--------------|--------|-------------|
| `mobile-sidebar.spec.ts` | Tests sidebar toggle behavior | `Sidebar.test.tsx` |
| `dark-mode-toggle.spec.ts` | Tests theme toggle | `ThemeToggle.test.tsx` |
| `basic-ui-layout-and-navigation.spec.ts` | Tests nav items exist | `Sidebar.test.tsx` |
| `mobile-alert-dialog.spec.ts` | Tests dialog rendering | Component test (todo) |
| `admin-role-creation-authorization.spec.ts` | Mocked auth entirely | Integration test |
| `admin-user-management.spec.ts` | Mocked auth entirely | Integration test |
| `transaction-display-ui.spec.ts` | UI rendering only | Component test (todo) |
| `cashier-shift-start.spec.ts` | Mocked auth, UI testing | Component test (todo) |

## Running Tests

```bash
# All tests
npm test

# Component tests only
npm run test:component

# API/Integration tests only
npm run test:api

# E2E tests only
npm run test:e2e

# Watch mode (component tests)
npm run test:component -- --watch
```

## Writing New Tests

### When to Write a Component Test

- Testing a React component
- Testing UI interactions
- Testing rendering logic
- Testing callback behavior

### When to Write an Integration Test

- Testing an API endpoint
- Testing RBAC/permissions
- Testing database operations
- Testing business logic

### When to Write an E2E Test

- Testing a complete user journey
- Testing cross-page workflows
- Testing real authentication
- Testing data isolation between users

## Test File Naming

- Component tests: `ComponentName.test.tsx`
- Integration tests: `feature-name.api.spec.ts`
- E2E tests: `feature-name.spec.ts`

## Test Organization

```
tests/
├── component/           # React component tests
│   ├── Sidebar.test.tsx
│   └── ThemeToggle.test.tsx
├── api/                 # API integration tests
│   ├── stores.api.spec.ts
│   └── users.api.spec.ts
├── e2e/                 # End-to-end tests
│   ├── client-dashboard-flow.spec.ts
│   └── store-management.spec.ts
└── support/             # Test utilities and fixtures
    ├── fixtures/
    ├── factories/
    └── test-utils.tsx
```
