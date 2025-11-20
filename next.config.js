/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Skip build-time static generation - this is a fully dynamic app
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  // Disable static page generation entirely - force all pages to be dynamic
  // This prevents prerendering errors for auth-protected pages
  skipTrailingSlashRedirect: false,
  skipMiddlewareUrlNormalize: false,
  // Control build behavior
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

