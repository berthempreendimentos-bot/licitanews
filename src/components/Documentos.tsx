"use client";

import { Download, ExternalLink, Eye, FileText } from "lucide-react";
import { dataBR } from "@/lib/format";

export type ArquivoPncp = { titulo: string; tipo: string; data: string | null; url: string };

/** Endereço do repasse que abre documentos do PNCP no navegador. */
export const proxyArquivo = (url: string, download = false) =>
  `/api/mercado/arquivo?url=${encodeURIComponent(url)}${download ? "&download=1" : ""}`;

/** Lista de documentos públicos do PNCP com Visualizar e Baixar. */
export function ListaArquivos({ arquivos, onView, vazio }: { arquivos: ArquivoPncp[]; onView: (a: ArquivoPncp) => void; vazio?: string }) {
  if (arquivos.length === 0) return <p className="text-sm text-muted">{vazio ?? "Nenhum arquivo publicado no PNCP."}</p>;
  return (
    <ul className="space-y-2">
      {arquivos.map((a) => (
        <li key={a.url} className="card flex flex-wrap items-center gap-2 p-3">
          <FileText size={16} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{a.tipo || "Documento"}</div>
            <div className="truncate text-xs text-muted">{a.titulo} · {dataBR(a.data)}</div>
          </div>
          <button className="btn btn-primary !py-1" onClick={() => onView(a)}><Eye size={13} /> Visualizar</button>
          <a className="btn btn-ghost !py-1" href={proxyArquivo(a.url, true)} aria-label="Baixar"><Download size={13} /></a>
        </li>
      ))}
    </ul>
  );
}

/** Visualizador de um documento dentro de um painel. */
export function VisualizadorArquivo({ arquivo }: { arquivo: ArquivoPncp }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2 text-sm">
        <FileText size={15} />
        <span className="font-semibold">{arquivo.tipo}</span>
        <span className="text-muted truncate">{arquivo.titulo}</span>
        <a className="btn btn-ghost !py-1 ml-auto" href={proxyArquivo(arquivo.url)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Nova aba</a>
        <a className="btn btn-ghost !py-1" href={proxyArquivo(arquivo.url, true)}><Download size={13} /> Baixar</a>
      </div>
      <iframe title={arquivo.titulo} src={proxyArquivo(arquivo.url)} className="w-full flex-1 bg-neutral-100" />
    </div>
  );
}
