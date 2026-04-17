import path from "path";
import type { NextConfig } from "next";

const apiUpstream =
  process.env.API_UPSTREAM ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  // Évite que Next trace depuis un lockfile parent (chemins standalone incorrects).
  outputFileTracingRoot: path.join(process.cwd()),
  async redirects() {
    return [
      {
        source: "/",
        destination: "/rh/dashboard",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      /** Après les routes Next (ex. /api/import) : proxy vers l’API Express héritée */
      afterFiles: [
        {
          source: "/api/:path*",
          destination: `${apiUpstream}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
