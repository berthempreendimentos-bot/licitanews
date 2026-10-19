"use client";

import { AlertTriangle, CalendarClock, CheckSquare, FileCheck2, FileText, Gavel, ListChecks, Package, Truck } from "lucide-react";
import type { ResultadoEdital } from "@/lib/edital";

const vazio = (v?: string) => !v || /^n[ãa]o informado$/i.test(v.trim());

/** Separa a referência ao edital ("(p. 19, item 13.10.1.I)") do texto, para mostrar como etiqueta. */
function semReferencia(t: string): { texto: string; ref: string | null } {
  const m = t.match(/\s*\(((?:p\.|pág|página|item|cláusula|anexo)[^()]*)\)\s*\.?$/i);
  return m ? { texto: t.slice(0, m.index).trim(), ref: m[1].trim() } : { texto: t, ref: null };
}

function Ref({ v }: { v: string | null }) {
  if (!v || vazio(v)) return null;
  return <span className="ml-1.5 inline-block whitespace-nowrap rounded bg-bg px-1.5 py-0.5 align-middle text-[10px] font-semibold text-muted">{v}</span>;
}

function Secao({ id, titulo, icon: Icon, children, className = "", extra }: {
  id?: string; titulo: string; icon?: React.ElementType; children: React.ReactNode; className?: string; extra?: React.ReactNode;
}) {
  return (
    <section id={id} className={`card scroll-mt-20 p-5 break-inside-avoid ${className}`}>
      <h3 className="mb-3 flex items-center gap-2 font-bold text-brand">{Icon && <Icon size={17} />} <span className="flex-1">{titulo}</span>{extra}</h3>
      {children}
    </section>
  );
}

function Lista({ itens, vazioTexto = "Não informado." }: { itens: string[]; vazioTexto?: string }) {
  if (!itens?.length) return <p className="text-sm text-muted">{vazioTexto}</p>;
  return (
    <ul className="space-y-1.5 text-sm leading-relaxed">
      {itens.map((t, i) => {
        const { texto, ref } = semReferencia(t);
        return <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" /><span>{texto}<Ref v={ref} /></span></li>;
      })}
    </ul>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{rotulo}</div>
      <div className="text-sm break-words">{vazio(valor) ? <span className="text-muted">—</span> : valor}</div>
    </div>
  );
}

const GRAV: Record<string, { tag: string; borda: string }> = {
  alta: { tag: "bg-red-600 text-white", borda: "border-l-red-600" },
  media: { tag: "bg-yellow-400 text-black", borda: "border-l-yellow-400" },
  baixa: { tag: "bg-neutral-200 text-neutral-700", borda: "border-l-neutral-300" },
};

/** Prazos que decidem a participação ganham destaque na linha do tempo. */
const prazoImportante = (evento: string) => /envio|proposta|disputa|lance|abertura|sess[aã]o/i.test(evento) && !/esclarec|impugna/i.test(evento);

const SECOES: [string, string][] = [
  ["prazos", "Prazos"], ["riscos", "Riscos"], ["habilitacao", "Habilitação"], ["declaracoes", "Declarações"],
  ["proposta", "Proposta e execução"], ["itens", "Itens"], ["checklist", "Checklist"],
];

