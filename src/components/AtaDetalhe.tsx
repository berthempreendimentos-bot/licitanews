"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { brl, dataBR } from "@/lib/format";
import type { ItemCompra } from "@/lib/compra";
import { ListaArquivos, VisualizadorArquivo, type ArquivoPncp } from "./Documentos";

type Ata = {
  id: string; numero: string; objeto: string; modalidade: string; orgao: string; orgaoCnpj: string;
  unidade: string; municipio: string; uf: string; assinatura: string | null; vigenciaInicio: string | null;
  vigenciaFim: string | null; cancelado: boolean; adesao: boolean | null; linkAta: string; linkCompra: string;
  arquivos: ArquivoPncp[]; itens: ItemCompra[];
};

const fmtPreco = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v < 10 ? 4 : 2 });

/** Painel com a ata, seus documentos e o preço homologado de cada item. */
export function AtaDetalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<Ata | null>(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<ArquivoPncp | null>(null);

  useEffect(() => {
    let alive = true;
    setD(null); setError(""); setViewing(null);
    fetch(`/api/ata?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.error) setError(j.error); else setD(j); })
      .catch(() => alive && setError("Falha ao consultar o PNCP."));
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (viewing) setViewing(null); else onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, viewing]);

  const totalEstimado = d?.itens.reduce((a, i) => a + (i.valorTotalEstimado ?? 0), 0) ?? 0;
  const totalHomologado = d?.itens.reduce((a, i) => a + (i.vencedor?.valorTotal ?? 0), 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside className={`h-full w-full overflow-y-auto bg-surface shadow-2xl ${viewing ? "max-w-[1100px]" : "max-w-[900px]"}`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Ata de registro de preço {d?.numero ? `nº ${d.numero}` : ""}</div>
            <div className="truncate text-sm font-bold">{d?.orgao ?? "Carregando…"}</div>
          </div>
          {viewing && <button className="btn btn-ghost !py-1" onClick={() => setViewing(null)}>Voltar aos dados</button>}
          <button onClick={onClose} aria-label="Fechar" className="p-1 hover:opacity-60"><X size={18} /></button>
        </div>

        {!d && !error && <div className="p-6 text-sm text-muted">Consultando a ata e os preços homologados no PNCP…</div>}
        {error && <div className="p-6 text-sm font-semibold">{error}</div>}
        {d && viewing && <div className="h-[calc(100%-57px)]"><VisualizadorArquivo arquivo={viewing} /></div>}

        {d && !viewing && (
          <div className="space-y-5 p-5">
            <div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {d.modalidade && <span className="badge bg-neutral-200 text-black">{d.modalidade}</span>}
                {d.cancelado && <span className="badge bg-black text-white">Cancelada</span>}
                {d.adesao === true && <span className="badge bg-black text-white">Permite adesão (carona)</span>}
                {d.adesao === false && <span className="badge bg-neutral-200 text-black">Sem adesão</span>}
              </div>
              <p className="text-[15px] font-medium leading-snug">{d.objeto}</p>
              <p className="mt-1 text-xs text-muted">{d.unidade} · {d.municipio}/{d.uf}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Vigência</div><div className="mt-1 text-sm font-bold">{dataBR(d.vigenciaInicio)} → {dataBR(d.vigenciaFim)}</div></div>
              <div className="card p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Itens</div><div className="text-xl font-extrabold">{d.itens.length}</div></div>
              <div className="card p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Estimado</div><div className="text-lg font-extrabold">{brl(totalEstimado, true)}</div></div>
              <div className="card p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Homologado</div><div className="text-lg font-extrabold">{brl(totalHomologado, true)}</div></div>
            </div>

            <div>
              <h3 className="mb-2 font-bold text-brand">Documentos ({d.arquivos.length})</h3>
              <ListaArquivos arquivos={d.arquivos} onView={setViewing} />
            </div>

            <div className="card overflow-hidden">
              <div className="px-4 pt-4 pb-2 font-bold text-brand">Itens e preços homologados</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                      <th className="px-3 py-2">#</th><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qtd.</th>
                      <th className="px-3 py-2 text-right">Estimado</th><th className="px-3 py-2 text-right">Homologado</th>
                      <th className="px-3 py-2 text-right">Desc.</th><th className="px-3 py-2">Vencedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.itens.map((i) => {
                      const est = i.valorUnitarioEstimado, hom = i.vencedor?.valorUnitario ?? null;
                      const desc = est && hom != null ? (1 - hom / est) * 100 : null;
                      return (
                        <tr key={i.numero} className="border-b border-border last:border-0 align-top">
                          <td className="px-3 py-2 text-muted">{i.numero}</td>
                          <td className="px-3 py-2 max-w-[300px]"><div className="line-clamp-2">{i.descricao}</div></td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{i.quantidade.toLocaleString("pt-BR")} {i.unidade}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{fmtPreco(est)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{fmtPreco(hom)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{desc != null ? `${desc.toFixed(0)}%` : "—"}</td>
                          <td className="px-3 py-2 max-w-[200px]"><div className="truncate">{i.vencedor?.nome || (i.temResultado ? "—" : i.situacao || "Sem resultado")}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <a className="btn btn-ghost" href={d.linkAta} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Ata no PNCP</a>
              <a className="btn btn-ghost" href={d.linkCompra} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Licitação de origem</a>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
