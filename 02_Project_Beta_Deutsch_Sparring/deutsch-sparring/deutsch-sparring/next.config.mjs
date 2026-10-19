/** @type {import('next').NextConfig} */
const nextConfig = {
  // make sure the lesson files and the word list are shipped with the server functions on Vercel
  outputFileTracingIncludes: {
    '/api/**': ['./content/**', './vocab/words.json', './vocab/lists.json'],
  },
};
export default nextConfig;
