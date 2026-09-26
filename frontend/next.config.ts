import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Standalone output keeps the production Docker image small.
  output: "standalone",
};

export default withNextIntl(nextConfig);
