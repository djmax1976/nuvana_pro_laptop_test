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
  "/login",
  "/client-login", // Legacy redirect
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
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
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
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );

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

  // 3. Check authentication for all other routes
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
