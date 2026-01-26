/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // For Railway deployment, use standalone output for optimal Docker builds
  output: 'standalone',
  skipTrailingSlashRedirect: false,
  skipMiddlewareUrlNormalize: false,
  // Control build behavior
  onDemandEntries: {
    maxInactiveAge: 30 * 60 * 1000, // 30 minutes
    pagesBufferLength: 2,
  },
  // API routes are handled by Next.js
  // If you have a separate backend, update this rewrite
  async rewrites() {
    // If using Next.js API routes, no rewrite needed
    // If using separate backend, uncomment and update:
    // return [
    //   {
    //     source: '/api/:path*',
    //     destination: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/:path*`,
    //   },
    // ];
    return [];
  },

  /**
   * Security Headers - MOVED TO MIDDLEWARE
   *
   * IMPORTANT: All security headers including CSP are now set in src/middleware.ts
   *
   * WHY: next.config.js headers() evaluates at BUILD TIME, not runtime.
   * This means environment variables like NEXT_PUBLIC_BACKEND_URL are baked
   * into the build artifact. For deployments where the backend URL differs
   * between environments (e.g., Railway), this breaks CSP connect-src.
   *
   * Middleware runs on EVERY REQUEST, reading env vars at runtime.
   * This is the enterprise-grade pattern for dynamic security headers.
   *
   * @see src/middleware.ts for the runtime CSP implementation
   */
  async headers() {
    return [];
  },
}

module.exports = nextConfig

