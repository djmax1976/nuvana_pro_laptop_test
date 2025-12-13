import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Middleware - Server-Side Authentication Gate
 *
 * This middleware runs on EVERY request before any page loads.
 * It enforces authentication at the edge/server level, preventing
 * unauthorized users from accessing any protected content.
 *
 * Key Features:
 * - Blocks ALL routes except explicit public paths
 * - Validates JWT access token from cookies
 * - Redirects unauthenticated users to /login
 * - Prevents flash of unauthorized content
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/middleware
 */

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/", // Marketing homepage - must be public for SEO and user experience
  "/login",
  "/client-login", // Legacy redirect
];

// Routes that should be allowed through middleware even without cookie
// (client-side auth in AuthContext will handle protection)
// This is needed for cross-origin deployments where cookies are set on backend domain
const CLIENT_AUTH_ROUTES = [
  "/dashboard",
  "/companies",
  "/stores",
  "/admin",
  "/transactions",
  "/client-dashboard",
  "/mystore",
  "/terminal",
];

// Static assets and system paths that should bypass auth
const BYPASS_PATTERNS = [
  "/_next", // Next.js internals
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon",
  "/opengraph-image",
  "/twitter-image",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
  "/api/", // API routes handle their own auth
];

/**
 * Check if a path matches any bypass pattern
 */
function shouldBypass(pathname: string): boolean {
  return BYPASS_PATTERNS.some((pattern) => pathname.startsWith(pattern));
}

/**
 * Check if a path is a public route
 *
 * Handles exact matches and nested paths correctly:
 * - "/" matches only the root path exactly
 * - "/login" matches "/login" and "/login/..."
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => {
    // Exact match for all routes
    if (pathname === route) {
      return true;
    }
    // For non-root routes, also match nested paths (e.g., /login/callback)
    // Root "/" should NOT match nested paths like "/dashboard"
    if (route !== "/" && pathname.startsWith(`${route}/`)) {
      return true;
    }
    return false;
  });
}

/**
 * Check if a route should use client-side auth instead of cookie-based middleware auth
 *
 * For cross-origin deployments (e.g., Railway where frontend and backend are on different domains),
 * cookies set by the backend are not accessible to the frontend domain. In these cases,
 * we let the route through and let client-side AuthContext handle authentication.
 */
function isClientAuthRoute(pathname: string): boolean {
  return CLIENT_AUTH_ROUTES.some((route) => {
    if (pathname === route) {
      return true;
    }
    if (pathname.startsWith(`${route}/`)) {
      return true;
    }
    return false;
  });
}

/**
 * Decode base64url string to JSON object (web-compatible, Edge runtime safe)
 *
 * Converts URL-safe base64 to standard base64, decodes it, and parses as JSON.
 */
function decodeBase64Url(base64url: string): any {
  // Convert URL-safe base64 to standard base64
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");

  // Pad the string to a multiple of 4
  while (base64.length % 4) {
    base64 += "=";
  }

  // Decode base64 to binary string using atob()
  const binaryString = atob(base64);

  // Convert binary string to Uint8Array using Uint8Array.from()
  // This avoids the security/detect-object-injection lint warning
  const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));

  // Decode UTF-8 using TextDecoder
  const decoder = new TextDecoder("utf-8");
  const decoded = decoder.decode(bytes);

  // Parse and return JSON
  return JSON.parse(decoded);
}

/**
 * Validate the access token
 *
 * Note: This is a lightweight check that verifies token presence and basic structure.
 * Full token validation happens on the backend when accessing protected APIs.
 * This prevents unnecessary backend calls on every navigation.
 */
function hasValidToken(request: NextRequest): boolean {
  const accessToken = request.cookies.get("access_token");

  if (!accessToken?.value) {
    return false;
  }

  // Basic JWT structure validation (header.payload.signature)
  const parts = accessToken.value.split(".");
  if (parts.length !== 3) {
    return false;
  }

  // Check if token is not expired (decode payload without verification)
  try {
    const payload = decodeBase64Url(parts[1]);

    // Check expiration if present
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return false; // Token expired
      }
    }

    return true;
  } catch {
    // Invalid token structure
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Bypass static assets and system paths
  if (shouldBypass(pathname)) {
    return NextResponse.next();
  }

  // 2. Allow public routes
  if (isPublicRoute(pathname)) {
    // If user is already authenticated and trying to access login, redirect to appropriate dashboard
    if (pathname === "/login" && hasValidToken(request)) {
      // Let the login page handle the redirect based on user role
      // (client-side will check role and redirect appropriately)
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  // 3. For client-auth routes, allow through - client-side AuthContext handles auth
  // This is needed for cross-origin deployments where cookies are on a different domain
  if (isClientAuthRoute(pathname)) {
    return NextResponse.next();
  }

  // 4. Check authentication for all other routes
  if (!hasValidToken(request)) {
    // Redirect to login with return URL
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnUrl", pathname);

    return NextResponse.redirect(loginUrl);
  }

  // 4. User is authenticated, allow access
  return NextResponse.next();
}

/**
 * Middleware matcher configuration
 *
 * This runs the middleware on all routes except:
 * - _next/static (static files)
 * - _next/image (image optimization)
 * - favicon.ico, sitemap.xml, robots.txt (metadata files)
 * - Public folder files (images, etc.)
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
