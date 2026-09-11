/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lld/contracts'],

  webpack(config) {
    /**
     * The contracts package is compiled by the API under NodeNext, which requires
     * explicit `.js` specifiers even when the source is `.ts`. Webpack does not do
     * that mapping by default, so one shared package would otherwise need two
     * different import styles. This teaches the bundler the same rule Node uses.
     */
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },

  async rewrites() {
    // The API is a separate Express process. Proxying keeps the browser on one
    // origin, so there is no CORS dance and no API base URL baked into the client.
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:4000'}/api/:path*`,
      },
    ]
  },
}
export default nextConfig
