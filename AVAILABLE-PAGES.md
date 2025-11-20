# Available Pages & Routes

## Frontend Pages (Next.js App)

### Public Pages
1. **Home Page** - `http://localhost:3000/`
   - Welcome page for Nuvana Pro
   - Landing page with basic information

2. **Login Page** - `http://localhost:3000/login`
   - Email/password authentication
   - Sign in form for user credentials
   - Error handling for failed authentication

### Protected Dashboard Pages (Requires Authentication)
All dashboard pages are under `/dashboard` route group:

4. **Dashboard Home** - `http://localhost:3000/dashboard`
   - Main dashboard page
   - Welcome message and placeholder content

5. **Companies** - `http://localhost:3000/dashboard/companies`
   - Company management (listed in sidebar, page may need to be created)

6. **Stores** - `http://localhost:3000/dashboard/stores`
   - Store management (listed in sidebar, page may need to be created)

7. **Shifts** - `http://localhost:3000/dashboard/shifts`
   - Shift management (listed in sidebar, page may need to be created)

8. **Inventory** - `http://localhost:3000/dashboard/inventory`
   - Inventory management (listed in sidebar, page may need to be created)

9. **Lottery** - `http://localhost:3000/dashboard/lottery`
   - Lottery pack management (listed in sidebar, page may need to be created)

10. **Reports** - `http://localhost:3000/dashboard/reports`
    - Reports and analytics (listed in sidebar, page may need to be created)

11. **AI Assistant** - `http://localhost:3000/dashboard/ai`
    - AI assistant interface (listed in sidebar, page may need to be created)

## Backend API Endpoints

### Health & Status
- **GET** `http://localhost:3001/health`
  - Basic health check
  - Returns: `{"status":"ok","timestamp":"..."}`

- **GET** `http://localhost:3001/api/health`
  - Detailed health check with service status
  - Checks Redis and RabbitMQ connectivity
  - Returns service health information

### Authentication Endpoints
- **POST** `http://localhost:3001/api/auth/refresh`
  - Refresh access token
  - Uses refresh token from cookie
  - Returns new token pair

- **GET** `http://localhost:3001/api/auth/me`
  - Get current user information
  - Requires authentication (JWT token in cookie)
  - Returns user ID, email, roles, and permissions

### Admin Endpoints (Requires Authentication & Permissions)
- **GET** `http://localhost:3001/api/admin/system-config`
  - System configuration access
  - Requires: `ADMIN_SYSTEM_CONFIG` permission

- **GET** `http://localhost:3001/api/admin/audit-logs`
  - View audit logs
  - Requires: `ADMIN_AUDIT_VIEW` permission

## Quick Access URLs

### Frontend
- Home: http://localhost:3000
- Login: http://localhost:3000/login
- Dashboard: http://localhost:3000/dashboard

### Backend API
- Health Check: http://localhost:3001/health
- Detailed Health: http://localhost:3001/api/health
- User Info (requires auth): http://localhost:3001/api/auth/me

## Testing the Pages

### 1. Test Home Page
```bash
# Open in browser or use curl
curl http://localhost:3000
```

### 2. Test Login Page
```bash
# Open in browser
http://localhost:3000/login
```

### 3. Test Backend Health
```bash
# Basic health
curl http://localhost:3001/health

# Detailed health with services
curl http://localhost:3001/api/health
```

### 4. Test Dashboard (requires authentication)
1. Go to http://localhost:3000/login
2. Enter your email and password credentials
3. After successful authentication, you'll be redirected to http://localhost:3000/dashboard

## E2E Test Coverage Status

### Fully Tested Features (with comprehensive E2E tests)

1. **Client Management** - `tests/e2e/client-management.spec.ts`
   - ✅ P0: Load clients list, navigate to detail, edit name/status, edit metadata, create client
   - ✅ P0: Prevent deletion of ACTIVE clients
   - ✅ P1: Validation errors (empty name, invalid JSON metadata)
   - ✅ P1: Mobile responsiveness, cancel without saving, delete INACTIVE client

2. **Company Management** - `tests/e2e/company-management.spec.ts`
   - ✅ P0: Load companies list, navigate to detail, edit name/status, change client assignment
   - ✅ P0: Create new company, prevent deletion of ACTIVE company
   - ✅ P1: Validation errors (empty name), delete INACTIVE company
   - ✅ P1: Mobile responsiveness

3. **Store Management** - `tests/e2e/store-management.spec.ts`
   - ✅ P0: Load stores list, navigate to detail, edit name/status/location/timezone
   - ✅ P0: Create new store, update store configuration (operating hours)
   - ✅ P1: Validation errors (empty name, invalid timezone), prevent deletion of ACTIVE store
   - ✅ P1: Delete INACTIVE store, mobile responsiveness (edit form + configuration form)

4. **Admin/User Management** - `tests/e2e/admin-user-management.spec.ts`
   - ✅ P0: Load users list, navigate to detail, edit name/status, create user
   - ✅ P0: Assign roles to users, remove roles from users, search users
   - ✅ P1: Validation errors (empty name, invalid email, duplicate email)
   - ✅ P1: Filter users by status, mobile responsiveness (edit, list, role assignment dialog)

5. **Mobile Alert Dialog Component** - `tests/e2e/mobile-alert-dialog.spec.ts`
   - ✅ P0: Alert dialog responsiveness across 4 mobile viewports (iPhone SE, iPhone 12 Pro, Samsung Galaxy S20, iPad Mini)
   - ✅ P1: Content visibility on small screens, scrollable content on short viewports

### Features Missing E2E Test Coverage

1. **Shifts Management** - No E2E tests
2. **Inventory Management** - No E2E tests
3. **Lottery Management** - No E2E tests
4. **Reports & Analytics** - No E2E tests
5. **AI Assistant** - No E2E tests

### Running E2E Tests

```bash
# Run all E2E tests
npx playwright test

# Run specific test suite
npx playwright test tests/e2e/client-management.spec.ts
npx playwright test tests/e2e/company-management.spec.ts
npx playwright test tests/e2e/store-management.spec.ts
npx playwright test tests/e2e/admin-user-management.spec.ts
npx playwright test tests/e2e/mobile-alert-dialog.spec.ts

# Run tests with UI
npx playwright test --ui

# Run tests in headed mode (see browser)
npx playwright test --headed
```

## Notes

- **Authentication Required**: Most dashboard pages require authentication via email/password
- **Sidebar Navigation**: The dashboard includes a sidebar with navigation links to all main sections
- **Page Status**: Some pages listed in the sidebar may not be fully implemented yet (Companies, Stores, Shifts, etc.)
- **Backend API**: All API endpoints require proper authentication tokens for protected routes
- **Test Coverage**: All critical CRUD features (Clients, Companies, Stores, Users) have comprehensive E2E test coverage including mobile responsiveness

























