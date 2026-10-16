/** @type {import('next').NextConfig} */
const API = process.env.API_URL || 'http://localhost:4000';
export default {
  poweredByHeader: false,
  async rewrites() {
    // The browser only ever talks to /api on the same domain; Next forwards it to the Node server.
    return [{ source: '/api/:path*', destination: `${API}/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
