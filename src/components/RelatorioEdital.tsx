"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ResultadoEdital } from "@/lib/edital";

/**
 * Relatório minimalista da análise de edital, só para "Imprimir / PDF".
 * Vai direto no <body> (portal) e, enquanto imprime, é a única coisa na página.
 */

const vazio = (v?: string) => !v || /^n[ãa]o informado$/i.test(v.trim());
const limpo = (v?: string) => (vazio(v) ? "—" : v!);

function semRef(t: string): { texto: string; ref: string | null } {
  const m = t.match(/\s*\(((?:p\.|pág|página|item|cláusula|anexo)[^()]*)\)\s*\.?$/i);
  return m ? { texto: t.slice(0, m.index).trim(), ref: m[1].trim() } : { texto: t, ref: null };
}

function R({ v }: { v: string | null | undefined }) {
  if (!v || vazio(v)) return null;
  return <span className="rel-ref"> ({v})</span>;
}

function T({ children, cor = "" }: { children: React.ReactNode; cor?: string }) {
  return <h2 className={`rel-h2 ${cor}`}>{children}</h2>;
}

/** Prazos que decidem a participação ganham destaque. */
const prazoImportante = (evento: string) => /envio|proposta|disputa|lance|abertura|sess[aã]o|habilita/i.test(evento) && !/esclarec|impugna/i.test(evento);

function Itens({ lista }: { lista: string[] }) {
  if (!lista?.length) return <p className="rel-muted">—</p>;
  return (
    <ul className="rel-ul">
      {lista.map((x, i) => { const { texto, ref } = semRef(x); return <li key={i}>{texto}<R v={ref} /></li>; })}
    </ul>
  );
}

/** "Dispensa de Licitação 023/2026 - PREFEITURA MUNICIPAL DE AURELINO LEAL" (sem barras: vira nome de arquivo). */
export function nomeDoRelatorio(r: ResultadoEdital, titulo: string) {
  const g = r.dados_gerais;
  const sem = (s: string) => (vazio(s) ? "" : s.replace(/\s*\([^)]*\)/g, "").trim());
  const pregao = sem(g.modalidade) || sem(g.numero_processo) || titulo;
  const local = sem(g.orgao);
  return [`Análise - ${pregao}`, local].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 140);
}

/** Imprime só o relatório, com o nome do pregão e o local como nome do PDF. */
export function imprimirRelatorio(nome: string) {
  const anterior = document.title;
  document.title = nome; // o navegador sugere o título como nome do arquivo ao salvar em PDF
  document.body.classList.add("imprimindo-relatorio");
  const fim = () => {
    document.title = anterior;
    document.body.classList.remove("imprimindo-relatorio");
    window.removeEventListener("afterprint", fim);
  };
  window.addEventListener("afterprint", fim);
  window.print();
}

type Props = { r: ResultadoEdital; titulo: string; fonte: string; data: string };

export function RelatorioEdital(props: Props) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;
  return createPortal(<RelatorioConteudo {...props} />, document.body);
}

