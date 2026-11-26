"use client";

import { Suspense, useMemo, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Download, Eye, ExternalLink, FilePlus2, FileUp, Folder, FolderPlus, KanbanSquare, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Empty, PageHeader, StatCard } from "@/components/ui";
import { AnaliseView } from "@/components/AnaliseView";
import { imprimirRelatorio, nomeDoRelatorio, RelatorioEdital } from "@/components/RelatorioEdital";
import { baixarPastaZip, enviarPdf, removerPdf, UploadPdf, VisualizarPdf, type ArquivoDoc } from "@/components/ArquivoPdf";
import { IALendo } from "@/components/IALendo";
import { AnalisesSalvas } from "@/components/AnalisesSalvas";
import { db, newId, useCollection, useEmpresa } from "@/lib/store";
import { cabecalhosIA, iaDaEmpresa } from "@/lib/ia";
import { dataBR, diasAte, nowIso } from "@/lib/format";
import { TIPOS_DOCUMENTO, type AnaliseEdital, type DocumentoEmpresa, type PastaDocumentos } from "@/lib/types";

// ------------------------------------------------------------------- Certidões
function statusDoc(d: DocumentoEmpresa) {
  const dias = diasAte(d.validade ? `${d.validade}T23:59:59` : null);
  if (dias == null) return { label: "Sem validade", cls: "bg-neutral-100 text-neutral-500", dias };
  if (dias < 0) return { label: "Vencido", cls: "bg-black text-white", dias };
  if (dias <= 15) return { label: `Vence em ${dias}d`, cls: "bg-black text-white", dias };
  if (dias <= 30) return { label: `Vence em ${dias}d`, cls: "bg-neutral-600 text-white", dias };
  return { label: "Válido", cls: "bg-neutral-200 text-black", dias };
}

