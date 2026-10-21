"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDownUp, Building2, CalendarDays, FileText, Layers, MapPin, Search, Trash2 } from "lucide-react";
import { resumoAnalise, type ResumoAnalise } from "@/lib/analiseInfo";
import { dataBR } from "@/lib/format";
import type { AnaliseEdital } from "@/lib/types";

type Ordem = "recentes" | "numero" | "cidade" | "orgao";
const ORDENS: { id: Ordem; nome: string }[] = [
  { id: "recentes", nome: "Mais recentes" },
  { id: "numero", nome: "Nº do pregão" },
  { id: "cidade", nome: "Cidade" },
  { id: "orgao", nome: "Órgão" },
];

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "15/2026" → chave que ordena por ano e depois pelo número. */
const chaveNumero = (n: string) => {
  const m = n.match(/(\d+)(?:\/(\d{4}))?/);
  return m ? `${m[2] ?? "0000"}-${m[1].padStart(6, "0")}` : "";
};

/** Cor do selo pela modalidade. */
function corTipo(tipo: string) {
  if (/preg/i.test(tipo)) return "bg-blue-50 text-blue-800 ring-blue-200";
  if (/dispensa|contrata/i.test(tipo)) return "bg-amber-50 text-amber-800 ring-amber-200";
  if (/concorr/i.test(tipo)) return "bg-violet-50 text-violet-800 ring-violet-200";
  return "bg-bg text-muted ring-border";
}

/** Análises de edital salvas, em cards com nº do pregão, cidade/UF e órgão; com busca e ordenação. */
export function AnalisesSalvas({ items, onAbrir, onExcluir }: {
  items: AnaliseEdital[];
  onAbrir: (id: string) => void;
  onExcluir: (a: AnaliseEdital) => void;
}) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");

  const lista = items.map((a) => ({ a, r: resumoAnalise(a) }));
  const termos = semAcento(busca).split(/\s+/).filter(Boolean);
  const filtrada = lista.filter(({ a, r }) => {
    const alvo = semAcento([r.tipo, r.numero, r.processo, r.cidade, r.uf, r.orgao, r.objeto, a.titulo].join(" "));
    return termos.every((t) => alvo.includes(t));
  });
  const comparar: Record<Ordem, (x: { a: AnaliseEdital; r: ResumoAnalise }, y: { a: AnaliseEdital; r: ResumoAnalise }) => number> = {
    recentes: (x, y) => y.a.created_at.localeCompare(x.a.created_at),
    numero: (x, y) => chaveNumero(y.r.numero).localeCompare(chaveNumero(x.r.numero)) || y.a.created_at.localeCompare(x.a.created_at),
    cidade: (x, y) => (x.r.cidade || "~").localeCompare(y.r.cidade || "~", "pt-BR") || chaveNumero(y.r.numero).localeCompare(chaveNumero(x.r.numero)),
    orgao: (x, y) => (x.r.orgao || "~").localeCompare(y.r.orgao || "~", "pt-BR") || chaveNumero(y.r.numero).localeCompare(chaveNumero(x.r.numero)),
  };
  filtrada.sort(comparar[ordem]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input !pl-8" placeholder="Buscar por nº do pregão, cidade, órgão ou objeto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-muted">
          <ArrowDownUp size={14} /> Ordenar por
          <select className="input !w-auto !py-1.5 text-sm" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
            {ORDENS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </label>
        <span className="text-xs text-muted">{filtrada.length} de {items.length} {items.length === 1 ? "pregão" : "pregões"}</span>
      </div>

      {!filtrada.length && <p className="text-sm text-muted">Nenhuma análise com essa busca.</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtrada.map(({ a, r }) => {
          const altos = a.resultado.riscos?.filter((x) => x.gravidade === "alta").length ?? 0;
          const lotes = new Set((a.resultado.itens ?? []).map((i) => i.lote).filter(Boolean)).size;
          const itens = a.resultado.itens?.length ?? 0;
          return (
            <div key={a.id} role="button" tabIndex={0} onClick={() => onAbrir(a.id)} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(a.id); }}
              className="card group flex cursor-pointer flex-col p-4 transition hover:-translate-y-0.5 hover:border-black/30 hover:shadow-md">
              {/* Modalidade e nº */}
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${corTipo(r.tipo)}`}>{r.tipo}</span>
                  <div className="mt-1.5 text-xl font-extrabold leading-tight tracking-tight text-brand">
                    {r.numero ? <>Nº {r.numero}</> : <span className="text-base text-muted">Nº não identificado</span>}
                  </div>
                  {r.processo && <div className="text-[11px] text-muted">Processo {r.processo}</div>}
                </div>
                <button aria-label="Excluir análise" className="rounded p-1 text-muted opacity-60 hover:bg-bg hover:text-red-600 group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); onExcluir(a); }}><Trash2 size={15} /></button>
              </div>

              {/* Cidade e órgão */}
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <MapPin size={14} className="shrink-0 text-red-500" />
                  <span className="truncate">{r.cidade ? `${r.cidade}${r.uf ? ` / ${r.uf}` : ""}` : r.uf || "Cidade não identificada"}</span>
                </div>
                <div className="flex items-start gap-2 text-muted">
                  <Building2 size={14} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-2 text-[13px] leading-snug">{r.orgao || "Órgão não informado"}</span>
                </div>
              </div>

              {/* Objeto */}
              <p className="mt-3 line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-neutral-600" title={r.objeto}>{r.objeto}</p>

              {/* Rodapé */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-[11px]">
                <span className="inline-flex items-center gap-1 text-muted"><CalendarDays size={12} /> {dataBR(a.created_at)}</span>
                {lotes > 1 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 font-semibold"><Layers size={11} /> {lotes} lotes · {itens} itens</span>
                ) : itens > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 font-semibold"><FileText size={11} /> {itens} {itens === 1 ? "item" : "itens"}</span>
                ) : null}
                {altos > 0 ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700"><AlertTriangle size={11} /> {altos} {altos === 1 ? "risco alto" : "riscos altos"}</span>
                ) : (
                  <span className="ml-auto rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-700">Sem risco alto</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
