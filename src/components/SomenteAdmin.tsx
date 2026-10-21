"use client";

import { Empty } from "./ui";
import { useAdmin } from "@/lib/useAdmin";

/** Mostra o conteúdo só para administradores; os demais veem "Acesso restrito". */
export function SomenteAdmin({ children }: { children: React.ReactNode }) {
  const admin = useAdmin();
  if (admin === null) return <div className="p-10 text-sm text-muted">Carregando…</div>;
  if (!admin) return <Empty title="Acesso restrito" text="Esta área é só para administradores do PEPPACORP." />;
  return <>{children}</>;
}