/** Exibe o resultado estruturado da análise de edital. */
export function AnaliseView({ r }: { r: ResultadoEdital }) {
  const g = r.dados_gerais;
  const riscosAltos = r.riscos?.filter((x) => x.gravidade === "alta").length ?? 0;
  const destaques: [string, string][] = [
    ["Abertura da sessão", g.data_abertura_sessao], ["Valor estimado", g.valor_estimado],
    ["Exclusivo ME/EPP", g.exclusivo_me_epp], ["Modo de disputa", g.modo_disputa],
  ];

  return (
    <div className="space-y-5">
      {/* Resumo + indicadores */}
      <section className="card overflow-hidden">
        <div className="bg-black p-5 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Resumo para decisão</div>
          <p className="mt-1.5 text-[15px] leading-relaxed">{r.resumo}</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
          {destaques.map(([k, v]) => (
            <div key={k} className="p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</div>
              <div className="mt-0.5 text-sm font-semibold leading-snug">{vazio(v) ? "—" : semReferencia(v).texto}</div>
            </div>
          ))}
        </div>
        <nav className="flex flex-wrap gap-1.5 p-3 print:hidden" aria-label="Seções da análise">
          {SECOES.filter(([id]) => id !== "itens" || r.itens?.length).map(([id, nome]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted hover:border-brand hover:text-brand">
              {nome}{id === "riscos" && riscosAltos > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{riscosAltos}</span>}
            </a>
          ))}
        </nav>
      </section>

      <Secao titulo="Dados gerais" icon={FileText}>
        <p className="mb-4 text-sm font-medium leading-relaxed">{g.objeto}</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <Campo rotulo="Órgão" valor={g.orgao} />
          <Campo rotulo="Processo / nº" valor={g.numero_processo} />
          <Campo rotulo="Modalidade" valor={g.modalidade} />
          <Campo rotulo="Critério de julgamento" valor={g.criterio_julgamento} />
          <Campo rotulo="Portal" valor={g.portal} />
          <Campo rotulo="Consórcio" valor={g.permite_consorcio} />
          <Campo rotulo="Registro de preços" valor={g.registro_de_precos} />
        </div>
      </Secao>

      <Secao id="prazos" titulo="Prazos" icon={CalendarClock}>
        {!r.prazos?.length && <p className="text-sm text-muted">Não informado.</p>}
        <ol className="grid gap-3 md:grid-cols-2">
          {r.prazos?.map((p, i) => {
            const { texto, ref } = semReferencia(p.quando);
            const importante = prazoImportante(p.evento);
            return (
              <li key={i} className={`rounded-lg border-l-4 p-3 ${importante ? "border-l-red-600 bg-red-50" : "border-l-neutral-300 bg-bg"}`}>
                <div className={`text-[11px] font-bold uppercase tracking-wider ${importante ? "text-red-700" : "text-muted"}`}>{p.evento}</div>
                <div className="mt-1 text-sm font-semibold leading-snug">{texto}<Ref v={ref} /></div>
              </li>
            );
          })}
        </ol>
      </Secao>

      <div id="riscos" className="grid scroll-mt-20 gap-5 lg:grid-cols-2">
        <Secao titulo="Riscos" icon={AlertTriangle} extra={riscosAltos > 0 && <span className="badge bg-red-600 text-white">{riscosAltos} alto{riscosAltos > 1 ? "s" : ""}</span>}>
          {!r.riscos?.length && <p className="text-sm text-muted">Nenhum risco relevante apontado.</p>}
          <ul className="space-y-2.5">
            {[...(r.riscos ?? [])].sort((a, b) => ["alta", "media", "baixa"].indexOf(a.gravidade) - ["alta", "media", "baixa"].indexOf(b.gravidade)).map((x, i) => {
              const cor = GRAV[x.gravidade] ?? GRAV.baixa;
              return (
                <li key={i} className={`rounded-lg border-l-4 bg-bg p-3 text-sm ${cor.borda}`}>
                  <div className="flex items-start gap-2">
                    <span className={`badge mt-0.5 shrink-0 ${cor.tag}`}>{x.gravidade === "media" ? "média" : x.gravidade}</span>
                    <span className="font-semibold leading-snug">{x.ponto}</span>
                  </div>
                  <div className="mt-1 leading-relaxed text-muted">{x.recomendacao}<Ref v={x.pagina} /></div>
                </li>
              );
            })}
          </ul>
        </Secao>
        <Secao titulo="Pontos para impugnação" icon={Gavel}>
          {!r.pontos_impugnacao?.length && <p className="text-sm text-muted">Nenhum ponto com base legal identificado.</p>}
          <ul className="space-y-2.5">
            {r.pontos_impugnacao?.map((x, i) => (
              <li key={i} className="rounded-lg bg-bg p-3 text-sm">
                <div className="font-semibold leading-snug">{x.ponto}<Ref v={x.pagina} /></div>
                <div className="mt-1 leading-relaxed text-muted">{x.fundamento}</div>
              </li>
            ))}
          </ul>
        </Secao>
      </div>

      <Secao id="habilitacao" titulo="Habilitação" icon={CheckSquare}>
        <div className="grid gap-5 md:grid-cols-2">
          {([["Jurídica", r.habilitacao.juridica], ["Fiscal e trabalhista", r.habilitacao.fiscal_trabalhista],
            ["Econômico-financeira", r.habilitacao.economico_financeira], ["Técnica", r.habilitacao.tecnica]] as const).map(([nome, itens]) => (
            <div key={nome}>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">{nome}<span className="rounded-full bg-bg px-1.5">{itens?.length ?? 0}</span></div>
              <Lista itens={itens} />
            </div>
          ))}
        </div>
      </Secao>

      <Secao id="declaracoes" titulo="Declarações exigidas" icon={FileCheck2} extra={<span className="text-xs font-normal text-muted">{r.declaracoes?.length ?? 0} declarações</span>}>
        {!r.declaracoes?.length && <p className="text-sm text-muted">Não informado.</p>}
        <ol className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {r.declaracoes?.map((d, i) => {
            const { texto, ref } = semReferencia(d);
            return (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border border-neutral-400 text-[10px] font-bold text-muted">{i + 1}</span>
                <span>{texto}<Ref v={ref} /></span>
              </li>
            );
          })}
        </ol>
      </Secao>

      <div id="proposta" className="grid scroll-mt-20 gap-5 lg:grid-cols-2">
        <Secao titulo="Proposta" icon={Package}>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo rotulo="Validade" valor={r.proposta.validade_proposta} />
            <Campo rotulo="Amostras" valor={r.proposta.amostras} />
            <Campo rotulo="Garantia" valor={r.proposta.garantia} />
          </div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Exigências</div>
          <Lista itens={r.proposta.exigencias} />
        </Secao>
        <Secao titulo="Execução do contrato" icon={Truck}>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Prazo de entrega" valor={r.execucao.prazo_entrega} />
            <Campo rotulo="Local" valor={r.execucao.local} />
            <Campo rotulo="Pagamento" valor={r.execucao.pagamento} />
            <Campo rotulo="Vigência" valor={r.execucao.vigencia} />
          </div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Penalidades</div>
          <Lista itens={r.execucao.penalidades} />
        </Secao>
      </div>

      {r.itens?.length > 0 && (
        <section id="itens" className="card scroll-mt-20 overflow-hidden">
          <div className="px-5 pt-5 pb-2 font-bold text-brand">Itens ({r.itens.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-2">Nº</th><th className="px-4 py-2">Descrição</th><th className="px-4 py-2 text-right">Qtd.</th><th className="px-4 py-2">Unid.</th><th className="px-4 py-2 text-right">Estimado</th>
                </tr>
              </thead>
              <tbody>
                {r.itens.map((it, i) => (
                  <tr key={i} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-2.5 font-semibold">{it.numero}</td>
                    <td className="px-4 py-2.5 leading-relaxed">{it.descricao}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{it.quantidade}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{it.unidade}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{vazio(it.valor_estimado) ? "—" : it.valor_estimado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Secao id="checklist" titulo="Checklist para participar" icon={ListChecks}>
        <ol className="space-y-2">
          {r.checklist?.map((c, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black text-[11px] font-bold text-white">{i + 1}</span>
              <span className="pt-0.5">{c}</span>
            </li>
          ))}
        </ol>
      </Secao>
      <p className="text-xs text-muted">Análise gerada por IA a partir do edital. Confira sempre no documento original antes de decidir ou impugnar.</p>
    </div>
  );
}
