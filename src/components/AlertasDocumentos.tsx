"use client";

import { useEffect } from "react";
import { db, useCollection } from "@/lib/store";
import { dataBR, diasAte, nowIso } from "@/lib/format";

/**
 * Gera um alerta (uma vez por documento e validade) quando uma certidão
 * vence em até 15 dias ou já venceu. Não desenha nada.
 */
export function AlertasDocumentos() {
  const { items: docs } = useCollection("documentos");
  const { items: alerts } = useCollection("alerts");

  useEffect(() => {
    const existentes = new Set(alerts.map((a) => a.id));
    const novos = docs
      .filter((d) => d.validade)
      .map((d) => ({ d, dias: diasAte(`${d.validade}T23:59:59`) }))
      .filter(({ d, dias }) => dias != null && dias <= 15 && !existentes.has(`alert:doc:${d.id}:${d.validade}`))
      .map(({ d, dias }) => ({
        id: `alert:doc:${d.id}:${d.validade}`,
        tipo: dias! < 0 ? "Documento vencido" : "Documento vencendo",
        titulo: dias! < 0 ? `📄 ${d.tipo} venceu` : `📄 ${d.tipo} vence em ${dias} dia${dias === 1 ? "" : "s"}`,
        mensagem: `${d.descricao || d.tipo} — validade ${dataBR(`${d.validade}T12:00:00`)}. Renove para não ser inabilitado.`,
        prioridade: (dias! <= 5 ? "Alta" : "Média") as "Alta" | "Média",
        lido: false,
        ref: d.id,
        created_at: nowIso(),
      }));
    if (novos.length) db.upsertMany("alerts", novos);
  }, [docs, alerts]);

  return null;
}
