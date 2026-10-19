"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, Eye, FileText, X } from "lucide-react";
import { brl, dataBR } from "@/lib/format";

type Arquivo = { titulo: string; tipo: string; data: string | null; url: string };
type Termo = { tipo: string; numero: string; objeto: string; assinatura: string | null; vigenciaFim: string | null; valorAcrescido: number | null; valorGlobal: number | null };
type Detalhe = {
  id: string; numero: string; tipo: string; categoria: string; processo: string; objeto: string; informacaoComplementar: string;
  orgao: string; orgaoCnpj: string; unidade: string; municipio: string; uf: string;
  fornecedor: string; fornecedorNi: string; subcontratado: string;
  valorInicial: number | null; valorGlobal: number | null; valorParcela: number | null; numeroParcelas: number | null; valorAcumulado: number | null;
  assinatura: string | null; vigenciaInicio: string | null; vigenciaFim: string | null; publicacao: string | null; frutoAdesao: boolean;
  linkContrato: string; linkCompra: string | null; arquivos: Arquivo[]; termos: Termo[];
};

const proxy = (url: string, download = false) => `/api/mercado/arquivo?url=${encodeURIComponent(url)}${download ? "&download=1" : ""}`;

function fmtDoc(s: string) {
  const d = s.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`; // CPF parcialmente oculto
  return s;
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-sm break-words">{children || "—"}</div>
    </div>
  );
}

/** Painel lateral com os dados completos de um contrato do PNCP, seus arquivos e aditivos. */
export function ContratoDetalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<Arquivo | null>(null);

  useEffect(() => {
    let alive = true;
    setD(null);
    setError("");
    setViewing(null);
    fetch(`/api/mercado/contrato?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) setError(j.error);
        else setD(j);
      })
      .catch(() => alive && setError("Falha ao consultar o PNCP."));
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (viewing ? setViewing(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, viewing]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className={`h-full w-full overflow-y-auto bg-surface shadow-2xl transition-all ${viewing ? "max-w-[1100px]" : "max-w-[640px]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Contrato {d?.numero ? `nº ${d.numero}` : ""}</div>
            <div className="truncate text-sm font-bold">{d?.orgao ?? "Carregando…"}</div>
          </div>
          {viewing && <button className="btn btn-ghost !py-1" onClick={() => setViewing(null)}>Voltar aos dados</button>}
          <button onClick={onClose} aria-label="Fechar" className="p-1 hover:opacity-60"><X size={18} /></button>
        </div>

        {!d && !error && <div className="p-6 text-sm text-muted">Consultando o contrato no PNCP…</div>}
        {error && <div className="p-6 text-sm font-semibold">{error}</div>}

        {d && viewing && (
          <div className="flex h-[calc(100%-57px)] flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2 text-sm">
              <FileText size={15} />
              <span className="font-semibold">{viewing.tipo}</span>
              <span className="text-muted truncate">{viewing.titulo}</span>
              <a className="btn btn-ghost !py-1 ml-auto" href={proxy(viewing.url)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Nova aba</a>
              <a className="btn btn-ghost !py-1" href={proxy(viewing.url, true)}><Download size={13} /> Baixar</a>
            </div>
            <iframe title={viewing.titulo} src={proxy(viewing.url)} className="w-full flex-1 bg-neutral-100" />
          </div>
        )}

        {d && !viewing && (
          <div className="space-y-5 p-5">
            <div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {d.tipo && <span className="badge bg-neutral-200 text-black">{d.tipo}</span>}
                {d.categoria && <span className="badge bg-neutral-200 text-black">{d.categoria}</span>}
                {d.frutoAdesao && <span className="badge bg-black text-white">Fruto de adesão (carona)</span>}
              </div>
              <p className="text-[15px] font-medium leading-snug">{d.objeto}</p>
              {d.informacaoComplementar && <p className="mt-2 text-sm text-muted">{d.informacaoComplementar}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Valor global</div><div className="text-xl font-extrabold">{brl(d.valorGlobal)}</div></div>
              <div className="card p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Vigência</div><div className="text-sm font-bold mt-1">{dataBR(d.vigenciaInicio)} → {dataBR(d.vigenciaFim)}</div></div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Info label="Fornecedor">{d.fornecedor}{d.fornecedorNi && <div className="text-xs text-muted">{fmtDoc(d.fornecedorNi)}</div>}</Info>
              <Info label="Órgão">{d.orgao}<div className="text-xs text-muted">{fmtDoc(d.orgaoCnpj)}</div></Info>
              <Info label="Unidade">{d.unidade}<div className="text-xs text-muted">{d.municipio}/{d.uf}</div></Info>
              <Info label="Processo">{d.processo}</Info>
              <Info label="Valor inicial">{brl(d.valorInicial)}</Info>
              <Info label="Parcelas">{d.numeroParcelas ? `${d.numeroParcelas} × ${brl(d.valorParcela)}` : "—"}</Info>
              <Info label="Assinatura">{dataBR(d.assinatura)}</Info>
              <Info label="Publicado no PNCP">{dataBR(d.publicacao)}</Info>
              {d.subcontratado && <Info label="Subcontratado">{d.subcontratado}</Info>}
              {d.valorAcumulado != null && <Info label="Valor acumulado">{brl(d.valorAcumulado)}</Info>}
            </div>

            <div>
              <h3 className="font-bold text-brand mb-2">Documentos ({d.arquivos.length})</h3>
              {d.arquivos.length === 0 && <p className="text-sm text-muted">O órgão não publicou arquivos deste contrato no PNCP.</p>}
              <ul className="space-y-2">
                {d.arquivos.map((a) => (
                  <li key={a.url} className="card flex flex-wrap items-center gap-2 p-3">
                    <FileText size={16} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{a.tipo || "Documento"}</div>
                      <div className="truncate text-xs text-muted">{a.titulo} · {dataBR(a.data)}</div>
                    </div>
                    <button className="btn btn-primary !py-1" onClick={() => setViewing(a)}><Eye size={13} /> Visualizar</button>
                    <a className="btn btn-ghost !py-1" href={proxy(a.url, true)} aria-label="Baixar"><Download size={13} /></a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-brand mb-2">Termos aditivos e apostilamentos ({d.termos.length})</h3>
              {d.termos.length === 0 && <p className="text-sm text-muted">Nenhum termo publicado.</p>}
              <ul className="space-y-2">
                {d.termos.map((t, i) => (
                  <li key={i} className="card p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{t.tipo}{t.numero ? ` nº ${t.numero}` : ""}</span>
                      <span className="text-xs text-muted">{dataBR(t.assinatura)}</span>
                      {t.valorAcrescido ? <span className="ml-auto font-semibold">{t.valorAcrescido > 0 ? "+" : ""}{brl(t.valorAcrescido)}</span> : null}
                    </div>
                    {t.objeto && <p className="mt-1 text-muted">{t.objeto}</p>}
                    {t.vigenciaFim && <p className="mt-1 text-xs">Nova vigência até {dataBR(t.vigenciaFim)}</p>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <a className="btn btn-ghost" href={d.linkContrato} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Contrato no PNCP</a>
              {d.linkCompra && <a className="btn btn-ghost" href={d.linkCompra} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Licitação de origem</a>}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
