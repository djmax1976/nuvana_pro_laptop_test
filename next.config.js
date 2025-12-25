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
  // API routes are handled by Next.js on Netlify
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
   * Enterprise Security Headers Configuration
   *
   * Implements OWASP security best practices:
   * - SEC-009: HEADERS - HSTS, X-Content-Type-Options, X-Frame-Options, CSP
   * - FE-004: CSP - Content Security Policy for XSS prevention
   * - SEC-004: XSS - Output encoding and CSP enforcement
   *
   * @see https://owasp.org/www-project-secure-headers/
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
   */
  async headers() {
    // CSP directives for production security
    // Nonces should be generated per-request in middleware for inline scripts
    const ContentSecurityPolicy = `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com data:;
      img-src 'self' data: blob: https:;
      connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL || ''} ${process.env.BACKEND_URL || ''} https://fonts.googleapis.com https://fonts.gstatic.com;
      frame-ancestors 'none';
      form-action 'self';
      base-uri 'self';
      object-src 'none';
      upgrade-insecure-requests;
    `.replace(/\s{2,}/g, ' ').trim();

    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: [
          // Strict Transport Security - Force HTTPS for 1 year, include subdomains
          // SEC-009: HEADERS - HSTS enforcement
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          // Prevent MIME type sniffing attacks
          // SEC-009: HEADERS - X-Content-Type-Options
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Prevent clickjacking attacks
          // SEC-009: HEADERS - X-Frame-Options (legacy, CSP frame-ancestors preferred)
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // Content Security Policy - Primary XSS defense
          // FE-004: CSP, SEC-004: XSS
          {
            key: 'Content-Security-Policy',
            value: ContentSecurityPolicy,
          },
          // Control referrer information leakage
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Disable browser features not needed
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Prevent cross-origin isolation attacks
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          // Prevent cross-origin embedding
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          // Cross-Origin Resource Policy
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          // Legacy XSS filter (for older browsers)
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // Prevent DNS prefetch to external domains
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'off',
          },
          // Prevent Adobe Flash and PDF embedding
          {
            key: 'X-Permitted-Cross-Domain-Policies',
            value: 'none',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig

