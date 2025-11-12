# Available Pages & Routes

## Frontend Pages (Next.js App)

### Public Pages
1. **Home Page** - `http://localhost:3000/`
   - Welcome page for Nuvana Pro
   - Landing page with basic information

2. **Login Page** - `http://localhost:3000/login`
   - OAuth login with Google
   - Sign in button to initiate authentication
   - Error handling for failed authentication

3. **Auth Callback** - `http://localhost:3000/auth/callback`
   - OAuth callback handler
   - Processes authentication code from OAuth provider
   - Redirects to dashboard on success

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
- **GET** `http://localhost:3001/api/auth/callback`
  - OAuth callback handler
  - Processes OAuth code and creates JWT tokens
  - Sets httpOnly cookies for access and refresh tokens
  - Returns user information

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
2. Click "Sign in with Google" (requires Supabase OAuth setup)
3. After authentication, you'll be redirected to http://localhost:3000/dashboard

## Notes

- **Authentication Required**: Most dashboard pages require authentication via OAuth
- **Sidebar Navigation**: The dashboard includes a sidebar with navigation links to all main sections
- **Page Status**: Some pages listed in the sidebar may not be fully implemented yet (Companies, Stores, Shifts, etc.)
- **Backend API**: All API endpoints require proper authentication tokens for protected routes


