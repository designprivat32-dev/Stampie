import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // `sharp` and `svgo` are native/heavy CJS deps: keep them out of the server bundle.
  serverExternalPackages: ['sharp', 'svgo', '@prisma/client'],
  experimental: {
    serverActions: {
      // Logo uploads are capped at 5 MB by the pipeline; leave headroom for the payload.
      bodySizeLimit: '8mb',
    },
  },
  /**
   * Baseline security headers for every response.
   *
   * The dashboard and login carry irreversible actions (assign a card, edit customer data,
   * sign in), so `frame-ancestors 'none'` plus the legacy `X-Frame-Options` shuts the door
   * on clickjacking. The other three are cheap hardening that costs nothing here.
   *
   * The CSP is intentionally frame-only. This app renders server components with no inline
   * event handlers, but pinning `script-src` would need a nonce pipeline to survive Next's
   * hydration bootstrap, and getting that wrong ships a blank page — out of scope for a
   * header pass. `frame-ancestors` cannot be set any other way (X-Frame-Options has no
   * allow-list equivalent), which is the one that actually matters against clickjacking.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), payment=()' },
        ],
      },
    ]
  },
}

export default nextConfig
