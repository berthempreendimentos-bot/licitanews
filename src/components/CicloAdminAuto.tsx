"use client";

import { useEffect } from "react";
import { iniciar, vigiar } from "@/lib/cicloAdmin";
import { useAdmin } from "@/lib/useAdmin";

/**
 * Administrador logado: acompanha a lista de compras monitoradas e mantém o robô ativo.
 * O robô roda em segundo plano e continua ativo ao navegar pelas páginas.
 * Só para quando o usuário clicar no botão "Parar".
 */
export function CicloAdminAuto() {
  const admin = useAdmin();

  useEffect(() => {
    if (!admin) return;
    vigiar();
    // Se o robô estava ativo antes de mudar de página ou recarregar, continua rodando
    if (typeof window !== "undefined" && localStorage.getItem("peppa_ciclo_ativo") === "1") {
      void iniciar();
    }
  }, [admin]);

  return null;
}
