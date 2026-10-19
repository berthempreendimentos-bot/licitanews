"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { db, newId, useCollection } from "@/lib/store";
import { nowIso } from "@/lib/format";

type Tipo = "Abertura" | "Encerramento" | "Prazo CRM" | "Proposta" | "Documento" | "Pessoal";
type Ev = { key: string; dia: string; hora: string | null; titulo: string; tipo: Tipo; id?: string; href?: string };

/** Uma cor por tipo de evento (classes por extenso para o Tailwind encontrar). */
const COR: Record<Tipo, { ponto: string; chip: string; cartao: string; texto: string }> = {
  Abertura: { ponto: "bg-green-500", chip: "bg-green-100 text-green-800", cartao: "border-l-green-500 bg-green-50", texto: "text-green-700" },
  Encerramento: { ponto: "bg-red-500", chip: "bg-red-100 text-red-800", cartao: "border-l-red-500 bg-red-50", texto: "text-red-700" },
  "Prazo CRM": { ponto: "bg-blue-500", chip: "bg-blue-100 text-blue-800", cartao: "border-l-blue-500 bg-blue-50", texto: "text-blue-700" },
  Proposta: { ponto: "bg-teal-500", chip: "bg-teal-100 text-teal-800", cartao: "border-l-teal-500 bg-teal-50", texto: "text-teal-700" },
  Documento: { ponto: "bg-orange-500", chip: "bg-orange-100 text-orange-800", cartao: "border-l-orange-500 bg-orange-50", texto: "text-orange-700" },
  Pessoal: { ponto: "bg-violet-500", chip: "bg-violet-100 text-violet-800", cartao: "border-l-violet-500 bg-violet-50", texto: "text-violet-700" },
};
const TIPOS = Object.keys(COR) as Tipo[];
const NOME_TIPO: Record<Tipo, string> = {
  Abertura: "Abertura", Encerramento: "Encerramento", "Prazo CRM": "Prazo CRM", Proposta: "Prazo de proposta", Documento: "Documento vencendo", Pessoal: "Pessoal",
};
/** "outubro de 2026" → "Outubro de 2026" (só a primeira letra). */
const inicial = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const WEEK = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const diaDe = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : localDay(new Date(iso)));
/** Hora "08:30" quando a data traz horário (e não é meia-noite). */
function horaDe(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || (d.getHours() === 0 && d.getMinutes() === 0)) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Agenda() {
  const { items: favs } = useCollection("favoritos");
  const { items: cards } = useCollection("crm_cards");
  const { items: pessoais } = useCollection("agenda_events");
  const { items: documentos } = useCollection("documentos");
  const { items: propostas } = useCollection("propostas");
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState(() => localDay(new Date()));
  const [titulo, setTitulo] = useState("");
  const [ocultos, setOcultos] = useState<Set<Tipo>>(new Set());

  // Datas importadas automaticamente: favoritos, CRM, propostas, documentos e eventos pessoais.
  const events = useMemo(() => {
    const out: Ev[] = [];
    for (const f of favs) {
      const o = f.opportunity;
      if (o.abertura) out.push({ key: `a${f.id}`, dia: diaDe(o.abertura), hora: horaDe(o.abertura), titulo: o.titulo, tipo: "Abertura", href: "/favoritos" });
      if (o.encerramento) out.push({ key: `e${f.id}`, dia: diaDe(o.encerramento), hora: horaDe(o.encerramento), titulo: o.titulo, tipo: "Encerramento", href: "/favoritos" });
    }
    for (const c of cards) if (c.prazo) out.push({ key: `c${c.id}`, dia: diaDe(c.prazo), hora: horaDe(c.prazo), titulo: c.titulo, tipo: "Prazo CRM", href: "/crm" });
    for (const p of propostas) {
      if (p.encerramento && !["Homologada", "Recusada"].includes(p.status)) {
        out.push({ key: `pr${p.id}`, dia: diaDe(p.encerramento), hora: horaDe(p.encerramento), titulo: `${p.status}: ${p.titulo}`, tipo: "Proposta", href: `/propostas/${p.id}` });
      }
    }
    for (const d of documentos) if (d.validade) out.push({ key: `d${d.id}`, dia: d.validade, hora: null, titulo: `Vence: ${d.tipo}${d.descricao ? ` (${d.descricao})` : ""}`, tipo: "Documento", href: "/documentos" });
    for (const p of pessoais) out.push({ key: `p${p.id}`, dia: p.data, hora: null, titulo: p.titulo, tipo: "Pessoal", id: p.id });
    return out.sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99"));
  }, [favs, cards, pessoais, documentos, propostas]);

  const visiveis = events.filter((e) => !ocultos.has(e.tipo));
  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of visiveis) m.set(e.dia, [...(m.get(e.dia) ?? []), e]);
    return m;
  }, [visiveis]);

  const start = new Date(month);
  start.setDate(1 - month.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const today = localDay(new Date());
  const dayEvents = byDay.get(day) ?? [];
  const mesAtual = (e: Ev) => e.dia.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`);
  const contagemMes = (t: Tipo) => events.filter((e) => e.tipo === t && mesAtual(e)).length;
  const limite = localDay(new Date(Date.now() + 7 * 86400000));
  const proximos = visiveis.filter((e) => e.dia >= today && e.dia <= limite).sort((a, b) => a.dia.localeCompare(b.dia) || (a.hora ?? "99").localeCompare(b.hora ?? "99"));

  const alterna = (t: Tipo) => setOcultos((cur) => { const n = new Set(cur); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const irHoje = () => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setDay(today); };
  const dataLonga = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <PageHeader title="Agenda" subtitle="Aberturas e encerramentos dos favoritos, prazos do CRM e das propostas, documentos e eventos pessoais" />

      {/* Legenda que também filtra */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <span className="text-xs font-semibold text-muted mr-1">Mostrar:</span>
        {TIPOS.map((t) => {
          const ativo = !ocultos.has(t);
          return (
            <button key={t} onClick={() => alterna(t)} aria-pressed={ativo}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${ativo ? `${COR[t].chip} border-transparent` : "border-border bg-surface text-muted line-through opacity-60"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${COR[t].ponto}`} />
              {NOME_TIPO[t]} <span className="opacity-70">({contagemMes(t)})</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <button className="btn btn-ghost !p-1.5" aria-label="Mês anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
            <div className="flex-1 text-center text-lg font-bold text-brand">{inicial(month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }))}</div>
            <button className="btn btn-ghost !py-1.5 !text-xs" onClick={irHoje}>Hoje</button>
            <button className="btn btn-ghost !p-1.5" aria-label="Próximo mês" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-bold tracking-wider text-muted">
            {WEEK.map((w, i) => <div key={w} className={i === 0 || i === 6 ? "text-red-400" : ""}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d) => {
              const k = localDay(d);
              const evs = byDay.get(k) ?? [];
              const inMonth = d.getMonth() === month.getMonth();
              const fimDeSemana = d.getDay() === 0 || d.getDay() === 6;
              const ehHoje = k === today;
              return (
                <button key={k} onClick={() => setDay(k)}
                  className={`flex min-h-[84px] flex-col rounded-lg border p-1.5 text-left text-xs transition
                    ${day === k ? "border-brand ring-2 ring-brand/15" : "border-transparent hover:border-border"}
                    ${fimDeSemana ? "bg-neutral-50" : "bg-surface"} ${inMonth ? "" : "opacity-35"}`}>
                  <span className={`mb-1 grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold ${ehHoje ? "bg-brand text-white" : ""}`}>{d.getDate()}</span>
                  <span className="flex flex-col gap-0.5">
                    {evs.slice(0, 2).map((e) => (
                      <span key={e.key} className={`truncate rounded px-1 py-px text-[10px] font-semibold leading-tight ${COR[e.tipo].chip}`} title={`${NOME_TIPO[e.tipo]}: ${e.titulo}`}>
                        {e.hora ? `${e.hora} ` : ""}{e.titulo}
                      </span>
                    ))}
                    {evs.length > 2 && (
                      <span className="flex items-center gap-0.5 px-0.5 text-[10px] font-semibold text-muted">
                        {evs.slice(2, 7).map((e) => <span key={e.key} className={`h-1.5 w-1.5 rounded-full ${COR[e.tipo].ponto}`} />)}
                        +{evs.length - 2}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-4">
            <div className="font-bold text-brand">{inicial(dataLonga(day))}</div>
            <div className="text-xs text-muted">{dayEvents.length ? `${dayEvents.length} evento${dayEvents.length > 1 ? "s" : ""}` : "Nenhum evento neste dia"}</div>
            <ul className="mt-3 space-y-2">
              {dayEvents.map((e) => (
                <li key={e.key} className={`flex gap-2 rounded-lg border-l-4 p-2.5 text-sm ${COR[e.tipo].cartao}`}>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[11px] font-bold uppercase tracking-wider ${COR[e.tipo].texto}`}>{NOME_TIPO[e.tipo]}{e.hora && ` · ${e.hora}`}</div>
                    {e.href ? <Link href={e.href} className="line-clamp-2 hover:underline">{e.titulo}</Link> : <div className="line-clamp-2">{e.titulo}</div>}
                  </div>
                  {e.id && <button aria-label="Excluir" className="text-muted hover:text-danger" onClick={() => db.remove("agenda_events", e.id!)}><Trash2 size={13} /></button>}
                </li>
              ))}
            </ul>
            <form className="mt-4 flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              if (!titulo.trim()) return;
              db.upsert("agenda_events", { id: newId(), titulo: titulo.trim(), data: day, tipo: "Pessoal", created_at: nowIso() });
              setTitulo("");
            }}>
              <input className="input" placeholder="Novo evento pessoal neste dia" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              <button className="btn btn-primary shrink-0" aria-label="Adicionar"><Plus size={14} /></button>
            </form>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 font-bold text-brand"><CalendarDays size={16} /> Próximos 7 dias</div>
            {proximos.length === 0 && <p className="mt-2 text-sm text-muted">Nada nos próximos 7 dias.</p>}
            <ul className="mt-2 divide-y divide-border">
              {proximos.slice(0, 12).map((e) => (
                <li key={e.key}>
                  <button className="flex w-full gap-2.5 py-2 text-left text-sm hover:bg-bg" onClick={() => { setDay(e.dia); setMonth(new Date(Number(e.dia.slice(0, 4)), Number(e.dia.slice(5, 7)) - 1, 1)); }}>
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${COR[e.tipo].ponto}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold text-muted">
                        {e.dia === today ? "Hoje" : new Date(`${e.dia}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                        {e.hora && ` · ${e.hora}`} · <span className={COR[e.tipo].texto}>{NOME_TIPO[e.tipo]}</span>
                      </span>
                      <span className="line-clamp-1">{e.titulo}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
