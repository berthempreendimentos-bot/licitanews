"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form className="card w-full max-w-lg space-y-3 p-5" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-brand">{doc ? "Editar documento" : "Novo documento"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <label className="block text-xs font-semibold text-muted">Pasta
          <select className="input mt-1" value={f.pasta_id ?? ""} onChange={(e) => set("pasta_id", e.target.value || null)}>
            <option value="">Sem pasta</option>
            {[...pastas].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
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
        <input className="input" placeholder="Link do arquivo (Google Drive, OneDrive…) — opcional" value={f.link} onChange={(e) => set("link", e.target.value)} />
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
            {salvando ? <><Loader2 size={14} className="animate-spin" /> {novoPdf ? "Enviando PDF…" : "Salvando…"}</> : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Filtro da lista: todas, sem pasta ou o id de uma pasta. */
type FiltroPasta = "todas" | "sem" | string;

function BarraPastas({ pastas, docs, filtro, setFiltro }: {
  pastas: PastaDocumentos[]; docs: DocumentoEmpresa[]; filtro: FiltroPasta; setFiltro: (f: FiltroPasta) => void;
}) {
  const ids = new Set(pastas.map((p) => p.id));
  // Documento de pasta excluída conta como "sem pasta".
  const semPasta = docs.filter((d) => !d.pasta_id || !ids.has(d.pasta_id)).length;
  const chip = (k: FiltroPasta, label: string, n: number) => (
    <button key={k} onClick={() => setFiltro(k)}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${filtro === k ? "bg-black text-white" : "border border-border text-muted hover:text-black"}`}>
      {k !== "todas" && k !== "sem" && <Folder size={14} />}{label}
      <span className={`text-[11px] ${filtro === k ? "text-white/70" : "text-muted"}`}>{n}</span>
    </button>
  );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chip("todas", "Todas", docs.length)}
      {[...pastas].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => chip(p.id, p.nome, docs.filter((d) => d.pasta_id === p.id).length))}
      {semPasta > 0 && pastas.length > 0 && chip("sem", "Sem pasta", semPasta)}
      <button className="btn btn-ghost !py-1.5" onClick={() => {
        const nome = prompt("Nome da nova pasta (ex.: Habilitação 2026, Pregão 12/2026)")?.trim();
        if (!nome) return;
        const p: PastaDocumentos = { id: newId(), nome, created_at: nowIso() };
        db.upsert("pastas", p);
        setFiltro(p.id);
      }}><FolderPlus size={14} /> Nova pasta</button>
    </div>
  );
}

function Certidoes() {
  const { items: todos } = useCollection("documentos");
  const { items: pastas } = useCollection("pastas");
  const [filtro, setFiltro] = useState<FiltroPasta>("todas");
  const [edit, setEdit] = useState<DocumentoEmpresa | null | "new">(null);
  const [vendo, setVendo] = useState<DocumentoEmpresa | null>(null);
  const [baixando, setBaixando] = useState("");
  const pasta = pastas.find((p) => p.id === filtro) ?? null;
  const ids = new Set(pastas.map((p) => p.id));
  const items = filtro === "todas" ? todos
    : filtro === "sem" ? todos.filter((d) => !d.pasta_id || !ids.has(d.pasta_id))
      : todos.filter((d) => d.pasta_id === filtro);
  const ordenados = [...items].sort((a, b) => (a.validade ?? "9999").localeCompare(b.validade ?? "9999"));
  const vencidos = items.filter((d) => (statusDoc(d).dias ?? 1) < 0).length;
  const vencendo = items.filter((d) => { const x = statusDoc(d).dias; return x != null && x >= 0 && x <= 30; }).length;

  async function baixar() {
    const nome = pasta?.nome ?? (filtro === "sem" ? "Documentos sem pasta" : "Todos os documentos");
    if (!ordenados.some((d) => d.arquivo) && !confirm("Nenhum documento aqui tem PDF no PEPPACORP. Baixar só o índice?")) return;
    try {
      const r = await baixarPastaZip(nome, ordenados, (feitos, total) => setBaixando(total ? `${feitos}/${total}` : "…"));
      if (r.falhas.length) alert(`Não foi possível baixar ${r.falhas.length} PDF(s): ${r.falhas.join(", ")}. Eles estão listados no indice.txt.`);
    } catch (e) {
      alert(`Falha ao montar o .zip: ${(e as Error).message}`);
    } finally {
      setBaixando("");
    }
  }

  function renomear() {
    if (!pasta) return;
    const nome = prompt("Novo nome da pasta", pasta.nome)?.trim();
    if (nome && nome !== pasta.nome) db.update("pastas", pasta.id, { nome });
  }

  function excluirPasta() {
    if (!pasta) return;
    const n = items.length;
    if (!confirm(n ? `Excluir a pasta "${pasta.nome}"? Os ${n} documento(s) dela não são apagados: ficam em "Sem pasta".` : `Excluir a pasta "${pasta.nome}"?`)) return;
    items.forEach((d) => db.update("documentos", d.id, { pasta_id: null }));
    db.remove("pastas", pasta.id);
    setFiltro("todas");
  }

  const cadastrar = <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus size={14} /> Cadastrar documento</button>;
  return (
    <>
      <BarraPastas pastas={pastas} docs={todos} filtro={pasta || filtro === "sem" ? filtro : "todas"} setFiltro={setFiltro} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="grid grid-cols-3 gap-3 flex-1 max-w-2xl">
          <StatCard label={pasta ? `Em ${pasta.nome}` : "Documentos"} value={items.length} />
          <StatCard label="Vencendo em 30 dias" value={vencendo} accent={vencendo > 0} />
          <StatCard label="Vencidos" value={vencidos} accent={vencidos > 0} />
        </div>
        <div className="flex flex-wrap gap-2">
          {pasta && <>
            <button className="btn btn-ghost" onClick={renomear}><Pencil size={14} /> Renomear</button>
            <button className="btn btn-ghost" onClick={excluirPasta}><Trash2 size={14} /> Excluir pasta</button>
          </>}
          {items.length > 0 && (
            <button className="btn btn-ghost" disabled={!!baixando} onClick={() => void baixar()}>
              {baixando ? <><Loader2 size={14} className="animate-spin" /> Baixando {baixando}</> : <><Download size={14} /> {pasta ? "Baixar pasta (.zip)" : "Baixar tudo (.zip)"}</>}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus size={14} /> Novo documento</button>
        </div>
      </div>
      {items.length === 0 ? (
        pasta
          ? <Empty title={`Pasta "${pasta.nome}" vazia`} text="Cadastre um documento nesta pasta ou mova um existente para cá: abra o documento e escolha a pasta." action={cadastrar} />
          : <Empty title="Cofre de certidões" text="Cadastre certidões e documentos de habilitação com a validade. Você recebe alerta 15 dias antes de vencer e os vencimentos aparecem na Agenda." action={cadastrar} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-2">Documento</th><th className="px-4 py-2">Número</th><th className="px-4 py-2">Emissão</th><th className="px-4 py-2">Validade</th><th className="px-4 py-2">Situação</th><th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {ordenados.map((d) => {
                  const st = statusDoc(d);
                  return (
                    <tr key={d.id} onClick={() => setEdit(d)} className="cursor-pointer border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-4 py-2.5"><div className="font-medium">{d.tipo}</div>{d.descricao && <div className="text-[11px] text-muted">{d.descricao}</div>}
                        {!pasta && d.pasta_id && ids.has(d.pasta_id) && <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted"><Folder size={11} /> {pastas.find((p) => p.id === d.pasta_id)?.nome}</div>}</td>
                      <td className="px-4 py-2.5 text-muted">{d.numero || "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{dataBR(d.emissao ? `${d.emissao}T12:00:00` : null)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{dataBR(d.validade ? `${d.validade}T12:00:00` : null)}</td>
                      <td className="px-4 py-2.5"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {d.arquivo && <button onClick={(e) => { e.stopPropagation(); setVendo(d); }} aria-label="Visualizar PDF" title="Visualizar PDF" className="text-muted hover:text-black"><Eye size={15} /></button>}
                          {d.link && <a href={d.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Abrir link" title="Abrir link" className="text-muted hover:text-black"><ExternalLink size={14} /></a>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {edit && <DocForm doc={edit === "new" ? null : edit} pastaInicial={pasta?.id ?? null} onClose={() => setEdit(null)} onVer={setVendo} />}
      {vendo?.arquivo && <VisualizarPdf arquivo={vendo.arquivo} titulo={vendo.descricao || vendo.tipo} onClose={() => setVendo(null)} />}
    </>
  );
}

// ------------------------------------------------------------ Análise de edital
function salvarNoCrm(a: AnaliseEdital) {
  if (!a.pncpId) return false;
  if (db.get("crm_cards").some((c) => c.opportunity_id === a.pncpId)) return false;
  const m = a.pncpId.match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
  db.upsert("crm_cards", {
    id: newId(), titulo: a.titulo, orgao: a.resultado.dados_gerais.orgao, valor: null, status: "Docs", prazo: null,
    opportunity_id: a.pncpId, link: m ? `https://pncp.gov.br/app/editais/${m[1]}/${m[3]}/${Number(m[2])}` : null,
    notas: `Análise de IA: ${a.resultado.resumo}`, created_at: nowIso(), updated_at: nowIso(),
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
    // O servidor desiste em 5 min; aqui espera um pouco mais para receber a mensagem de erro dele.
    const ctrl = new AbortController();
    const limite = setTimeout(() => ctrl.abort(), 320000);
    try {
      const r = await fetch("/api/edital/analisar", { method: "POST", body: fd, headers: cabecalhosIA(empresa), signal: ctrl.signal });
      // Resposta sem JSON: o servidor caiu no meio (ex.: tempo esgotado na hospedagem).
      const d = await r.json().catch(() => ({
        error: r.status === 504 || r.status === 502
          ? "A análise passou do tempo limite. Tente de novo; se repetir, envie só o PDF do edital (sem anexos) ou troque o modelo da IA."
          : `O servidor respondeu com erro (${r.status}). Tente de novo.`,
      }));
      if (d.error) { setError(d.error); return; }
      const a: AnaliseEdital = { id: newId(), titulo: d.titulo, fonte: d.fonte, pncpId: d.pncpId, resultado: d.resultado, created_at: nowIso() };
      db.upsert("analises", a);
      onPronta(a);
      setArquivos([]); setTexto(""); setPncp("");
    } catch (err) {
      setError((err as Error).name === "AbortError"
        ? "A análise passou do tempo limite. Tente de novo; se repetir, envie só o PDF do edital (sem anexos) ou troque o modelo da IA."
        : "Falha de conexão durante a análise. Confira a internet e tente de novo.");
    } finally {
      clearTimeout(limite);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={enviar} className="card space-y-4 p-5">
      <div>
        <div className="font-bold text-brand flex items-center gap-2">
          <Sparkles size={16} /> Análise de edital com IA
          <span className="badge bg-bg text-muted !font-medium">{ia.provedor === "gemini" ? `Google Gemini · ${ia.gemini_modelo}` : "Claude"}</span>
          <Link href="/configuracoes#ia" className="ml-auto text-xs font-semibold text-accent">Trocar IA</Link>
        </div>
        <p className="mt-1 text-sm text-muted">A IA lê o edital e devolve: resumo para decisão, dados gerais, itens, exigências de habilitação, declarações, prazos, riscos, pontos de impugnação e um checklist.</p>
      </div>
      <label className="block text-xs font-semibold text-muted">Link da licitação no PNCP (o sistema baixa o edital e o termo de referência)
        <input className="input mt-1" placeholder="https://pncp.gov.br/app/editais/00000000000000/2026/123" value={pncp} onChange={(e) => setPncp(e.target.value)} />
      </label>
      <div className="text-center text-xs font-semibold text-muted">— ou —</div>
      <div>
        <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} />
        <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-border px-4 py-6 text-center hover:border-black/40">
          <FileUp className="mx-auto mb-1" size={20} />
          <div className="text-sm font-semibold">{arquivos.length ? arquivos.map((f) => f.name).join(", ") : "Clique para enviar o PDF do edital (e anexos)"}</div>
          <div className="text-xs text-muted">Até 25 MB no total</div>
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
  if (!items.length) return <Empty title="Nenhuma análise ainda" text="As análises de edital ficam salvas aqui para consultar depois." />;
  return (
    <AnalisesSalvas items={items} onAbrir={setAberta}
      onExcluir={(a) => { if (confirm("Excluir esta análise?")) db.remove("analises", a.id); }} />
  );
}

function DocumentosInner() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"certidoes" | "ia" | "analises">(sp.get("tab") === "ia" || sp.get("pncp") ? "ia" : "certidoes");
  const [aberta, setAberta] = useState<string | null>(null);
  const tabs = [["certidoes", "Certidões e documentos"], ["ia", "Analisar edital com IA"], ["analises", "Análises salvas"]] as const;
  return (
    <>
      <PageHeader title="Documentos" subtitle="Certidões da empresa e análise de editais com IA" />
      <div className="card mb-5 flex flex-wrap gap-1 p-1.5">
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
