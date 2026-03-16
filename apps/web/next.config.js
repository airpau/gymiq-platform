/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@gymiq/shared'],
};

module.exports = nextConfig;