/** O relatório em si (separado do portal para poder ser gerado fora da página). */
export function RelatorioConteudo({ r, titulo, fonte, data }: Props) {
  const g = r.dados_gerais;
  const riscos = [...(r.riscos ?? [])].sort((a, b) => ["alta", "media", "baixa"].indexOf(a.gravidade) - ["alta", "media", "baixa"].indexOf(b.gravidade));
  const hab: [string, string[]][] = [
    ["Jurídica", r.habilitacao.juridica], ["Fiscal e trabalhista", r.habilitacao.fiscal_trabalhista],
    ["Econômico-financeira", r.habilitacao.economico_financeira], ["Técnica", r.habilitacao.tecnica],
  ];

  return (
    <div className="relatorio-print">
      <header className="rel-topo">
        <div className="rel-kicker">Análise de edital · {data}</div>
        <h1 className="rel-h1">{limpo(g.orgao)}</h1>
        <div className="rel-sub">{[g.modalidade, !vazio(g.numero_processo) && `Processo ${g.numero_processo}`, g.criterio_julgamento].filter((x) => x && !vazio(x as string)).join(" · ")}</div>
        <p className="rel-objeto">{g.objeto || titulo}</p>
      </header>

      <table className="rel-fatos">
        <tbody>
          <tr>
            <td><span>Abertura / envio</span>{limpo(semRef(g.data_abertura_sessao ?? "").texto)}</td>
            <td><span>Valor estimado</span>{limpo(semRef(g.valor_estimado ?? "").texto)}</td>
            <td><span>ME/EPP</span>{limpo(semRef(g.exclusivo_me_epp ?? "").texto)}</td>
            <td><span>Disputa</span>{limpo(semRef(g.modo_disputa ?? "").texto)}</td>
          </tr>
        </tbody>
      </table>

      <T>Resumo</T>
      <p className="rel-p">{r.resumo}</p>
      {!vazio(g.portal) && <p className="rel-p"><b>Onde enviar:</b> {g.portal}</p>}

      {r.prazos?.length > 0 && (
        <>
          <T cor="rel-vermelho">Prazos</T>
          <table className="rel-tab">
            <tbody>
              {r.prazos.map((p, i) => {
                const { texto, ref } = semRef(p.quando);
                return <tr key={i} className={prazoImportante(p.evento) ? "rel-urgente" : ""}><td className="rel-w40">{p.evento}</td><td>{texto}<R v={ref} /></td></tr>;
              })}
            </tbody>
          </table>
        </>
      )}

      <T>Habilitação</T>
      <div className="rel-2col">
        {hab.map(([nome, lista]) => (
          <div key={nome} className="rel-bloco"><h3 className="rel-h3">{nome}</h3><Itens lista={lista} /></div>
        ))}
      </div>

      {riscos.length > 0 && (
        <>
          <T cor="rel-vermelho">Riscos</T>
          <ul className="rel-ul rel-riscos">
            {riscos.map((x, i) => (
              <li key={i}>
                <span className={`rel-tag rel-${x.gravidade}`}>{x.gravidade === "media" ? "média" : x.gravidade}</span> <b>{semRef(x.ponto).texto}</b><R v={x.pagina} />
                <div className="rel-muted">→ {x.recomendacao}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      {r.pontos_impugnacao?.length > 0 && (
        <>
          <T cor="rel-roxo">Pontos para impugnação</T>
          <ul className="rel-ul">
            {r.pontos_impugnacao.map((x, i) => (
              <li key={i}><b>{semRef(x.ponto).texto}</b><R v={x.pagina} /><div className="rel-muted">{x.fundamento}</div></li>
            ))}
          </ul>
        </>
      )}

      {r.declaracoes?.length > 0 && (
        <>
          <T>Declarações ({r.declaracoes.length})</T>
          <ol className="rel-ol rel-2col">
            {r.declaracoes.map((d, i) => { const { texto, ref } = semRef(d); return <li key={i}>{texto}<R v={ref} /></li>; })}
          </ol>
        </>
      )}

      <T>Proposta e execução</T>
      <table className="rel-tab">
        <tbody>
          {([["Validade", r.proposta.validade_proposta], ["Amostras", r.proposta.amostras], ["Garantia", r.proposta.garantia],
            ["Prazo de entrega", r.execucao.prazo_entrega], ["Local", r.execucao.local], ["Pagamento", r.execucao.pagamento],
            ["Vigência", r.execucao.vigencia]] as const).map(([k, v]) => {
            const { texto, ref } = semRef(v ?? "");
            return <tr key={k}><td className="rel-w25">{k}</td><td>{limpo(texto)}<R v={ref} /></td></tr>;
          })}
        </tbody>
      </table>
      <div className="rel-2col">
        <div className="rel-bloco"><h3 className="rel-h3">Exigências da proposta</h3><Itens lista={r.proposta.exigencias} /></div>
        <div className="rel-bloco"><h3 className="rel-h3">Penalidades</h3><Itens lista={r.execucao.penalidades} /></div>
      </div>

      {r.itens?.length > 0 && (
        <>
          <T>Itens ({r.itens.length})</T>
          <table className="rel-tab">
            <thead><tr><th>Nº</th><th>Descrição</th><th className="rel-dir">Qtd.</th><th>Unid.</th><th className="rel-dir">Estimado</th></tr></thead>
            <tbody>
              {r.itens.map((it, i) => (
                <tr key={i}><td>{it.numero}</td><td>{it.descricao}</td><td className="rel-dir">{it.quantidade}</td><td>{it.unidade}</td><td className="rel-dir">{vazio(it.valor_estimado) ? "—" : it.valor_estimado}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {r.checklist?.length > 0 && (
        <>
          <T cor="rel-verde">Checklist</T>
          <ol className="rel-ol rel-2col rel-check">{r.checklist.map((c, i) => <li key={i}>{c}</li>)}</ol>
        </>
      )}

      <footer className="rel-rodape">Fonte: {fonte} · Gerado pelo PEPPACORP LICITA com IA. Confira no edital original antes de decidir ou impugnar.</footer>
    </div>
  );
}
