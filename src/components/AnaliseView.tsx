"use client";

import {
  AlertTriangle, Banknote, CalendarClock, CheckSquare, FileCheck2, FileText, Gavel, ListChecks, Package, Scale, Timer, Truck, Users,
} from "lucide-react";
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

/** Card de uma seção da análise. */
function Secao({ id, titulo, icon: Icon, children, className = "", extra }: {
  id?: string; titulo: string; icon?: React.ElementType; children: React.ReactNode; className?: string; extra?: React.ReactNode;
}) {
  return (
    <section id={id} className={`card scroll-mt-20 overflow-hidden break-inside-avoid ${className}`}>
      <h3 className="flex items-center gap-2.5 border-b border-border px-5 py-3.5 font-bold text-brand">
        {Icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-bg"><Icon size={16} /></span>}
        <span className="flex-1">{titulo}</span>
        {extra}
      </h3>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Bloco pequeno dentro de um card (campo, prazo, item). */
function Bloco({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-bg/60 p-3.5 break-inside-avoid ${className}`}>{children}</div>;
}

function Rotulo({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] font-semibold uppercase tracking-wider text-muted ${className}`}>{children}</div>;
}

function Lista({ itens, vazioTexto = "Não informado." }: { itens: string[]; vazioTexto?: string }) {
  if (!itens?.length) return <p className="text-sm text-muted">{vazioTexto}</p>;
  return (
    <ul className="space-y-2 text-sm leading-relaxed">
      {itens.map((t, i) => {
        const { texto, ref } = semReferencia(t);
        return <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" /><span>{texto}<Ref v={ref} /></span></li>;
      })}
    </ul>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  const { texto, ref } = semReferencia(valor ?? "");
  return (
    <Bloco>
      <Rotulo>{rotulo}</Rotulo>
      <div className="mt-1 text-sm font-medium leading-snug break-words">{vazio(valor) ? <span className="text-muted">—</span> : <>{texto}<Ref v={ref} /></>}</div>
    </Bloco>
  );
}

const GRAV: Record<string, { tag: string; borda: string; nome: string }> = {
  alta: { tag: "bg-red-600 text-white", borda: "border-t-red-600", nome: "Alta" },
  media: { tag: "bg-yellow-400 text-black", borda: "border-t-yellow-400", nome: "Média" },
  baixa: { tag: "bg-neutral-200 text-neutral-700", borda: "border-t-neutral-300", nome: "Baixa" },
};

/** Prazos que decidem a participação ganham destaque. */
const prazoImportante = (evento: string) => /envio|proposta|disputa|lance|abertura|sess[aã]o|habilita/i.test(evento) && !/esclarec|impugna/i.test(evento);

const SECOES: [string, string][] = [
  ["prazos", "Prazos"], ["habilitacao", "Habilitação"], ["riscos", "Riscos"], ["declaracoes", "Declarações"],
  ["proposta", "Proposta e execução"], ["itens", "Itens"], ["checklist", "Checklist"],
];

/** Exibe o resultado estruturado da análise de edital. */
export function AnaliseView({ r }: { r: ResultadoEdital }) {
  const g = r.dados_gerais;
  const riscos = [...(r.riscos ?? [])].sort((a, b) => ["alta", "media", "baixa"].indexOf(a.gravidade) - ["alta", "media", "baixa"].indexOf(b.gravidade));
  const riscosAltos = riscos.filter((x) => x.gravidade === "alta").length;
  const destaques: [string, string, React.ElementType][] = [
    ["Abertura / envio", g.data_abertura_sessao, CalendarClock], ["Valor estimado", g.valor_estimado, Banknote],
    ["Exclusivo ME/EPP", g.exclusivo_me_epp, Users], ["Modo de disputa", g.modo_disputa, Scale],
  ];
  const habilitacao = ([["Jurídica", r.habilitacao.juridica], ["Fiscal e trabalhista", r.habilitacao.fiscal_trabalhista],
    ["Econômico-financeira", r.habilitacao.economico_financeira], ["Técnica", r.habilitacao.tecnica]] as const);

  return (
    // print-color-adjust: o "Imprimir / PDF" mantém as cores dos cards.
    <div className="space-y-5 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      {/* Resumo */}
      <section className="card overflow-hidden break-inside-avoid">
        <div className="bg-black p-5 text-white sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Resumo para decisão</span>
            {riscosAltos > 0 && <span className="badge bg-red-600 text-white"><AlertTriangle size={11} /> {riscosAltos} risco{riscosAltos > 1 ? "s" : ""} alto{riscosAltos > 1 ? "s" : ""}</span>}
          </div>
          <p className="mt-2 text-[15px] leading-relaxed text-white/95">{r.resumo}</p>
        </div>
        <nav className="flex flex-wrap gap-1.5 p-3 print:hidden" aria-label="Seções da análise">
          {SECOES.filter(([id]) => id !== "itens" || r.itens?.length).map(([id, nome]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted hover:border-brand hover:text-brand">
              {nome}{id === "riscos" && riscosAltos > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{riscosAltos}</span>}
            </a>
          ))}
        </nav>
      </section>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {destaques.map(([k, v, Icon]) => (
          <div key={k} className="card p-4 break-inside-avoid">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bg text-brand"><Icon size={14} /></span>
              <Rotulo>{k}</Rotulo>
            </div>
            <div className="mt-2 text-sm font-bold leading-snug">{vazio(v) ? "—" : semReferencia(v).texto}</div>
          </div>
        ))}
      </div>

      <Secao titulo="Dados gerais" icon={FileText}>
        <p className="mb-4 rounded-xl bg-bg/60 p-3.5 text-sm font-medium leading-relaxed">{g.objeto}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Órgão" valor={g.orgao} />
          <Campo rotulo="Processo / nº" valor={g.numero_processo} />
          <Campo rotulo="Modalidade" valor={g.modalidade} />
          <Campo rotulo="Critério de julgamento" valor={g.criterio_julgamento} />
          <Campo rotulo="Consórcio" valor={g.permite_consorcio} />
          <Campo rotulo="Registro de preços" valor={g.registro_de_precos} />
          <div className="sm:col-span-2 lg:col-span-3"><Campo rotulo="Portal / onde enviar" valor={g.portal} /></div>
        </div>
      </Secao>

      <Secao id="prazos" titulo="Prazos" icon={CalendarClock} extra={<span className="text-xs font-normal text-muted">{r.prazos?.length ?? 0}</span>}>
        {!r.prazos?.length && <p className="text-sm text-muted">Não informado.</p>}
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {r.prazos?.map((p, i) => {
            const { texto, ref } = semReferencia(p.quando);
            const importante = prazoImportante(p.evento);
            return (
              <li key={i} className={`flex flex-col rounded-xl border p-3.5 break-inside-avoid ${importante ? "border-red-200 bg-red-50" : "border-border bg-bg/60"}`}>
                <div className={`flex items-start gap-2 text-[11px] font-bold uppercase leading-snug tracking-wider ${importante ? "text-red-700" : "text-muted"}`}>
                  <Timer size={13} className="mt-px shrink-0" /> {p.evento}
                </div>
                <div className="mt-1.5 flex-1 text-sm font-semibold leading-snug">{texto}</div>
                {ref && <div className="mt-2"><Ref v={ref} /></div>}
              </li>
            );
          })}
        </ol>
      </Secao>

      <Secao id="habilitacao" titulo="Habilitação" icon={CheckSquare}
        extra={<span className="text-xs font-normal text-muted">{habilitacao.reduce((t, [, l]) => t + (l?.length ?? 0), 0)} exigências</span>}>
        <div className="grid gap-3 md:grid-cols-2">
          {habilitacao.map(([nome, itens]) => (
            <Bloco key={nome} className="!bg-surface">
              <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-brand">{nome}</span>
                <span className="badge bg-bg text-muted">{itens?.length ?? 0}</span>
              </div>
              <Lista itens={itens} />
            </Bloco>
          ))}
        </div>
      </Secao>

      <Secao id="riscos" titulo="Riscos" icon={AlertTriangle} extra={riscosAltos > 0 && <span className="badge bg-red-600 text-white">{riscosAltos} alto{riscosAltos > 1 ? "s" : ""}</span>}>
        {!riscos.length && <p className="text-sm text-muted">Nenhum risco relevante apontado.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {riscos.map((x, i) => {
            const cor = GRAV[x.gravidade] ?? GRAV.baixa;
            const { texto } = semReferencia(x.ponto);
            return (
              <li key={i} className={`flex flex-col rounded-xl border border-border border-t-4 bg-surface p-3.5 text-sm break-inside-avoid ${cor.borda}`}>
                <div className="flex items-center gap-2">
                  <span className={`badge ${cor.tag}`}>{cor.nome}</span>
                  <Ref v={x.pagina} />
                </div>
                <div className="mt-2 font-semibold leading-snug">{texto}</div>
                <div className="mt-2.5 flex-1 rounded-lg bg-bg/70 p-2.5 leading-relaxed text-muted">
                  <span className="font-semibold text-brand">O que fazer: </span>{x.recomendacao}
                </div>
              </li>
            );
          })}
        </ul>
      </Secao>

      <Secao titulo="Pontos para impugnação" icon={Gavel} extra={<span className="text-xs font-normal text-muted">{r.pontos_impugnacao?.length ?? 0}</span>}>
        {!r.pontos_impugnacao?.length && <p className="text-sm text-muted">Nenhum ponto com base legal identificado.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {r.pontos_impugnacao?.map((x, i) => {
            const { texto } = semReferencia(x.ponto);
            return (
              <li key={i} className="flex flex-col rounded-xl border border-border bg-surface p-3.5 text-sm break-inside-avoid">
                <div className="font-semibold leading-snug">{texto}<Ref v={x.pagina} /></div>
                <div className="mt-2.5 flex-1 rounded-lg bg-bg/70 p-2.5 leading-relaxed text-muted">
                  <span className="font-semibold text-brand">Fundamento: </span>{x.fundamento}
                </div>
              </li>
            );
          })}
        </ul>
      </Secao>

      <Secao id="declaracoes" titulo="Declarações exigidas" icon={FileCheck2} extra={<span className="text-xs font-normal text-muted">{r.declaracoes?.length ?? 0} declarações</span>}>
        {!r.declaracoes?.length && <p className="text-sm text-muted">Não informado.</p>}
        <ol className="grid gap-3 md:grid-cols-2">
          {r.declaracoes?.map((d, i) => {
            const { texto, ref } = semReferencia(d);
            return (
              <li key={i} className="flex gap-3 rounded-xl border border-border bg-bg/60 p-3 text-sm leading-relaxed break-inside-avoid">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-black text-[11px] font-bold text-white">{i + 1}</span>
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
          <Rotulo className="mb-2">Exigências</Rotulo>
          <Lista itens={r.proposta.exigencias} />
        </Secao>
        <Secao titulo="Execução do contrato" icon={Truck}>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Prazo de entrega" valor={r.execucao.prazo_entrega} />
            <Campo rotulo="Local" valor={r.execucao.local} />
            <Campo rotulo="Pagamento" valor={r.execucao.pagamento} />
            <Campo rotulo="Vigência" valor={r.execucao.vigencia} />
          </div>
          <Rotulo className="mb-2">Penalidades</Rotulo>
          <Lista itens={r.execucao.penalidades} />
        </Secao>
      </div>

      {r.itens?.length > 0 && (
        <Secao id="itens" titulo={`Itens (${r.itens.length})`} icon={Package} className="[&>div]:p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg/60 text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-2">Nº</th><th className="px-4 py-2">Descrição</th><th className="px-4 py-2 text-right">Qtd.</th><th className="px-4 py-2">Unid.</th><th className="px-4 py-2 text-right">Estimado</th>
                </tr>
              </thead>
              <tbody>
                {r.itens.map((it, i) => (
                  <tr key={i} className="border-b border-border last:border-0 align-top break-inside-avoid">
                    <td className="px-4 py-2.5"><span className="grid h-6 min-w-6 place-items-center rounded-md bg-bg px-1 text-xs font-bold">{it.numero}</span></td>
                    <td className="px-4 py-2.5 font-medium leading-relaxed">{it.descricao}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{it.quantidade}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">{it.unidade}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums text-muted">{vazio(it.valor_estimado) ? "—" : it.valor_estimado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <Secao id="checklist" titulo="Checklist para participar" icon={ListChecks} extra={<span className="text-xs font-normal text-muted">{r.checklist?.length ?? 0} passos</span>}>
        <ol className="grid gap-3 md:grid-cols-2">
          {r.checklist?.map((c, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-border bg-bg/60 p-3 text-sm leading-relaxed break-inside-avoid">
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
