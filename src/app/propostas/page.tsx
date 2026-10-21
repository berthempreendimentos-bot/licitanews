"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, FilePlus2, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Empty, PageHeader, StatCard } from "@/components/ui";
import { db, newId, useCollection } from "@/lib/store";
import { brl, dataBR, diasAte, nowIso } from "@/lib/format";
import { analiseTemMaisItens, COR_STATUS, condicoesDaAnalise, itensDaAnalise, itensIntocados, novaProposta, propostaDaAnalise, propostaDaCompra, totais, type CompraPncp } from "@/lib/proposta";
import { STATUS_PROPOSTA, type AnaliseEdital, type Proposta, type StatusProposta } from "@/lib/types";


const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Cria a proposta a partir do link do PNCP (itens importados) e aproveita a análise do edital, se houver.
 * PNCP com um item só e edital analisado com mais itens (lotes): valem os itens do edital — inclusive
 * numa proposta já criada antes da análise, se nada foi digitado nos itens dela.
 */
async function criarDoPncp(link: string, analise?: AnaliseEdital): Promise<{ id?: string; erro?: string }> {
  const r = await fetch(`/api/compra?id=${encodeURIComponent(link.trim())}`).then((x) => x.json()).catch(() => null);
  if (!r || r.error) return { erro: r?.error || "Não consegui consultar o PNCP. Tente de novo." };
  const c = r as CompraPncp;
  analise ??= db.get("analises").find((a) => a.pncpId === c.pncpId);
  const existente = db.get("propostas").find((p) => p.pncpId === c.pncpId);
  if (existente) {
    if (analise && analiseTemMaisItens(analise, existente.itens.length) && itensIntocados(existente)) {
      db.upsert("propostas", { ...existente, analiseId: analise.id, itens: itensDaAnalise(analise), updated_at: nowIso() });
    }
    return { id: existente.id };
  }
  const p = propostaDaCompra(newId(), nowIso(), c);
  const itens = analiseTemMaisItens(analise, p.itens.length) ? { itens: itensDaAnalise(analise!) } : {};
  db.upsert("propostas", analise ? { ...p, analiseId: analise.id, ...condicoesDaAnalise(analise), ...itens } : p);
  return { id: p.id };
}

/** "Criar proposta" na análise do edital: pelo PNCP quando a análise tem o link; senão, só com a análise. */
async function criarDaAnalise(a: AnaliseEdital): Promise<{ id?: string; erro?: string }> {
  if (a.pncpId) {
    const r = await criarDoPncp(a.pncpId, a);
    if (!r.erro) return r; // PNCP fora do ar: segue só com a análise
  }
  const existente = db.get("propostas").find((p) => p.analiseId === a.id);
  if (existente) return { id: existente.id };
  const p = propostaDaAnalise(newId(), nowIso(), a);
  db.upsert("propostas", p);
  return { id: p.id };
}

function NovaProposta() {
  const router = useRouter();
  const sp = useSearchParams();
  const [link, setLink] = useState(sp.get("pncp") ?? "");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const auto = useRef(false);

  async function criar(valor = link) {
    if (!valor.trim()) return setErro("Cole o link da licitação no PNCP (ou o nº de controle).");
    setErro("");
    setBusy(true);
    const r = await criarDoPncp(valor);
    setBusy(false);
    if (r.erro) return setErro(r.erro);
    router.push(`/propostas/${r.id}`);
  }

  // As análises precisam estar carregadas para a proposta aproveitar os itens e lotes do edital.
  const analises = useCollection("analises");
  const propostas = useCollection("propostas");

  // Vindo de Oportunidades/Documentos com ?pncp=… ou ?analise=…: cria e abre direto.
  useEffect(() => {
    if (auto.current || !analises.ready || !propostas.ready) return;
    const idAnalise = sp.get("analise");
    const v = sp.get("pncp");
    if (idAnalise) {
      auto.current = true;
      const a = analises.items.find((x) => x.id === idAnalise);
      if (!a) { setErro("Análise do edital não encontrada."); return; }
      setBusy(true);
      void criarDaAnalise(a).then((r) => {
        setBusy(false);
        if (r.erro) setErro(r.erro);
        else router.push(`/propostas/${r.id}`);
      });
    } else if (v) { auto.current = true; void criar(v); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, analises.ready, propostas.ready]);

  function emBranco() {
    const p = novaProposta(newId(), nowIso());
    db.upsert("propostas", p);
    router.push(`/propostas/${p.id}`);
  }

  return (
    <div className="card p-4 mb-4">
      <form onSubmit={(e) => { e.preventDefault(); void criar(); }} className="flex flex-col gap-2 sm:flex-row">
        <input className="input" value={link} onChange={(e) => setLink(e.target.value)}
          placeholder="Link da licitação no PNCP (pncp.gov.br/app/editais/…) ou nº de controle" />
        <button className="btn btn-primary shrink-0 justify-center" disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />} {busy ? "Importando itens…" : "Criar proposta"}
        </button>
        <button type="button" className="btn btn-ghost shrink-0 justify-center" onClick={emBranco}><Plus size={14} /> Em branco</button>
      </form>
      <p className="mt-2 text-xs text-muted">
        Os itens e valores estimados vêm do PNCP. Se o edital já foi analisado em Documentos, validade, prazo, pagamento e exigências entram sozinhos.
      </p>
      {erro && <div className="mt-2 text-xs text-danger">{erro}</div>}
    </div>
  );
}

