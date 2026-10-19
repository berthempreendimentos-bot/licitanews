import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Endereços extras aceitos pelo servidor de desenvolvimento (além de localhost).
  allowedDevOrigins: ["peppacorp.localhost", "*.localhost", "192.168.18.28"],
};

export default nextConfig;
