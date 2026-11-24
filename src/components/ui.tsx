"use client";

import Link from "next/link";
import { ExternalLink, FilePlus2, KanbanSquare, MapPin, Sparkles, Star } from "lucide-react";
import { db, newId, useCollection } from "@/lib/store";
import { brl, dataBR, diasAte, nowIso } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

export function PageHeader({ title, subtitle, tag, actions }: { title: string; subtitle?: string; tag?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-brand">{title}</h1>
          {tag && <span className="badge bg-accent-soft text-accent">{tag}</span>}
        </div>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className={`card p-4 min-w-0 ${accent ? "border-accent/40" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div
        className={`mt-1.5 font-extrabold break-words ${typeof value === "string" && value.length > 12 ? "text-lg" : "text-2xl"} ${accent ? "text-accent" : "text-brand"}`}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <div className="font-semibold text-brand">{title}</div>
      {text && <p className="text-sm text-muted mt-1 max-w-md mx-auto">{text}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function addOpportunityToCrm(o: Opportunity) {
  const exists = db.get("crm_cards").some((c) => c.opportunity_id === o.id);
  if (exists) return false;
  db.upsert("crm_cards", {
    id: newId(),
    titulo: o.titulo.slice(0, 200),
    orgao: o.orgao,
    valor: o.valor,
    status: "Nova",
    prazo: o.encerramento,
    opportunity_id: o.id,
    link: o.link,
    notas: "",
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return true;
}

export function OpportunityCard({ o }: { o: Opportunity }) {
  const { items: favs } = useCollection("favoritos");
  const { items: cards } = useCollection("crm_cards");
  const isFav = favs.some((f) => f.id === o.id);
  const inCrm = cards.some((c) => c.opportunity_id === o.id);
  const dias = diasAte(o.encerramento);

  return (
    <div className="card p-4 hover:shadow-sm transition">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="badge bg-brand/8 text-brand">{o.modalidade}</span>
        {o.srp && <span className="badge bg-warn/15 text-warn">SRP</span>}
        {dias != null && (
          <span className={`badge ${dias <= 2 ? "bg-black text-white" : "bg-neutral-200 text-neutral-700"}`}>
            {dias <= 0 ? "Encerra hoje" : `Encerra em ${dias}d`}
          </span>
        )}
        <span className="ml-auto font-bold text-[15px] text-brand">{brl(o.valor)}</span>
      </div>
      <p className="mt-2 text-sm font-medium leading-snug line-clamp-3">{o.titulo}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        {o.orgao && <span className="text-muted">{o.orgao}</span>}
        {o.orgao && (o.municipio || o.uf) && <span className="text-muted/60">·</span>}
        {(o.municipio || o.uf) && (
          <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md text-[11.5px] border border-blue-200/80">
            <MapPin size={11} className="shrink-0 text-blue-600" />
            {o.municipio ? `${o.municipio}/${o.uf}` : o.uf}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-muted">
        Propostas: {dataBR(o.abertura, true)} → {dataBR(o.encerramento, true)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={`btn btn-ghost !py-1.5 ${isFav ? "!border-warn !text-warn" : ""}`}
          onClick={() => (isFav ? db.remove("favoritos", o.id) : db.upsert("favoritos", { id: o.id, opportunity: o, created_at: nowIso() }))}
        >
          <Star size={14} fill={isFav ? "currentColor" : "none"} /> {isFav ? "Favorito" : "Favoritar"}
        </button>
        <button className="btn btn-ghost !py-1.5" disabled={inCrm} onClick={() => addOpportunityToCrm(o)}>
          <KanbanSquare size={14} /> {inCrm ? "No CRM" : "CRM"}
        </button>
        <a className="btn btn-ghost !py-1.5" href={o.link} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> PNCP
        </a>
        <Link className="btn btn-ghost !py-1.5" href={`/documentos?tab=ia&pncp=${encodeURIComponent(o.link)}`}>
          <Sparkles size={14} /> Analisar edital
        </Link>
        <Link className="btn btn-ghost !py-1.5" href={`/propostas?pncp=${encodeURIComponent(o.link)}`}>
          <FilePlus2 size={14} /> Proposta
        </Link>
      </div>
    </div>
  );
}

export function ComingSoon({ title, subtitle, features }: { title: string; subtitle: string; features: string[] }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} tag="Etapa 2" />
      <div className="card p-6">
        <div className="font-semibold text-brand">Este módulo entra na etapa 2. Ele vai incluir:</div>
        <ul className="mt-3 space-y-1.5 text-sm text-muted list-disc pl-5">
          {features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
