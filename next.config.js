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
}

module.exports = nextConfig

