"use client";

import { Fragment, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Empty } from "@/components/ui";
import { useCollection, useEmpresa } from "@/lib/store";
import { DADOS_PROPOSTA_VAZIOS, moeda, porExtenso, totais, totalItem } from "@/lib/proposta";

/** Proposta comercial pronta para imprimir ou salvar em PDF (Ctrl+P → Salvar como PDF). */
export default function ImprimirProposta() {
  const { id } = useParams<{ id: string }>();
  const { items, ready } = useCollection("propostas");
  const { empresa } = useEmpresa();
  const p = items.find((x) => x.id === id);

  // A proposta sai só com os dados do cliente: o título da aba (que o navegador usa como nome do PDF)
  // é o da proposta, não o do sistema.
  const titulo = p ? ["Proposta", empresa.razao_social, [p.modalidade, p.numeroLicitacao].filter(Boolean).join(" ")].filter(Boolean).join(" - ").replace(/[\/:*?"<>|]+/g, "-") : "";
  useEffect(() => {
    if (!titulo) return;
    const anterior = document.title;
    document.title = titulo;
    return () => { document.title = anterior; };
  }, [titulo]);

  if (!ready) return <div className="text-sm text-muted">Carregando…</div>;
  if (!p) return <Empty title="Proposta não encontrada" action={<Link className="btn btn-ghost" href="/propostas">Voltar</Link>} />;

  const d = { ...DADOS_PROPOSTA_VAZIOS, ...(empresa.dados_proposta ?? {}) };
  const itens = p.itens.filter((i) => i.participar);
  const t = totais(p);
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const falta = (v: string, rotulo: string) => v || <span className="text-red-600 print:text-black">[{rotulo}]</span>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/propostas/${p.id}`} className="btn btn-ghost"><ArrowLeft size={14} /> Voltar à proposta</Link>
        <button className="btn btn-primary" onClick={() => window.print()}><Printer size={14} /> Imprimir / Salvar PDF</button>
        <span className="text-xs text-muted">Na janela de impressão, escolha “Salvar como PDF”. Campos em vermelho estão faltando.</span>
      </div>

      {/* Margem zero na folha: o navegador não imprime cabeçalho/rodapé (título do sistema, data e endereço do site). */}
      <style>{"@page { margin: 0; } @media print { .proposta-folha { padding: 14mm 15mm !important; } }"}</style>
      <article className="proposta-folha mx-auto max-w-[210mm] bg-white p-10 text-[12px] leading-relaxed text-black shadow-sm print:max-w-none print:shadow-none">
        <div className="border-b-2 border-black pb-3">
          <div className="text-lg font-extrabold uppercase">{falta(empresa.razao_social, "razão social")}</div>
          <div>CNPJ {falta(empresa.cnpj, "CNPJ")}</div>
          <div>{[d.endereco, d.cidade_uf, d.cep && `CEP ${d.cep}`].filter(Boolean).join(" · ") || falta("", "endereço")}</div>
          <div>{[d.telefone && `Tel. ${d.telefone}`, d.email].filter(Boolean).join(" · ")}</div>
        </div>

        <h1 className="mt-5 text-center text-base font-extrabold uppercase tracking-wide">Proposta comercial</h1>

        <section className="mt-4 space-y-0.5">
          <div><b>Ao(À):</b> {falta(p.orgao, "órgão")}</div>
          <div><b>{p.modalidade || "Licitação"} nº:</b> {falta(p.numeroLicitacao, "número")}{p.processo && <> · <b>Processo:</b> {p.processo}</>}</div>
          <div><b>Objeto:</b> {p.titulo}</div>
        </section>

        {p.carta?.trim() && (
          <section className="mt-5 space-y-3 text-justify">
            {p.carta.trim().split(/\n\s*\n/).map((par, k) => <p key={k} className="whitespace-pre-line">{par}</p>)}
          </section>
        )}

        <table className="mt-5 w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-neutral-100">
              {["Item", "Descrição", "Marca / modelo", "Un.", "Qtd", "Preço unit.", "Preço total"].map((h) => (
                <th key={h} className="border border-black px-1.5 py-1 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((i, idx) => (
              <Fragment key={i.numero}>
              {/* Edital por lotes: cabeçalho com o subtotal de cada lote. */}
              {i.lote && i.lote !== itens[idx - 1]?.lote && (
                <tr className="break-inside-avoid bg-neutral-100 font-bold">
                  <td colSpan={6} className="border border-black px-1.5 py-1">{i.lote}</td>
                  <td className="border border-black px-1.5 py-1 text-right tabular-nums">
                    {moeda(itens.filter((x) => x.lote === i.lote && x.precoUnitario != null).reduce((sm, x) => sm + totalItem(x), 0))}
                  </td>
                </tr>
              )}
              <tr className="break-inside-avoid">
                <td className="border border-black px-1.5 py-1 text-center align-top">{i.numeroEdital ?? i.numero}</td>
                <td className="border border-black px-1.5 py-1 align-top">{i.descricaoOfertada?.trim() || i.descricao}</td>
                <td className="border border-black px-1.5 py-1 align-top">{[i.marca, i.modelo].filter(Boolean).join(" / ") || "—"}</td>
                <td className="border border-black px-1.5 py-1 align-top">{i.unidade}</td>
                <td className="border border-black px-1.5 py-1 text-right align-top tabular-nums">{i.quantidade.toLocaleString("pt-BR")}</td>
                <td className="border border-black px-1.5 py-1 text-right align-top tabular-nums">{i.precoUnitario != null ? moeda(i.precoUnitario) : "—"}</td>
                <td className="border border-black px-1.5 py-1 text-right align-top tabular-nums">{i.precoUnitario != null ? moeda(totalItem(i)) : "—"}</td>
              </tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td colSpan={6} className="border border-black px-1.5 py-1 text-right">VALOR GLOBAL</td>
              <td className="border border-black px-1.5 py-1 text-right tabular-nums">{moeda(t.total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-1.5"><b>Valor global por extenso:</b> {porExtenso(t.total)}.</p>
        {t.semPreco > 0 && <p className="mt-1 text-red-600 print:hidden">Atenção: {t.semPreco} item(ns) marcados para participar estão sem preço.</p>}

        <section className="mt-5 space-y-0.5">
          <div><b>Validade da proposta:</b> {p.validadeDias} dias a contar da data de abertura da sessão.</div>
          <div><b>Prazo de entrega:</b> {falta(p.prazoEntrega, "prazo de entrega")}</div>
          {p.localEntrega && <div><b>Local de entrega:</b> {p.localEntrega}</div>}
          <div><b>Condições de pagamento:</b> {falta(p.condicoesPagamento, "condições de pagamento")}</div>
          {p.garantia && <div><b>Garantia:</b> {p.garantia}</div>}
          {(d.banco || d.agencia || d.conta) && <div><b>Dados bancários:</b> {[d.banco, d.agencia && `Agência ${d.agencia}`, d.conta && `Conta ${d.conta}`].filter(Boolean).join(" · ")}</div>}
          {p.observacoes && <div><b>Observações:</b> {p.observacoes}</div>}
        </section>

        <div className="mt-12 break-inside-avoid text-center">
          <div>{d.cidade_uf || "[cidade/UF]"}, {hoje}.</div>
          <div className="mx-auto mt-14 w-80 border-t border-black pt-1">
            <div className="font-bold">{falta(d.representante, "representante legal")}</div>
            <div>{[d.cargo, d.cpf_representante && `CPF ${d.cpf_representante}`].filter(Boolean).join(" · ")}</div>
            <div>{empresa.razao_social}</div>
          </div>
        </div>
      </article>
    </>
  );
}
