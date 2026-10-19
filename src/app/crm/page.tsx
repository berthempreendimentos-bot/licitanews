"use client";

import { useState } from "react";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { db, newId, useCollection } from "@/lib/store";
import { brl, dataBR, diasAte, nowIso } from "@/lib/format";
import { CRM_STAGES, type CrmCard, type CrmStage } from "@/lib/types";

const STAGE_COLOR: Record<CrmStage, string> = {
  Nova: "bg-neutral-300",
  Análise: "bg-neutral-400",
  Docs: "bg-neutral-500",
  Preparando: "bg-neutral-600",
  Participando: "bg-neutral-700",
  Disputa: "bg-neutral-800",
  Ganhou: "bg-black",
  Perdeu: "bg-white border border-black",
  Arquivado: "bg-neutral-200",
};

function CardEditor({ card, onClose }: { card: CrmCard | null; onClose: () => void }) {
  const [form, setForm] = useState<CrmCard>(
    card ?? {
      id: newId(), titulo: "", orgao: "", valor: null, status: "Nova", prazo: null,
      opportunity_id: null, link: null, notas: "", created_at: nowIso(), updated_at: nowIso(),
    },
  );
  const set = <K extends keyof CrmCard>(k: K, v: CrmCard[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="card w-full max-w-lg p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          db.upsert("crm_cards", { ...form, updated_at: nowIso() });
          onClose();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-brand">{card ? "Editar card" : "Novo card"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <textarea className="input min-h-20" placeholder="Objeto / título" required value={form.titulo} onChange={(e) => set("titulo", e.target.value)} />
        <input className="input" placeholder="Órgão" value={form.orgao} onChange={(e) => set("orgao", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="Valor (R$)" inputMode="decimal" value={form.valor ?? ""} onChange={(e) => set("valor", e.target.value ? Number(e.target.value.replace(",", ".")) : null)} />
          <input className="input" type="date" value={form.prazo?.slice(0, 10) ?? ""} onChange={(e) => set("prazo", e.target.value ? `${e.target.value}T12:00:00` : null)} />
        </div>
        <select className="input" value={form.status} onChange={(e) => set("status", e.target.value as CrmStage)}>
          {CRM_STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <textarea className="input min-h-20" placeholder="Notas" value={form.notas} onChange={(e) => set("notas", e.target.value)} />
        <div className="flex justify-between gap-2">
          {card ? (
            <button type="button" className="btn btn-ghost !text-danger" onClick={() => { if (confirm("Excluir este card?")) { db.remove("crm_cards", card.id); onClose(); } }}>
              <Trash2 size={14} /> Excluir
            </button>
          ) : <span />}
          <button className="btn btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  );
}

export default function Crm() {
  const { items: cards } = useCollection("crm_cards");
  const [editing, setEditing] = useState<CrmCard | null | "new">(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<CrmStage | null>(null);

  const ganhas = cards.filter((c) => c.status === "Ganhou");
  const pipeline = cards.filter((c) => !["Ganhou", "Perdeu", "Arquivado"].includes(c.status)).reduce((a, c) => a + (c.valor ?? 0), 0);

  function move(id: string, status: CrmStage) {
    db.update("crm_cards", id, { status, updated_at: nowIso() });
  }

  return (
    <>
      <PageHeader
        title="CRM de Licitações"
        subtitle={`${cards.length} oportunidades · ${ganhas.length} ganhas · ${brl(pipeline)} em pipeline`}
        actions={<button className="btn btn-primary" onClick={() => setEditing("new")}><Plus size={14} /> Novo card</button>}
      />
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0">
        {CRM_STAGES.map((stage) => {
          const list = cards.filter((c) => c.status === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
              onDragLeave={() => setOver(null)}
              onDrop={() => { if (dragId) move(dragId, stage); setDragId(null); setOver(null); }}
              className={`w-64 shrink-0 rounded-xl p-2 transition ${over === stage ? "bg-accent-soft" : "bg-[#ebebeb]"}`}
            >
              <div className="flex items-center gap-2 px-1.5 py-1.5">
                <span className={`h-2 w-2 rounded-full ${STAGE_COLOR[stage]}`} />
                <span className="text-sm font-bold text-brand">{stage}</span>
                <span className="ml-auto text-xs text-muted">{list.length}</span>
              </div>
              <div className="space-y-2 min-h-24">
                {list.length === 0 && <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted">Solte aqui</div>}
                {list.map((c) => {
                  const d = diasAte(c.prazo);
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setDragId(c.id)}
                      onClick={() => setEditing(c)}
                      className="card cursor-grab p-3 active:cursor-grabbing hover:border-accent/50"
                    >
                      <div className="text-[13px] font-medium leading-snug line-clamp-3">{c.titulo}</div>
                      {c.orgao && <div className="mt-1 text-[11px] text-muted truncate">{c.orgao}</div>}
                      <div className="mt-2 flex items-center gap-2 text-[11px]">
                        <span className="font-bold text-brand">{brl(c.valor, true)}</span>
                        {c.prazo && (
                          <span className={`ml-auto ${d != null && d <= 3 && d >= 0 ? "text-danger font-semibold" : "text-muted"}`}>{dataBR(c.prazo)}</span>
                        )}
                        {c.link && (
                          <a href={c.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted hover:text-accent" aria-label="Abrir no PNCP">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <select
                        className="mt-2 w-full rounded-md border border-border bg-transparent px-1.5 py-1 text-[11px] lg:hidden"
                        value={c.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => move(c.id, e.target.value as CrmStage)}
                      >
                        {CRM_STAGES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {editing && <CardEditor card={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
