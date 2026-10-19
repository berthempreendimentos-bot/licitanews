import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Endereços extras aceitos pelo servidor de desenvolvimento (além de localhost).
  allowedDevOrigins: ["peppacorp.localhost", "*.localhost", "192.168.18.28"],
  // A rota que gera o .zip da extensão lê a pasta extension/ em tempo de execução:
  // inclui esses arquivos no pacote da função (Vercel e outros serverless).
  outputFileTracingIncludes: {
    "/api/extensao": ["./extension/**/*"],
  },
};

export default nextConfig;
