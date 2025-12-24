import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'publicdomainvectors.org',
        pathname: '/photos/**',
      },
      {
        protocol: 'https',
        hostname: 'publicdomainvectors.org',
        pathname: '/tn_img/**',
      },
      {
        protocol: 'https',
        hostname: 'freesvg.org',
        pathname: '/img/**',
      },
    ],
  },
};

export default nextConfig;
