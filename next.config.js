/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // Disable static page generation entirely - force all pages to be dynamic
  // This prevents prerendering errors for auth-protected pages
  skipTrailingSlashRedirect: false,
  skipMiddlewareUrlNormalize: false,
  // Control build behavior
  onDemandEntries: {
    maxInactiveAge: 30 * 60 * 1000, // 30 minutes
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

