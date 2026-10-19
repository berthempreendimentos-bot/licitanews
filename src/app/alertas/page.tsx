"use client";

import { useState } from "react";
import { CheckCheck, Trash2 } from "lucide-react";
import { Empty, PageHeader } from "@/components/ui";
import { corEvento, EventoTag } from "@/components/EventoTag";
import { db, useCollection } from "@/lib/store";
import { dataBR } from "@/lib/format";

const PRIO: Record<string, string> = { Alta: "bg-danger/12 text-danger", Média: "bg-warn/15 text-warn", Baixa: "bg-neutral-200 text-neutral-600" };

export default function Alertas() {
  const { items } = useCollection("alerts");
  const [filtro, setFiltro] = useState<"todos" | "nao_lidos">("nao_lidos");
  const list = filtro === "todos" ? items : items.filter((a) => !a.lido);
  const unread = items.filter((a) => !a.lido);

  return (
    <>
      <PageHeader
        title="Alertas"
        subtitle={`${unread.length} não lidos · ${items.length} no total`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setFiltro(filtro === "todos" ? "nao_lidos" : "todos")}>
              {filtro === "todos" ? "Só não lidos" : "Ver todos"}
            </button>
            <button className="btn btn-ghost" disabled={!unread.length} onClick={() => db.upsertMany("alerts", unread.map((a) => ({ ...a, lido: true })))}>
              <CheckCheck size={14} /> Marcar todos como lidos
            </button>
          </>
        }
      />
      {list.length === 0 ? (
        <Empty title="Nada por aqui" text="Os alertas chegam do Monitoramento (menções ao seu CNPJ e palavras-chave, prazos e convocações)." />
      ) : (
        <div className="space-y-2">
          {list.map((a) => (
            <div key={a.id} className={`card p-4 flex gap-3 ${a.lido ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {corEvento(a.tipo) ? <EventoTag evento={a.tipo} /> : <span className={`badge ${PRIO[a.prioridade] ?? ""}`}>{a.tipo}</span>}
                  <span className="font-semibold text-sm">{a.titulo}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{a.mensagem}</p>
                <div className="mt-1 text-[11px] text-muted">{dataBR(a.created_at, true)}</div>
              </div>
              <div className="flex flex-col gap-2">
                {!a.lido && <button className="text-xs text-accent font-semibold" onClick={() => db.update("alerts", a.id, { lido: true })}>Lido</button>}
                <button aria-label="Excluir" className="text-muted hover:text-danger" onClick={() => db.remove("alerts", a.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
