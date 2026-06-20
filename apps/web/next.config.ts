import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @dct/sdk is a workspace TS package consumed directly
  transpilePackages: ["@dct/sdk"],
};

export default nextConfig;
