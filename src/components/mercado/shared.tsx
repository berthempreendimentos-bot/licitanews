"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { brl, dataBR } from "@/lib/format";
import { UFS } from "@/lib/pncp";
import type { Contrato, Ranking } from "@/lib/mercado";
import { ContratoDetalhe } from "./ContratoDetalhe";

export function fmtCnpj(s: string) {
  const d = s.replace(/\D/g, "");
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : s;
}

/** Chamada a uma rota /api/mercado/* com estado de carregamento e erro. */
export function useApi<T>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const run = useCallback(async (url: string) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(url);
      const d = await r.json();
      if (d.error) {
        setError(d.error);
        setData(null);
      } else setData(d as T);
    } catch {
      setError("Falha ao consultar a fonte de dados.");
    } finally {
      setLoading(false);
    }
  }, []);
  const reset = useCallback(() => { setData(null); setError(""); }, []);
  return { data, loading, error, run, reset };
}

export function Status({ loading, error, msg }: { loading: boolean; error: string; msg?: string }) {
  if (loading) return <div className="card p-6 mb-4 text-sm text-muted">{msg ?? "Consultando o PNCP… (pode levar alguns segundos)"}</div>;
  if (error) return <div className="card p-4 mb-4 text-sm font-semibold">{error}</div>;
  return null;
}

export function UfSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Todas UFs</option>
      {UFS.map((u) => <option key={u}>{u}</option>)}
    </select>
  );
}

export function Bars({ title, data, onPick, pickHint }: { title: string; data: Ranking[]; onPick?: (r: Ranking) => void; pickHint?: string }) {
  const max = Math.max(1, ...data.map((d) => d.valor));
  return (
    <div className="card p-4">
      <h3 className="font-bold text-brand mb-3">{title}</h3>
      {data.length === 0 && <p className="text-sm text-muted">Sem dados.</p>}
      <ul className="space-y-2.5">
        {data.map((r) => (
          <li key={r.chave}>
            <button type="button" disabled={!onPick} onClick={() => onPick?.(r)} title={onPick ? pickHint : undefined}
              className={`w-full text-left ${onPick ? "hover:opacity-70" : "cursor-default"}`}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate font-medium">{r.nome || r.chave}</span>
                <span className="shrink-0 font-semibold">{brl(r.valor, true)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-neutral-200">
                  <div className="h-1.5 rounded-full bg-black" style={{ width: `${(r.valor / max) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-[11px] text-muted">{r.contratos} contr.</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Col = "objeto" | "fornecedor" | "comprador" | "valor" | "assinatura" | "vigencia";
type Row = Contrato & { diasRestantes?: number | null };

/** Tabela de contratos com ordenação e paginação no navegador. */
export function ContratosTable({
  title, items, cols = ["objeto", "fornecedor", "comprador", "valor", "assinatura"], pageSize = 25, defaultSort = "assinatura",
}: { title?: string; items: Row[]; cols?: Col[]; pageSize?: number; defaultSort?: "valor" | "assinatura" | "vigencia" }) {
  const [sort, setSort] = useState<{ by: "valor" | "assinatura" | "vigencia"; desc: boolean }>({ by: defaultSort, desc: defaultSort !== "vigencia" });
  const [page, setPage] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const sorted = useMemo(() => {
    const key = (c: Row) => (sort.by === "valor" ? c.valor : sort.by === "vigencia" ? c.vigenciaFim ?? "" : c.assinatura ?? "");
    return [...items].sort((a, b) => {
      const ka = key(a), kb = key(b);
      const cmp = typeof ka === "number" && typeof kb === "number" ? ka - kb : String(ka).localeCompare(String(kb));
      return sort.desc ? -cmp : cmp;
    });
  }, [items, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize);
  const th = (label: string, by?: "valor" | "assinatura" | "vigencia", right = false) => (
    <th className={`px-4 py-2 font-semibold ${right ? "text-right" : ""}`}>
      {by ? (
        <button className="inline-flex items-center gap-1 hover:text-black" onClick={() => { setSort((s) => ({ by, desc: s.by === by ? !s.desc : true })); setPage(0); }}>
          {label} {sort.by === by && (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
        </button>
      ) : label}
    </th>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="font-bold text-brand">{title ?? "Contratos"}</div>
        <div className="text-xs text-muted">{items.length.toLocaleString("pt-BR")} registros</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
              {cols.includes("objeto") && th("Objeto")}
              {cols.includes("fornecedor") && th("Fornecedor")}
              {cols.includes("comprador") && th("Comprador")}
              {cols.includes("valor") && th("Valor", "valor", true)}
              {cols.includes("assinatura") && th("Assinatura", "assinatura")}
              {cols.includes("vigencia") && th("Fim da vigência", "vigencia")}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {view.map((c) => (
              <tr key={c.id} onClick={() => setAberto(c.id)} title="Ver detalhes e documentos" className="cursor-pointer border-b border-border last:border-0 align-top hover:bg-bg">
                {cols.includes("objeto") && <td className="px-4 py-2.5 max-w-[340px]"><div className="line-clamp-2">{c.objeto || "—"}</div></td>}
                {cols.includes("fornecedor") && (
                  <td className="px-4 py-2.5 max-w-[220px]">
                    <div className="truncate">{c.fornecedorNome || "—"}</div>
                    {c.fornecedorNi && <div className="text-[11px] text-muted">{fmtCnpj(c.fornecedorNi)}</div>}
                  </td>
                )}
                {cols.includes("comprador") && (
                  <td className="px-4 py-2.5 max-w-[220px]">
                    <div className="truncate">{c.orgao}</div>
                    <div className="text-[11px] text-muted">{c.municipio}/{c.uf}</div>
                  </td>
                )}
                {cols.includes("valor") && <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">{brl(c.valor)}</td>}
                {cols.includes("assinatura") && <td className="px-4 py-2.5 whitespace-nowrap text-muted">{dataBR(c.assinatura)}</td>}
                {cols.includes("vigencia") && (
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div>{dataBR(c.vigenciaFim)}</div>
                    {c.diasRestantes != null && (
                      <span className={`badge mt-0.5 ${c.diasRestantes <= 30 ? "bg-black text-white" : "bg-neutral-200 text-neutral-700"}`}>
                        {c.diasRestantes === 0 ? "vence hoje" : `em ${c.diasRestantes}d`}
                      </span>
                    )}
                  </td>
                )}
                <td className="px-2 py-2.5">
                  <a href={c.link} target="_blank" rel="noreferrer" aria-label="Abrir no PNCP" onClick={(e) => e.stopPropagation()} className="text-muted hover:text-black"><ExternalLink size={14} /></a>
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
      {aberto && <ContratoDetalhe id={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}
