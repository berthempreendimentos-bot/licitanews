"use client";

import { useEffect } from "react";
import { encerrarSessao, iniciar, inicioAutomatico, vigiar } from "@/lib/cicloAdmin";
import { useAdmin } from "@/lib/useAdmin";

/**
 * Administrador logado: liga o robô que captura as licitações de todos os usuários,
 * sem precisar abrir a página do ciclo (pode ser desligado lá). Ao sair da conta, para.
 */
export function CicloAdminAuto() {
  const admin = useAdmin();
  useEffect(() => {
    if (!admin) return;
    vigiar();
    if (inicioAutomatico()) void iniciar();
    return () => encerrarSessao();
  }, [admin]);
  return null;
}
