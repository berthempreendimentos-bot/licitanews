"use client";

import { useEffect } from "react";
import { encerrarSessao, vigiar } from "@/lib/cicloAdmin";
import { useAdmin } from "@/lib/useAdmin";

/**
 * Administrador logado: acompanha a lista de compras monitoradas. O robô só liga quando
 * ele clica em "Iniciar ciclo" e segue rodando enquanto navega. Ao sair da conta, para.
 */
export function CicloAdminAuto() {
  const admin = useAdmin();
  useEffect(() => {
    if (!admin) return;
    vigiar();
    return () => encerrarSessao();
  }, [admin]);
  return null;
}
