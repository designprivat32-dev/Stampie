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
}

export default nextConfig
