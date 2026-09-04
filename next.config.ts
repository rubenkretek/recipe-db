import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted on Coolify, so the build must emit a standalone server bundle.
  // See SPEC.md §4 "Deployment constraints".
  output: "standalone",
};

export default nextConfig;
