import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Configure webpack for traditional bundler
  webpack: (config, { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack }) => {
    // Add alias for shared folder
    config.resolve.alias = {
      ...config.resolve.alias,
      '@shared': path.resolve(__dirname, '../shared'),
    };
    
    // Exclude Google Cloud packages from client bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };
    }
    
    return config;
  },
  
  // Configure Turbopack (stable syntax)
  turbopack: {
    resolveAlias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
};

export default nextConfig;
