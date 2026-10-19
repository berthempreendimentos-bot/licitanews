"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Empty, PageHeader, StatCard } from "@/components/ui";
import { AtaDetalhe } from "@/components/AtaDetalhe";
import { Status, UfSelect, useApi } from "@/components/mercado/shared";
import { dataBR } from "@/lib/format";
import type { Ata } from "@/lib/mercado";

type Row = Ata & { diasRestantes: number | null };

export default function AtasRegistroPreco() {
  const [q, setQ] = useState("");
  const [uf, setUf] = useState("");
  const [situacao, setSituacao] = useState("vigentes");
  const [aberta, setAberta] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { data, loading, error, run } = useApi<{ items: Row[]; analisadas: number; totalNoPncp: number }>();

  const go = () => {
    if (!q.trim()) return;
    const p = new URLSearchParams({ q: q.trim(), situacao });
    if (uf) p.set("uf", uf);
    setPage(0);
    void run(`/api/atas?${p}`);
  };
  const view = useMemo(() => data?.items.slice(page * 25, page * 25 + 25) ?? [], [data, page]);
  const pages = data ? Math.max(1, Math.ceil(data.items.length / 25)) : 1;
  const vencendo = data?.items.filter((a) => a.diasRestantes != null && a.diasRestantes <= 60).length ?? 0;

  return (
    <>
      <PageHeader title="Atas de Registro de Preço" subtitle="Atas do PNCP: preços homologados, vencedores, vigência e documentos" />
      <form className="card p-4 mb-4 grid gap-3 sm:grid-cols-[1fr_130px_150px_auto]" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input className="input" placeholder="Produto, serviço ou órgão (ex.: pneus, medicamentos, prefeitura de campinas)" value={q} onChange={(e) => setQ(e.target.value)} required />
        <UfSelect value={uf} onChange={setUf} />
        <select className="input" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          <option value="vigentes">Só vigentes</option>
          <option value="todas">Todas</option>
        </select>
        <button className="btn btn-primary justify-center" disabled={loading}><Search size={14} /> Buscar</button>
      </form>

      {!data && !loading && !error && (
        <Empty title="Pesquise atas de registro de preço"
          text="Abra uma ata para ver os itens, quem venceu cada um, o preço homologado (e o desconto sobre o estimado) e os documentos. Ata vigente com adesão permitida pode ser usada por outros órgãos (carona)." />
      )}
      <Status loading={loading} error={error} />

      {data && !loading && (
        <>
          <p className="mb-3 text-xs text-muted">{data.analisadas} atas mais recentes analisadas · {data.totalNoPncp.toLocaleString("pt-BR")} no PNCP com o termo</p>
          <div className="grid grid-cols-2 gap-3 mb-4 max-w-xl">
            <StatCard label={situacao === "vigentes" ? "Atas vigentes" : "Atas"} value={data.items.length} />
            <StatCard label="Vencem em até 60 dias" value={vencendo} accent={vencendo > 0} />
          </div>
          {data.items.length === 0 ? <Empty title="Nenhuma ata encontrada" text="Tente outro termo, outra UF ou inclua as atas encerradas." /> : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                      <th className="px-4 py-2">Ata</th><th className="px-4 py-2">Objeto</th><th className="px-4 py-2">Órgão</th><th className="px-4 py-2">Vigência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.map((a) => (
                      <tr key={a.id} onClick={() => setAberta(a.id)} title="Ver itens, preços e documentos" className="cursor-pointer border-b border-border last:border-0 align-top hover:bg-bg">
                        <td className="px-4 py-2.5 whitespace-nowrap font-medium">{a.titulo.replace(/^Ata nº\s*/i, "") || "—"}</td>
                        <td className="px-4 py-2.5 max-w-[420px]"><div className="line-clamp-2">{a.objeto || "—"}</div></td>
                        <td className="px-4 py-2.5 max-w-[240px]"><div className="truncate">{a.orgao}</div><div className="text-[11px] text-muted">{a.municipio}/{a.uf}</div></td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div>{dataBR(a.vigenciaFim)}</div>
                          {a.diasRestantes != null && (
                            <span className={`badge mt-0.5 ${a.diasRestantes < 0 ? "bg-neutral-100 text-neutral-500" : a.diasRestantes <= 60 ? "bg-black text-white" : "bg-neutral-200 text-neutral-700"}`}>
                              {a.diasRestantes < 0 ? "encerrada" : a.diasRestantes === 0 ? "vence hoje" : `em ${a.diasRestantes}d`}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
                  <button className="btn btn-ghost !py-1" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
                  <span className="text-xs text-muted">Página {page + 1} de {pages}</span>
                  <button className="btn btn-ghost !py-1" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {aberta && <AtaDetalhe id={aberta} onClose={() => setAberta(null)} />}
    </>
  );
}
