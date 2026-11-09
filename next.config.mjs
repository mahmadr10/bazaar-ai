/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  outputFileTracingIncludes: {
    '/**': ['./data/catalog.json', './db/schema.sql'],
  },
  images: { unoptimized: true },
};
export default nextConfig;