function DocForm({ doc, pastaInicial, onClose, onVer }: {
  doc: DocumentoEmpresa | null; pastaInicial: string | null; onClose: () => void; onVer: (d: DocumentoEmpresa) => void;
}) {
  const { items: pastas } = useCollection("pastas");
  const [f, setF] = useState<DocumentoEmpresa>(doc ?? {
    id: newId(), tipo: TIPOS_DOCUMENTO[0], descricao: "", numero: "", emissao: null, validade: null, link: "", pasta_id: pastaInicial, observacao: "", created_at: nowIso(),
  });
  const set = <K extends keyof DocumentoEmpresa>(k: K, v: DocumentoEmpresa[K]) => setF((x) => ({ ...x, [k]: v }));
  // PDF: novo escolhido (enviado ao salvar) ou o atual marcado para remover.
  const [novoPdf, setNovoPdf] = useState<File | null>(null);
  const [removerAtual, setRemoverAtual] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const atual = removerAtual ? undefined : f.arquivo;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      let arquivo: ArquivoDoc | undefined = atual;
      if (novoPdf) arquivo = await enviarPdf(novoPdf, f.id);
      // O PDF anterior sai do Storage só depois que o novo foi salvo.
      if (f.arquivo && f.arquivo.path !== arquivo?.path) await removerPdf(f.arquivo.path);
      const salvo: DocumentoEmpresa = { ...f, arquivo };
      if (!arquivo) delete salvo.arquivo;
      db.upsert("documentos", salvo);
      onClose();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <form className="card my-4 w-full max-w-lg space-y-3 p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-brand">{doc ? "Editar documento" : "Novo documento"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="text-xs font-semibold text-muted">Pasta
          <div className="input mt-1">{(() => {
            if (!f.pasta_id) return "Sem pasta";
            const p = pastas.find((x) => x.id === f.pasta_id);
            if (!p) return "Sem pasta";
            if (p.parent_id) {
              const r = pastas.find((x) => x.id === p.parent_id);
              return `${r?.nome ?? ""} / ${p.nome}`;
            }
            return p.nome;
          })()}</div>
        </div>
        <select className="input" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
          {TIPOS_DOCUMENTO.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input className="input" placeholder="Descrição (ex.: CND conjunta RFB/PGFN)" value={f.descricao} onChange={(e) => set("descricao", e.target.value)} />
        <input className="input" placeholder="Número / código de controle" value={f.numero} onChange={(e) => set("numero", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-muted">Emissão<input type="date" className="input mt-1" value={f.emissao ?? ""} onChange={(e) => set("emissao", e.target.value || null)} /></label>
          <label className="text-xs font-semibold text-muted">Validade<input type="date" className="input mt-1" value={f.validade ?? ""} onChange={(e) => set("validade", e.target.value || null)} /></label>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">Arquivo PDF</div>
          <UploadPdf atual={atual} novo={novoPdf} onEscolher={setNovoPdf}
            onRemover={() => { if (confirm("Remover o PDF deste documento? Ele é apagado ao salvar.")) setRemoverAtual(true); }}
            onVer={() => onVer(f)} />
        </div>
        <input className="input" placeholder="Link do arquivo (Google Drive, OneDrive...) — opcional" value={f.link} onChange={(e) => set("link", e.target.value)} />
        <textarea className="input min-h-16" placeholder="Observações" value={f.observacao} onChange={(e) => set("observacao", e.target.value)} />
        {erro && <div className="text-xs text-danger">{erro}</div>}
        <div className="flex justify-between">
          {doc ? <button type="button" className="btn btn-ghost" disabled={salvando} onClick={() => {
            if (!confirm("Excluir este documento?")) return;
            if (doc.arquivo) void removerPdf(doc.arquivo.path);
            db.remove("documentos", doc.id);
            onClose();
          }}><Trash2 size={14} /> Excluir</button> : <span />}
          <button className="btn btn-primary" disabled={salvando}>
            {salvando ? <><Loader2 size={14} className="animate-spin" /> {novoPdf ? "Enviando PDF..." : "Salvando..."}</> : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Filtro da lista: todas, sem pasta ou o id de uma pasta. */
type FiltroPasta = "todas" | "sem" | string;

function nomeCompletoPasta(id: string, pastas: PastaDocumentos[]): string {
  const p = pastas.find((x) => x.id === id);
  if (!p) return "";
  if (p.parent_id) {
    const r = pastas.find((x) => x.id === p.parent_id);
    return `${r?.nome ?? ""} / ${p.nome}`;
  }
  return p.nome;
}

function BarraPastas({ pastas, docs, filtro, setFiltro }: {
  pastas: PastaDocumentos[]; docs: DocumentoEmpresa[]; filtro: FiltroPasta; setFiltro: (f: FiltroPasta) => void;
}) {
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const ids = new Set(pastas.map((p) => p.id));
  const semPasta = docs.filter((d) => !d.pasta_id || !ids.has(d.pasta_id)).length;

  const toggle = (id: string) => setExpandidas((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => {
    const todasAbertas = expandidas.size === pastas.filter((p) => !p.parent_id).length && pastas.filter((p) => !p.parent_id).length > 0;
    if (todasAbertas) {
      setExpandidas(new Set());
    } else {
      setExpandidas(new Set(pastas.filter((p) => !p.parent_id).map((p) => p.id)));
    }
  };
  const todasAbertas = expandidas.size > 0 && expandidas.size >= pastas.filter((p) => !p.parent_id).length;

  const raizes = [...pastas].filter((p) => !p.parent_id).sort((a, b) => a.nome.localeCompare(b.nome));
  const pastasPorPai = useMemo(() => {
    const m = new Map<string | null | undefined, PastaDocumentos[]>();
    for (const p of pastas) {
      const arr = m.get(p.parent_id) ?? [];
      arr.push(p);
      m.set(p.parent_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.nome.localeCompare(b.nome));
    return m;
  }, [pastas]);

  const contagemDocs = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) {
      m.set(d.pasta_id ?? "sem", (m.get(d.pasta_id ?? "sem") ?? 0) + 1);
    }
    return m;
  }, [docs]);

  function contarDocsPasta(pastaId: string): number {
    const diretos = contagemDocs.get(pastaId) ?? 0;
    const subIds = pastas.filter((p) => p.parent_id === pastaId).map((p) => p.id);
    const nasSubs = subIds.reduce((s, sid) => s + (contagemDocs.get(sid) ?? 0), 0);
    return diretos + nasSubs;
  }

  return (
    <div className="mb-4">
      {/* Cabeçalho da barra de pastas */}
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">Pastas</span>
        {raizes.length > 1 && (
          <button onClick={toggleAll} className="text-[11px] font-medium text-accent hover:underline">
            {todasAbertas ? "Recolher" : "Expandir todas"}
          </button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setFiltro("todas")} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${filtro === "todas" ? "bg-black text-white" : "text-muted hover:text-black hover:bg-bg"}`}>
            Todas <span className={`text-[10px] tabular-nums ${filtro === "todas" ? "text-white/60" : "text-muted/60"}`}>{docs.length}</span>
          </button>
          {semPasta > 0 && pastas.length > 0 && (
            <button onClick={() => setFiltro("sem")} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${filtro === "sem" ? "bg-black text-white" : "text-muted hover:text-black hover:bg-bg"}`}>
              Sem pasta <span className={`text-[10px] tabular-nums ${filtro === "sem" ? "text-white/60" : "text-muted/60"}`}>{semPasta}</span>
            </button>
          )}
        </div>
      </div>

      {/* Arvore de pastas */}
      <div className="card p-2.5">
        {raizes.length === 0 ? (
          <p className="text-xs text-muted px-2 py-1">Nenhuma pasta criada ainda. Clique em "Nova pasta" para comecar.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {raizes.map((p) => {
              const subs = pastasPorPai.get(p.id) ?? [];
              const aberta = expandidas.has(p.id);
              const ativa = filtro === p.id;
              const totalPasta = contarDocsPasta(p.id);

              return (
                <span key={p.id} className="inline-flex flex-col">
                  <div className="flex items-center gap-0.5">
                    {subs.length > 0 && (
                      <button
                        onClick={() => toggle(p.id)}
                        className={`p-1 rounded-md transition hover:bg-bg ${ativa ? "text-white hover:text-white" : "text-muted hover:text-black"}`}
                        title={aberta ? "Recolher" : "Expandir"}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform: aberta ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                    {subs.length === 0 && <span className={`w-[26px] shrink-0 ${ativa ? "text-white/80" : "text-neutral-400"}`}><Folder size={14} /></span>}

                    <button
                      onClick={() => setFiltro(p.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors ${ativa ? "bg-black text-white shadow-sm" : "text-muted hover:text-black hover:bg-bg"}`}
                    >
                      {subs.length === 0 && <Folder size={14} className={ativa ? "text-white/70" : "text-neutral-400"} />}
                      <span className="truncate max-w-[130px]">{p.nome}</span>
                      <span className={`text-[11px] tabular-nums ${ativa ? "text-white/60" : "text-muted/60"}`}>{totalPasta}</span>
                    </button>

                    <div className="relative">
                      <button
                        className={`p-1 rounded-md transition hover:bg-bg ${ativa ? "text-white/70 hover:text-white hover:bg-white/10" : "text-muted/50 hover:text-danger"}`}
                        onClick={() => setMenuAberto(menuAberto === p.id ? null : p.id)}
                        aria-label="Opcoes da pasta"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="4" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="12" r="1.5" fill="currentColor"/></svg>
                      </button>
                      {menuAberto === p.id && (
                        <div className="absolute right-0 z-20 mt-1 w-44 flex flex-col gap-0.5 rounded-xl border border-border bg-white p-1 shadow-lg">
                          <button className="btn btn-ghost !py-1.5 !text-xs whitespace-nowrap text-left justify-start" onClick={(e) => {
                            e.stopPropagation();
                            const nome = prompt("Nome da subpasta")?.trim();
                            if (!nome) return;
                            db.upsert("pastas", { id: newId(), nome, parent_id: p.id, created_at: nowIso() });
                            toggle(p.id);
                            setMenuAberto(null);
                          }}><Plus size={13} /> Nova subpasta</button>
                          <button className="btn btn-ghost !py-1.5 !text-xs whitespace-nowrap text-left justify-start" onClick={(e) => {
                            e.stopPropagation();
                            const idsSet = new Set([p.id, ...pastas.filter((s) => s.parent_id === p.id).map((s) => s.id)]);
                            const selecionados = docs.filter((d) => d.pasta_id && idsSet.has(d.pasta_id)).map((d) => {
                              return { ...d, subpasta: nomeCompletoPasta(d.pasta_id, pastas) || null };
                            });
                            baixarPastaZip(p.nome, selecionados, () => {}).catch((e) => alert(`Falha: ${(e as Error).message}`));
                            setMenuAberto(null);
                          }}><Download size={13} /> Baixar pasta</button>
                          <button className="btn btn-ghost !py-1.5 !text-xs whitespace-nowrap text-left justify-start text-danger" onClick={(e) => {
                            e.stopPropagation();
                            if (!confirm(`Excluir a pasta "${p.nome}" e todo o seu conteúdo (subpastas e documentos)?`)) return;
                            const idsSet = new Set([p.id, ...pastas.filter((s) => s.parent_id === p.id).map((s) => s.id)]);
                            docs.filter((d) => d.pasta_id && idsSet.has(d.pasta_id)).forEach((d) => { if (d.arquivo) void removerPdf(d.arquivo.path); db.remove("documentos", d.id); });
                            [...pastas].filter((s) => s.parent_id === p.id).forEach((s) => db.remove("pastas", s.id));
                            db.remove("pastas", p.id);
                            setFiltro("todas");
                            setMenuAberto(null);
                          }}><Trash2 size={13} /> Excluir pasta</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {aberta && subs.length > 0 && (
                    <div className="ml-3 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-3 border-l-2 border-border/60">
                      {subs.map((s) => {
                        const subCount = contagemDocs.get(s.id) ?? 0;
                        const subAtiva = filtro === s.id;
                        return (
                          <button key={s.id} onClick={() => { setFiltro(s.id); setMenuAberto(null); }}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors ${subAtiva ? "bg-black text-white shadow-sm" : "border border-border text-muted hover:text-black hover:border-black/30 bg-surface"}`}>
                            <Folder size={13} className={subAtiva ? "text-white/70" : "text-neutral-400"} />
                            <span className="truncate max-w-[110px]">{s.nome}</span>
                            <span className={`text-[10px] tabular-nums ${subAtiva ? "text-white/60" : "text-muted/50"}`}>{subCount}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Botao Nova Pasta */}
      <div className="mt-2.5">
        <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => {
          const nome = prompt("Nome da nova pasta (ex.: Habilitacao 2026, Pregao 12/2026)")?.trim();
          if (!nome) return;
          const p: PastaDocumentos = { id: newId(), nome, parent_id: null, created_at: nowIso() };
          db.upsert("pastas", p);
          const subpastas = ["Atestados", "Financeira", "Fiscal", "Juridica", "RATE e PAT", "Proposta", "Declaracao e variados"];
          for (const s of subpastas) db.upsert("pastas", { id: newId(), nome: s, parent_id: p.id, created_at: nowIso() });
          setFiltro(p.id);
        }}><FolderPlus size={14} /> Nova pasta</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------- Lista de Certidoes
type TabDoc = "todas" | "vencidas" | "validas";
function Certidoes() {
  const { items: todos } = useCollection("documentos");
  const { items: pastas } = useCollection("pastas");
  const [filtroPasta, setFiltroPasta] = useState<FiltroPasta>("todas");
  const [tab, setTab] = useState<TabDoc>("todas");
  const [edit, setEdit] = useState<DocumentoEmpresa | null | "new">(null);
  const [vendo, setVendo] = useState<DocumentoEmpresa | null>(null);
  const [baixando, setBaixando] = useState("");
  const pastaFiltro = pastas.find((p) => p.id === filtroPasta) ?? null;
  const ids = new Set(pastas.map((p) => p.id));
  let docs = [...todos];
  if (filtroPasta !== "todas") {
    if (filtroPasta === "sem") docs = docs.filter((d) => !d.pasta_id || !ids.has(d.pasta_id));
    else {
      const filhos = new Set([filtroPasta, ...pastas.filter((s) => s.parent_id === filtroPasta).map((s) => s.id)]);
      docs = docs.filter((d) => d.pasta_id && filhos.has(d.pasta_id));
    }
  }
  if (tab === "vencidas") docs = docs.filter((d) => d.validade && new Date(`${d.validade}T23:59:59`) < new Date());
  if (tab === "validas") docs = docs.filter((d) => d.validade && new Date(`${d.validade}T23:59:59`) >= new Date());
  docs.sort((a, b) => a.tipo.localeCompare(b.tipo) || (a.descricao ?? "").localeCompare(b.descricao ?? ""));
  const porTipo = docs.reduce<Record<string, DocumentoEmpresa[]>>((acc, d) => { (acc[d.tipo] ??= []).push(d); return acc; }, {});
  const contagem = docs.length;

  return (
    <div>
      <BarraPastas pastas={pastas} docs={todos} filtro={filtroPasta} setFiltro={setFiltroPasta} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-0.5">
          {([["todas", `Todas (${contagem})`], ["vencidas", "Vencidas"], ["validas", "Válidas"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === k ? "bg-black text-white" : "text-muted hover:text-black"}`}>{l}</button>
          ))}
        </div>
        <button className="btn btn-ghost !py-1.5 ml-auto" onClick={() => setEdit("new")}><Plus size={14} /> Novo documento</button>
        <button className="btn btn-ghost !py-1.5" onClick={() => {
          const sel = docs.filter((d) => d.arquivo).map((d) => ({ ...d, subpasta: nomeCompletoPasta(d.pasta_id ?? "", pastas) || null }));
          if (!sel.length) { alert("Nenhum documento com PDF para baixar."); return; }
          baixarPastaZip(pastaFiltro?.nome ?? "documentos", sel, setBaixando).catch((e) => alert(`Falha: ${(e as Error).message}`));
        }} disabled={!!baixando}>
          <Download size={14} /> {baixando ? "Compactando..." : `Baixar ZIP (${docs.filter((d) => d.arquivo).length})`}
        </button>
      </div>

      {!docs.length ? <div className="text-center text-sm text-muted py-10">Nenhum documento neste filtro.</div> : null}
      {Object.entries(porTipo).map(([tipo, lista]) => {
        const semVencimento = lista.filter((d) => !d.validade).length;
        return (
          <div key={tipo} className="mb-6">
            <div className="font-bold text-sm text-brand mb-2">{tipo} {semVencimento > 0 && <span className="text-muted text-xs">({semVencimento} sem validade)</span>}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {lista.map((d) => {
                const st = statusDoc(d);
                const nome = d.arquivo?.nome ?? d.descricao ?? "Sem nome";
                return (
                  <div key={d.id} className={`card space-y-2 p-3.5 transition hover:shadow-sm border-l-4 ${d.validade && new Date(`${d.validade}T23:59:59`) < new Date() ? "border-l-black" : st.dias != null && st.dias <= 30 ? "border-l-neutral-500" : "border-l-transparent"}`}>
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] font-bold">{d.numero ?? "—"}</span>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-semibold">{d.descricao || "Sem descrição"}</div>
                        {d.emissao && <div className="text-[11px] text-muted">Emissão {dataBR(d.emissao)}</div>}
                        {d.validade && <div className="text-[11px] font-semibold">Validade {dataBR(d.validade)} {d.dias == null ? "" : <span className={st.cls.split(" ").filter((c, i) => i > 0).join(" ")}>({st.label})</span>}</div>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {d.arquivo && <span className="rounded bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">PDF</span>}
                      {d.link && <a href={d.link} target="_blank" rel="noreferrer" className="rounded bg-bg px-2 py-0.5 text-[10px] font-semibold text-accent hover:underline">Link</a>}
                      {d.observacao && <span className="rounded bg-bg px-2 py-0.5 text-[10px] font-semibold text-muted line-clamp-1">{d.observacao}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      {d.arquivo && (
                        <button className="btn btn-ghost !py-1 !text-xs" onClick={() => setVendo(d)} aria-label="Visualizar PDF">
                          <Eye size={12} />
                        </button>
                      )}
                      {d.arquivo && (
                        <button className="btn btn-ghost !py-1 !text-xs" onClick={() => {
                          try {
                            const url = URL.createObjectURL(new Blob([d.arquivo!.base64!], { type: "application/pdf" }));
                            const a = document.createElement("a");
                            a.href = url; a.download = d.arquivo!.nome;
                            document.body.appendChild(a); a.click(); a.remove();
                            URL.revokeObjectURL(url);
                          } catch (e) { alert(`Falha: ${(e as Error).message}`); }
                        }}><Download size={12} /></button>
                      )}
                      {!d.arquivo && <span className="text-[11px] text-muted/60">Sem arquivo</span>}
                      <div className="ml-auto flex gap-0.5">
                        <button className="btn btn-ghost !p-1 !text-xs" onClick={() => setEdit(d)} aria-label="Editar"><Pencil size={12} /></button>
                        {d.validade && new Date(`${d.validade}T23:59:59`) < new Date() && (
                          <button className="btn btn-ghost !p-1 !text-xs" onClick={() => {
                            const nV = prompt("Nova data de validade (DD/MM/AAAA)")?.trim();
                            if (!nV) return;
                            const [dd, mm, aaaa] = nV.split("/");
                            if (!(dd && mm && aaaa && /^\d{4}-\d{2}-\d{2}$/.test(`${aaaa}-${mm}-${dd}`))) { alert("Data inválida."); return; }
                            db.update("documentos", d.id, { validade: `${aaaa}-${mm}-${dd}` });
                          }} title="Renovar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-3-6.7M21 3v6h-6"/></svg></button>
                        )}
                        <button className="btn btn-ghost !p-1 !text-xs text-danger" onClick={() => { if (confirm("Excluir documento?")) { if (d.arquivo) void removerPdf(d.arquivo.path); db.remove("documentos", d.id); } }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {(edit || edit === "new") && <DocForm doc={edit === "new" ? null : edit} pastaInicial={filtroPasta !== "todas" && filtroPasta !== "sem" ? filtroPasta : null} onClose={() => setEdit(null)} onVer={(d) => setVendo(d)} />}
      {vendo && <VisualizarPdf arquivo={vendo.arquivo!} titulo={vendo.arquivo?.nome ?? vendo.descricao} onClose={() => setVendo(null)} />}
    </div>
  );
}

function salvarNoCrm(a: AnaliseEdital) {
  if (!a.pncpId) return false;
  if (db.get("crm_cards").some((c) => c.opportunity_id === a.pncpId)) return false;
  const m = a.pncpId.match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
  db.upsert("crm_cards", {
    id: newId(), titulo: a.titulo, orgao: a.resultado.dados_gerais.orgao, valor: null, status: "Docs", prazo: null,
    opportunity_id: a.pncpId, link: m ? `https://pncp.gov.br/app/editais/${m[1]}/${m[3]}/${Number(m[2])}` : null,
    notas: `Analise de IA: ${a.resultado.resumo}`, created_at: nowIso(), updated_at: nowIso(),
  });
  return true;
}

function AnalisarEdital({ onPronta, pncpInicial }: { onPronta: (a: AnaliseEdital) => void; pncpInicial: string }) {
  const [pncp, setPncp] = useState(pncpInicial);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { empresa } = useEmpresa();
  const ia = iaDaEmpresa(empresa);
  useEffect(() => setPncp(pncpInicial), [pncpInicial]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivos.length && !pncp.trim() && !texto.trim()) { setError("Envie o PDF do edital, o link do PNCP ou cole o texto."); return; }
    setLoading(true);
    setError("");
    const fd = new FormData();
    arquivos.forEach((f) => fd.append("arquivos", f));
    if (pncp.trim()) fd.append("pncp", pncp.trim());
    if (texto.trim()) fd.append("texto", texto);
    const ctrl = new AbortController();
    const limite = setTimeout(() => ctrl.abort(), 320000);
    try {
      const r = await fetch("/api/edital/analisar", { method: "POST", body: fd, headers: cabecalhosIA(empresa), signal: ctrl.signal });
      const d = await r.json().catch(() => ({
        error: r.status === 504 || r.status === 502
          ? "A analise passou do tempo limite. Tente de novo; se repetir, envie so o PDF do edital (sem anexos) ou troque o modelo da IA."
          : `O servidor respondeu com erro (${r.status}). Tente de novo.`,
      }));
      if (d.error) { setError(d.error); return; }
      const a: AnaliseEdital = { id: newId(), titulo: d.titulo, fonte: d.fonte, pncpId: d.pncpId, resultado: d.resultado, created_at: nowIso() };
      db.upsert("analises", a);
      onPronta(a);
      setArquivos([]); setTexto(""); setPncp("");
    } catch (err) {
      setError((err as Error).name === "AbortError"
        ? "A analise passou do tempo limite. Tente de novo; se repetir, envie so o PDF do edital (sem anexos) ou troque o modelo da IA."
        : "Falha de conexao durante a analise. Confira a internet e tente de novo.");
    } finally {
      clearTimeout(limite);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={enviar} className="card space-y-4 p-5">
      <div>
        <div className="font-bold text-brand flex items-center gap-2">
          <Sparkles size={16} /> Analise de edital com IA
          <span className="badge bg-bg text-muted !font-medium">{ia.provedor === "gemini" ? `Google Gemini · ${ia.gemini_modelo}` : "Claude"}</span>
          <Link href="/configuracoes#ia" className="ml-auto text-xs font-semibold text-accent">Trocar IA</Link>
        </div>
        <p className="mt-1 text-sm text-muted">A IA le o edital e devolve: resumo para decisao, dados gerais, itens, exigencias de habilitacao, declaracoes, prazos, riscos, pontos de impugnacao e um checklist.</p>
      </div>
      <label className="block text-xs font-semibold text-muted">Link da licitacao no PNCP (o sistema baixa o edital e o termo de referencia)
        <input className="input mt-1" placeholder="https://pncp.gov.br/app/editais/00000000000000/2026/123" value={pncp} onChange={(e) => setPncp(e.target.value)} />
      </label>
      <div className="text-center text-xs font-semibold text-muted">— ou —</div>
      <div>
        <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} />
        <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-border px-4 py-6 text-center hover:border-black/40">
          <FileUp className="mx-auto mb-1" size={20} />
          <div className="text-sm font-semibold">{arquivos.length ? arquivos.map((f) => f.name).join(", ") : "Clique para enviar o PDF do edital (e anexos)"}</div>
          <div className="text-xs text-muted">Ate 25 MB no total</div>
        </button>
      </div>
      <div className="text-center text-xs font-semibold text-muted">— ou —</div>
      <textarea className="input min-h-28" placeholder="Cole aqui o texto do edital" value={texto} onChange={(e) => setTexto(e.target.value)} />
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{error}</div>}
      {loading ? (
        <IALendo origem={pncp.trim() ? "pncp" : arquivos.length ? "arquivo" : "texto"}
          provedor={ia.provedor === "gemini" ? `Google Gemini · ${ia.gemini_modelo}` : "Claude"} />
      ) : (
        <button className="btn btn-primary w-full justify-center">
          <Sparkles size={14} /> Analisar com IA
        </button>
      )}
    </form>
  );
}

function Analises({ aberta, setAberta }: { aberta: string | null; setAberta: (id: string | null) => void }) {
  const { items } = useCollection("analises");
  const { items: cards } = useCollection("crm_cards");
  const atual = items.find((a) => a.id === aberta) ?? null;

  if (atual) {
    const noCrm = !!atual.pncpId && cards.some((c) => c.opportunity_id === atual.pncpId);
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost" onClick={() => setAberta(null)}>← Voltar</button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{atual.titulo}</div>
            <div className="text-xs text-muted">{atual.fonte} · {dataBR(atual.created_at, true)}</div>
          </div>
          {atual.pncpId && <button className="btn btn-ghost" disabled={noCrm} onClick={() => salvarNoCrm(atual)}><KanbanSquare size={14} /> {noCrm ? "No CRM" : "Adicionar ao CRM"}</button>}
          <Link className="btn btn-primary" href={`/propostas?analise=${encodeURIComponent(atual.id)}`}><FilePlus2 size={14} /> Criar proposta</Link>
          <button className="btn btn-ghost" onClick={() => imprimirRelatorio(nomeDoRelatorio(atual.resultado, atual.titulo))}>Imprimir / PDF</button>
        </div>
        <AnaliseView r={atual.resultado} escolhidos={atual.lotes_escolhidos ?? []}
          onEscolher={(lotes) => db.update("analises", atual.id, { lotes_escolhidos: lotes })} />
        <RelatorioEdital r={atual.resultado} titulo={atual.titulo} fonte={atual.fonte} data={dataBR(atual.created_at, true)} escolhidos={atual.lotes_escolhidos ?? []} />
      </>
    );
  }
  if (!items.length) return <Empty title="Nenhuma analise ainda" text="As analises de edital ficam salvas aqui para consultar depois." />;
  return (
    <AnalisesSalvas items={items} onAbrir={setAberta}
      onExcluir={(a) => { if (confirm("Excluir esta analise?")) db.remove("analises", a.id); }} />
  );
}

function DocumentosInner() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"certidoes" | "ia" | "analises">(sp.get("tab") === "ia" || sp.get("pncp") ? "ia" : "certidoes");
  const [aberta, setAberta] = useState<string | null>(null);
  const tabs = [["certidoes", "Certidoes e documentos"], ["ia", "Analisar edital com IA"], ["analises", "Analises salvas"]] as const;
  return (
    <>
      <PageHeader title="Documentos" subtitle="Certidoes da empresa e analise de editais com IA" />
      <div className="card mb-5 flex flex-wrap gap-1 overflow-x-auto p-1.5">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${tab === k ? "bg-black text-white" : "text-muted hover:bg-bg hover:text-black"}`}>{l}</button>
        ))}
      </div>
      {tab === "certidoes" && <Certidoes />}
      {tab === "ia" && <div className="max-w-3xl"><AnalisarEdital pncpInicial={sp.get("pncp") ?? ""} onPronta={(a) => { setAberta(a.id); setTab("analises"); }} /></div>}
      {tab === "analises" && <Analises aberta={aberta} setAberta={setAberta} />}
    </>
  );
}

export default function Documentos() {
  return <Suspense><DocumentosInner /></Suspense>;
}
