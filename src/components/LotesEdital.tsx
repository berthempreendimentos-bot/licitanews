"use client";

import { useState } from "react";
import { Check, Layers, Package } from "lucide-react";
import { brl, corDoLote, lotesDoEdital, totalDoItem, type ItemEdital } from "@/lib/lotes";
import type { ResultadoEdital } from "@/lib/edital";

const vazio = (v?: string) => !v || /^n[ãa]o informado/i.test(v.trim());
const itensTxt = (n: number) => `${n} ${n === 1 ? "item" : "itens"}`;

/** Tabela de itens (de um lote ou do edital inteiro). */
function TabelaItens({ itens }: { itens: ItemEdital[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg/60 text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-4 py-2">Nº</th><th className="px-4 py-2">Descrição</th><th className="px-4 py-2 text-right">Qtd.</th>
            <th className="px-4 py-2">Unid.</th><th className="px-4 py-2 text-right">Unitário</th><th className="px-4 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it, i) => {
            const total = totalDoItem(it);
            return (
              <tr key={i} className="border-b border-border last:border-0 align-top break-inside-avoid">
                <td className="px-4 py-2.5"><span className="grid h-6 min-w-6 place-items-center rounded-md bg-bg px-1 text-xs font-bold">{it.numero}</span></td>
                <td className="px-4 py-2.5 font-medium leading-relaxed">{it.descricao}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{it.quantidade}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted">{it.unidade}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums text-muted">{vazio(it.valor_estimado) ? "—" : it.valor_estimado}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums font-semibold">{total != null ? brl(total) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Interruptor "Participar deste lote". */
function Participar({ ligado, onChange }: { ligado: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} onClick={onChange}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
        ligado ? "border-green-600 bg-green-600 text-white" : "border-border bg-surface text-muted hover:border-green-600 hover:text-green-700"
      }`}>
      <span className={`grid h-4 w-4 place-items-center rounded ${ligado ? "bg-white text-green-700" : "border border-current"}`}>{ligado && <Check size={11} strokeWidth={3.5} />}</span>
      {ligado ? "Participando" : "Participar deste lote"}
    </button>
  );
}

/**
 * Itens do edital. Com lotes: abas (Visão geral + uma por lote), total de cada lote
 * e a escolha dos lotes que a empresa vai disputar (salva na análise).
 */
export function LotesEdital({ r, escolhidos, onEscolher }: {
  r: ResultadoEdital;
  escolhidos: string[];
  onEscolher?: (lotes: string[]) => void;
}) {
  const lotes = lotesDoEdital(r);
  const [aba, setAba] = useState<string>("__geral");

  if (!r.itens?.length) return null;

  // Edital sem lotes: só a tabela.
  if (!lotes.length) {
    return (
      <section id="itens" className="card scroll-mt-20 overflow-hidden break-inside-avoid">
        <h3 className="flex items-center gap-2.5 border-b border-border px-5 py-3.5 font-bold text-brand">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-bg"><Package size={16} /></span>
          <span className="flex-1">Itens ({r.itens.length})</span>
        </h3>
        <TabelaItens itens={r.itens} />
      </section>
    );
  }

  const alternar = (nome: string) =>
    onEscolher?.(escolhidos.includes(nome) ? escolhidos.filter((n) => n !== nome) : [...escolhidos, nome]);
  const totalGeral = lotes.reduce((s, l) => s + (l.total ?? 0), 0);
  const escolhidosLotes = lotes.filter((l) => escolhidos.includes(l.nome));
  const totalEscolhido = escolhidosLotes.reduce((s, l) => s + (l.total ?? 0), 0);
  const atual = lotes.find((l) => l.nome === aba);

  return (
    <section id="itens" className="card scroll-mt-20 overflow-hidden">
      <h3 className="flex flex-wrap items-center gap-2.5 border-b border-border px-5 py-3.5 font-bold text-brand">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-bg"><Layers size={16} /></span>
        <span className="flex-1">Itens por lote</span>
        <span className="text-xs font-normal text-muted">{lotes.length} lotes · {itensTxt(r.itens.length)} · {brl(totalGeral)}</span>
      </h3>

      {/* Resumo da escolha */}
      <div className={`flex flex-wrap items-center gap-2 border-b border-border px-5 py-3 text-sm ${escolhidosLotes.length ? "bg-green-50" : "bg-bg/50"}`}>
        {escolhidosLotes.length ? (
          <>
            <span className="font-semibold text-green-800">Você vai participar de {escolhidosLotes.length} lote{escolhidosLotes.length > 1 ? "s" : ""}:</span>
            {escolhidosLotes.map((l) => <span key={l.nome} className="badge bg-green-600 text-white">{l.nome}</span>)}
            <span className="ml-auto font-bold text-green-800">Total estimado: {brl(totalEscolhido)}</span>
          </>
        ) : (
          <span className="text-muted">Escolha os lotes que a empresa vai disputar: abra cada lote e marque <b>Participar deste lote</b>.</span>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 pt-3 print:hidden" role="tablist">
        {[{ id: "__geral", rotulo: "Visão geral", sub: `${lotes.length} lotes`, marcado: false, indice: -1 },
          ...lotes.map((l, n) => ({ id: l.nome, rotulo: l.nome, sub: `${itensTxt(l.itens.length)} · ${l.totalTexto}`, marcado: escolhidos.includes(l.nome), indice: n }))].map((t) => {
          // Cada lote com a sua cor (a mesma da proposta).
          const c = t.indice >= 0 ? corDoLote(t.indice) : null;
          const ativa = aba === t.id;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={ativa} onClick={() => setAba(t.id)}
              className={`-mb-px max-w-[260px] shrink-0 rounded-t-lg border-x border-t border-b-[3px] px-3.5 py-2 text-left transition ${
                ativa ? (c ? `${c.fundo} ${c.borda}` : "border-x-border border-t-border border-b-brand bg-surface") : "border-transparent text-muted hover:bg-bg"
              }`}>
              <div className={`flex items-center gap-1.5 truncate text-[13px] font-bold ${c ? c.texto : ""}`}>
                {c && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.ponto}`} />}
                <span className="truncate">{t.rotulo}</span>
                {t.marcado && <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-green-600 text-white"><Check size={10} strokeWidth={3.5} /></span>}
              </div>
              <div className="truncate text-[11px] text-muted">{t.sub}</div>
            </button>
          );
        })}
      </div>

      {atual ? (
        <div role="tabpanel">
          <div className={`flex flex-wrap items-center gap-3 border-l-4 px-5 py-3.5 ${corDoLote(lotes.indexOf(atual)).fundo} ${corDoLote(lotes.indexOf(atual)).bordaL}`}>
            <div className="min-w-0 flex-1">
              <div className={`font-bold ${corDoLote(lotes.indexOf(atual)).texto}`}>{atual.nome}</div>
              <div className="text-xs text-muted">{itensTxt(atual.itens.length)} · total estimado <b className="text-brand">{atual.totalTexto}</b></div>
            </div>
            {onEscolher && <Participar ligado={escolhidos.includes(atual.nome)} onChange={() => alternar(atual.nome)} />}
          </div>
          <TabelaItens itens={atual.itens} />
        </div>
      ) : (
        <div role="tabpanel" className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {lotes.map((l, n) => {
            const marcado = escolhidos.includes(l.nome);
            const c = corDoLote(n);
            return (
              <div key={l.nome} className={`flex flex-col rounded-xl border border-t-4 p-4 transition ${c.borda} ${marcado ? `${c.fundo} ring-2 ${c.anel}` : "bg-surface"}`}>
                <div className={`flex items-center gap-1.5 text-sm font-bold leading-snug ${c.texto}`}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.ponto}`} />{l.nome}
                </div>
                <div className="mt-1 text-xs text-muted">{itensTxt(l.itens.length)}</div>
                <div className="mt-2 text-lg font-extrabold tabular-nums text-brand">{l.totalTexto}</div>
                <div className="mt-1 line-clamp-2 text-[11px] text-muted">{l.itens.slice(0, 4).map((it) => it.descricao.split(/[,.;]\s/)[0]).join(" · ")}</div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setAba(l.nome)}>{l.itens.length === 1 ? "Ver o item" : `Ver os ${l.itens.length} itens`} →</button>
                  {onEscolher && <Participar ligado={marcado} onChange={() => alternar(l.nome)} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
