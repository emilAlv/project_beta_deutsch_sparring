/** @type {import('next').NextConfig} */
const nextConfig = {
  // make sure the lesson files are shipped with the server functions on Vercel
  outputFileTracingIncludes: {
    '/api/**': ['./content/**'],
  },
};
export default nextConfig;
