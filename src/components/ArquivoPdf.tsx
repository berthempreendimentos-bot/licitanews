"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, ExternalLink, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchComLogin } from "@/lib/useAdmin";

export type ArquivoDoc = { path: string; nome: string; tamanho: number };

const MAX_BYTES = 20 * 1024 * 1024;

export function tamanhoLegivel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Envia o PDF direto para o Supabase Storage (o servidor só autoriza). */
export async function enviarPdf(file: File, docId: string): Promise<ArquivoDoc> {
  if (!supabase) throw new Error("O envio de arquivos precisa do login (Supabase).");
  const { path, token } = await fetchComLogin("/api/documentos/arquivo", {
    method: "POST", body: JSON.stringify({ nome: file.name, tamanho: file.size, docId }),
  });
  const { error } = await supabase.storage.from("documentos").uploadToSignedUrl(path, token, file, { contentType: "application/pdf" });
  if (error) throw new Error(`Falha ao enviar o PDF: ${error.message}`);
  return { path, nome: file.name, tamanho: file.size };
}

export async function removerPdf(path: string) {
  await fetchComLogin(`/api/documentos/arquivo?path=${encodeURIComponent(path)}`, { method: "DELETE" }).catch(() => {});
}

/** Nome seguro para arquivo dentro do .zip (sem acento problemático nem barra). */
function nomeArquivo(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "documento";
}

type DocParaZip = { tipo: string; descricao: string; numero: string; validade: string | null; link: string; arquivo?: ArquivoDoc };

/**
 * Baixa todos os PDFs de uma pasta num .zip (montado no navegador) com um índice.txt
 * listando cada documento, validade e link. Devolve quantos PDFs entraram.
 */
export async function baixarPastaZip(nomePasta: string, docs: DocParaZip[], onProgresso?: (feitos: number, total: number) => void) {
  const { zipSync, strToU8 } = await import("fflate");
  const arquivos: Record<string, Uint8Array> = {};
  const usados = new Set<string>();
  const comPdf = docs.filter((d) => d.arquivo);
  const falhas: string[] = [];
  let feitos = 0;
  onProgresso?.(0, comPdf.length);
  for (const d of comPdf) {
    const base = nomeArquivo(d.descricao ? `${d.tipo} - ${d.descricao}` : d.tipo);
    let nome = `${base}.pdf`;
    for (let i = 2; usados.has(nome.toLowerCase()); i++) nome = `${base} (${i}).pdf`;
    try {
      const { url } = await fetchComLogin(`/api/documentos/arquivo?path=${encodeURIComponent(d.arquivo!.path)}`);
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      arquivos[nome] = new Uint8Array(await r.arrayBuffer());
      usados.add(nome.toLowerCase());
    } catch {
      falhas.push(d.descricao || d.tipo);
    }
    onProgresso?.(++feitos, comPdf.length);
  }
  const linhas = docs.map((d) => [
    `• ${d.tipo}${d.descricao ? ` — ${d.descricao}` : ""}`,
    d.numero && `  Número: ${d.numero}`,
    `  Validade: ${d.validade ? d.validade.split("-").reverse().join("/") : "sem validade"}`,
    d.link && `  Link: ${d.link}`,
    !d.arquivo && "  (sem PDF no PEPPACORP)",
  ].filter(Boolean).join("\r\n"));
  if (falhas.length) linhas.push(`\r\nNão foi possível baixar: ${falhas.join(", ")}`);
  arquivos["indice.txt"] = strToU8(`Pasta: ${nomePasta}\r\n\r\n${linhas.join("\r\n\r\n")}\r\n`);
  // PDF já é comprimido: guardar sem recomprimir deixa o zip rápido.
  const zip = zipSync(arquivos, { level: 0 });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
  a.download = `${nomeArquivo(nomePasta)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return { pdfs: comPdf.length - falhas.length, falhas };
}

/** Área para escolher ou arrastar o PDF. Mostra o atual (com Visualizar) ou o novo escolhido. */
export function UploadPdf({ atual, novo, onEscolher, onRemover, onVer }: {
  atual?: ArquivoDoc;
  novo: File | null;
  onEscolher: (f: File | null) => void;
  onRemover: () => void;
  onVer: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState("");

  function escolher(f: File | undefined) {
    setErro("");
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return setErro("Escolha um arquivo PDF.");
    if (f.size > MAX_BYTES) return setErro("O PDF pode ter até 20 MB.");
    onEscolher(f);
  }

  const mostrado = novo ? { nome: novo.name, tamanho: novo.size } : atual;
  return (
    <div>
      {mostrado ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2.5">
          <FileText size={20} className="shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{mostrado.nome}</div>
            <div className="text-[11px] text-muted">{tamanhoLegivel(mostrado.tamanho)}{novo ? " · será enviado ao salvar" : " · salvo no PEPPACORP"}</div>
          </div>
          {!novo && atual && <button type="button" className="btn btn-ghost !py-1 !text-xs" onClick={onVer}><Eye size={13} /> Visualizar</button>}
          <button type="button" className="btn btn-ghost !py-1 !text-xs" onClick={() => input.current?.click()}>Trocar</button>
          <button type="button" aria-label="Remover PDF" className="text-muted hover:text-black" onClick={() => (novo ? onEscolher(null) : onRemover())}><X size={16} /></button>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files[0]); }}
          className={`flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition ${arrastando ? "border-brand bg-bg" : "border-border hover:border-brand/40"}`}>
          <UploadCloud size={22} className="text-muted" />
          <span className="text-sm font-semibold">Arraste o PDF aqui ou clique para escolher</span>
          <span className="text-[11px] text-muted">Só PDF, até 20 MB · fica guardado no PEPPACORP</span>
        </button>
      )}
      <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden"
        onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
      {erro && <div className="mt-1 text-xs text-danger">{erro}</div>}
    </div>
  );
}

/** Visualizador do PDF salvo (link temporário de 10 min). */
export function VisualizarPdf({ arquivo, titulo, onClose }: { arquivo: ArquivoDoc; titulo: string; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => {
    fetchComLogin(`/api/documentos/arquivo?path=${encodeURIComponent(arquivo.path)}`)
      .then((d) => setUrl(d.url))
      .catch((e) => setErro((e as Error).message));
  }, [arquivo.path]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/60 p-3 sm:p-6" onClick={onClose}>
      <div className="card mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <FileText size={18} className="shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{titulo}</div>
            <div className="truncate text-[11px] text-muted">{arquivo.nome} · {tamanhoLegivel(arquivo.tamanho)}</div>
          </div>
          {url && <a className="btn btn-ghost !py-1 !text-xs" href={url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir em nova aba</a>}
          <button aria-label="Fechar" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex-1 bg-bg">
          {erro ? <div className="p-6 text-sm text-danger">{erro}</div>
            : url ? <iframe src={url} title={arquivo.nome} className="h-full w-full" />
              : <div className="flex h-full items-center justify-center text-sm text-muted"><Loader2 size={16} className="mr-2 animate-spin" /> Carregando PDF…</div>}
        </div>
      </div>
    </div>
  );
}
