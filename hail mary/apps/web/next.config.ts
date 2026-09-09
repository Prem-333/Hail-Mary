import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui"],
  devIndicators: false,
  experimental: {
    outputFileTracingExcludes: {
      "/*": [
        "node_modules/@visx/**/*",
        "node_modules/recharts/**/*",
        "node_modules/d3-*/**/*",
        "node_modules/framer-motion/**/*"
      ],
    },
  },
}

export default nextConfig
