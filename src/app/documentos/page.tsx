"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ExternalLink, FilePlus2, FileUp, KanbanSquare, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Empty, PageHeader, StatCard } from "@/components/ui";
import { AnaliseView } from "@/components/AnaliseView";
import { db, newId, useCollection, useEmpresa } from "@/lib/store";
import { cabecalhosIA, iaDaEmpresa } from "@/lib/ia";
import { dataBR, diasAte, nowIso } from "@/lib/format";
import { TIPOS_DOCUMENTO, type AnaliseEdital, type DocumentoEmpresa } from "@/lib/types";

// ------------------------------------------------------------------- Certidões
function statusDoc(d: DocumentoEmpresa) {
  const dias = diasAte(d.validade ? `${d.validade}T23:59:59` : null);
  if (dias == null) return { label: "Sem validade", cls: "bg-neutral-100 text-neutral-500", dias };
  if (dias < 0) return { label: "Vencido", cls: "bg-black text-white", dias };
  if (dias <= 15) return { label: `Vence em ${dias}d`, cls: "bg-black text-white", dias };
  if (dias <= 30) return { label: `Vence em ${dias}d`, cls: "bg-neutral-600 text-white", dias };
  return { label: "Válido", cls: "bg-neutral-200 text-black", dias };
}

function DocForm({ doc, onClose }: { doc: DocumentoEmpresa | null; onClose: () => void }) {
  const [f, setF] = useState<DocumentoEmpresa>(doc ?? {
    id: newId(), tipo: TIPOS_DOCUMENTO[0], descricao: "", numero: "", emissao: null, validade: null, link: "", observacao: "", created_at: nowIso(),
  });
  const set = <K extends keyof DocumentoEmpresa>(k: K, v: DocumentoEmpresa[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form className="card w-full max-w-lg space-y-3 p-5" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); db.upsert("documentos", f); onClose(); }}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-brand">{doc ? "Editar documento" : "Novo documento"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
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
        <input className="input" placeholder="Link do arquivo (Google Drive, OneDrive…)" value={f.link} onChange={(e) => set("link", e.target.value)} />
        <textarea className="input min-h-16" placeholder="Observações" value={f.observacao} onChange={(e) => set("observacao", e.target.value)} />
        <div className="flex justify-between">
          {doc ? <button type="button" className="btn btn-ghost" onClick={() => { if (confirm("Excluir este documento?")) { db.remove("documentos", doc.id); onClose(); } }}><Trash2 size={14} /> Excluir</button> : <span />}
          <button className="btn btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  );
}

function Certidoes() {
  const { items } = useCollection("documentos");
  const [edit, setEdit] = useState<DocumentoEmpresa | null | "new">(null);
  const ordenados = [...items].sort((a, b) => (a.validade ?? "9999").localeCompare(b.validade ?? "9999"));
  const vencidos = items.filter((d) => (statusDoc(d).dias ?? 1) < 0).length;
  const vencendo = items.filter((d) => { const x = statusDoc(d).dias; return x != null && x >= 0 && x <= 30; }).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="grid grid-cols-3 gap-3 flex-1 max-w-2xl">
          <StatCard label="Documentos" value={items.length} />
          <StatCard label="Vencendo em 30 dias" value={vencendo} accent={vencendo > 0} />
          <StatCard label="Vencidos" value={vencidos} accent={vencidos > 0} />
        </div>
        <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus size={14} /> Novo documento</button>
      </div>
      {items.length === 0 ? (
        <Empty title="Cofre de certidões" text="Cadastre certidões e documentos de habilitação com a validade. Você recebe alerta 15 dias antes de vencer e os vencimentos aparecem na Agenda."
          action={<button className="btn btn-primary" onClick={() => setEdit("new")}><Plus size={14} /> Cadastrar documento</button>} />
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
                      <td className="px-4 py-2.5"><div className="font-medium">{d.tipo}</div>{d.descricao && <div className="text-[11px] text-muted">{d.descricao}</div>}</td>
                      <td className="px-4 py-2.5 text-muted">{d.numero || "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{dataBR(d.emissao ? `${d.emissao}T12:00:00` : null)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{dataBR(d.validade ? `${d.validade}T12:00:00` : null)}</td>
                      <td className="px-4 py-2.5"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td className="px-2 py-2.5">{d.link && <a href={d.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Abrir arquivo" className="text-muted hover:text-black"><ExternalLink size={14} /></a>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {edit && <DocForm doc={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
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
    try {
      const r = await fetch("/api/edital/analisar", { method: "POST", body: fd, headers: cabecalhosIA(empresa) });
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      const a: AnaliseEdital = { id: newId(), titulo: d.titulo, fonte: d.fonte, pncpId: d.pncpId, resultado: d.resultado, created_at: nowIso() };
      db.upsert("analises", a);
      onPronta(a);
      setArquivos([]); setTexto(""); setPncp("");
    } catch {
      setError("Falha de conexão durante a análise. Tente de novo.");
    } finally {
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
      {error && <div className="text-sm font-semibold">{error}</div>}
      <button className="btn btn-primary w-full justify-center" disabled={loading}>
        <Sparkles size={14} /> {loading ? "Analisando… (editais longos levam 1 a 3 minutos)" : "Analisar com IA"}
      </button>
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
          {atual.pncpId && <Link className="btn btn-primary" href={`/propostas?pncp=${encodeURIComponent(atual.pncpId)}`}><FilePlus2 size={14} /> Criar proposta</Link>}
          <button className="btn btn-ghost" onClick={() => window.print()}>Imprimir / PDF</button>
        </div>
        <AnaliseView r={atual.resultado} />
      </>
    );
  }
  if (!items.length) return <Empty title="Nenhuma análise ainda" text="As análises de edital ficam salvas aqui para consultar depois." />;
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div key={a.id} onClick={() => setAberta(a.id)} className="card flex cursor-pointer items-center gap-3 p-4 hover:border-black/40">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{a.titulo}</div>
            <div className="text-xs text-muted">{a.resultado.dados_gerais.orgao} · {dataBR(a.created_at, true)} · {a.resultado.riscos.filter((r) => r.gravidade === "alta").length} riscos altos</div>
          </div>
          <button aria-label="Excluir" className="text-muted hover:text-black" onClick={(e) => { e.stopPropagation(); if (confirm("Excluir esta análise?")) db.remove("analises", a.id); }}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
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
