import type { NextConfig } from "next";

// Backend API URL configured via environment variable
const flaskApiBaseUrl =
  process.env.FLASK_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:5000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "10.197.132.88"],
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${flaskApiBaseUrl.replace(/\/$/, "")}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