function duplicar(p: Proposta) {
  const agora = nowIso();
  db.upsert("propostas", { ...p, id: newId(), titulo: `${p.titulo} (cópia)`, status: "Rascunho", revisao: undefined, created_at: agora, updated_at: agora });
}

function PropostasInner() {
  const { items } = useCollection("propostas");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusProposta | "Todas">("Todas");

  const termos = semAcento(busca).split(/\s+/).filter(Boolean);
  const lista = [...items]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .filter((p) => status === "Todas" || p.status === status)
    .filter((p) => {
      const alvo = semAcento([p.titulo, p.orgao, p.numeroLicitacao, p.processo, p.pncpId].join(" "));
      return termos.every((t) => alvo.includes(t));
    });
  const abertas = items.filter((p) => !["Homologada", "Recusada"].includes(p.status));

  return (
    <>
      <PageHeader title="Propostas" subtitle="Monte, confira com IA e imprima propostas comerciais a partir das licitações do PNCP" />
      <NovaProposta />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Propostas" value={items.length} />
        <StatCard label="Em preparação" value={items.filter((p) => p.status === "Rascunho" || p.status === "Em análise").length} />
        <StatCard label="Prontas ou enviadas" value={items.filter((p) => p.status === "Pronta para envio" || p.status === "Enviada").length} />
        <StatCard label="Valor em aberto" value={brl(abertas.reduce((s, p) => s + totais(p).total, 0), true)} accent />
      </div>

      {items.length > 0 && (
        <div className="card mb-4 p-3 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !pl-9 !pr-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar por objeto, órgão ou número" aria-label="Pesquisar propostas" />
            {busca && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-label="Limpar pesquisa" onClick={() => setBusca("")}><X size={15} /></button>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["Todas", ...STATUS_PROPOSTA] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${status === s ? "border-brand bg-brand text-white" : "border-border bg-surface text-muted hover:text-brand"}`}>
                {s} ({s === "Todas" ? items.length : items.filter((p) => p.status === s).length})
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 && <Empty title="Nenhuma proposta ainda" text="Cole acima o link de uma licitação do PNCP para importar os itens." />}
      {items.length > 0 && lista.length === 0 && <Empty title="Nenhuma proposta encontrada" text="Mude a pesquisa ou o filtro." />}

      <div className="space-y-2">
        {lista.map((p) => {
          const t = totais(p);
          const dias = diasAte(p.encerramento);
          return (
            <Link key={p.id} href={`/propostas/${p.id}`} className="card flex flex-col gap-3 p-4 transition hover:border-brand/40 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${COR_STATUS[p.status]}`}>{p.status}</span>
                  {dias != null && dias >= 0 && <span className={`badge ${dias <= 2 ? "bg-red-600 text-white" : "bg-neutral-200 text-neutral-700"}`}>{dias === 0 ? "Encerra hoje" : `Encerra em ${dias}d`}</span>}
                  {p.numeroLicitacao && <span className="text-xs text-muted">{p.modalidade} {p.numeroLicitacao}</span>}
                </div>
                <div className="mt-1 font-semibold text-sm leading-snug line-clamp-2">{p.titulo}</div>
                <div className="mt-0.5 text-xs text-muted truncate">{p.orgao || "Órgão não informado"} · atualizada {dataBR(p.updated_at, true)}</div>
              </div>
              <div className="flex items-center gap-4 sm:text-right">
                <div>
                  <div className="font-bold text-brand tabular-nums">{brl(t.total)}</div>
                  <div className="text-[11px] text-muted">{t.comPreco}/{t.participando} itens com preço{t.desconto != null ? ` · ${t.desconto.toFixed(1)}% abaixo` : ""}</div>
                </div>
                <button className="text-muted hover:text-brand" aria-label="Duplicar" title="Duplicar" onClick={(e) => { e.preventDefault(); duplicar(p); }}><Copy size={15} /></button>
                <button className="text-muted hover:text-danger" aria-label="Excluir" title="Excluir" onClick={(e) => { e.preventDefault(); if (confirm("Excluir esta proposta?")) db.remove("propostas", p.id); }}><Trash2 size={15} /></button>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export default function Propostas() {
  return <Suspense><PropostasInner /></Suspense>;
}
