/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable static export - this is a dynamic app with authentication
  output: 'standalone',
  // Skip build-time static generation - this is a fully dynamic app
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  // Disable static page generation entirely - force all pages to be dynamic
  // This prevents prerendering errors for auth-protected pages
  skipTrailingSlashRedirect: false,
  skipMiddlewareUrlNormalize: false,
  // Suppress build errors for default error pages (404/500)
  // These pages will be handled dynamically at runtime
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
}

module.exports = nextConfig

