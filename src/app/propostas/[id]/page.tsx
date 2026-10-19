"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Search, Square, Tags, ExternalLink, FileSpreadsheet, FileText, Loader2, Printer, ShieldCheck, Sparkles, Trash2, Wand2,
} from "lucide-react";
import { Empty } from "@/components/ui";
import { db, newId, useCollection, useEmpresa } from "@/lib/store";
import { dataBR, diasAte, nowIso } from "@/lib/format";
import { cabecalhosIA, iaDaEmpresa } from "@/lib/ia";
import { COR_STATUS, condicoesDaAnalise, csvProposta, descontoItem, estimadoItem, moeda, refItem, totais, totalItem } from "@/lib/proposta";
import { STATUS_PROPOSTA, type AnaliseEdital, type ItemProposta, type PesquisaItem, type Proposta, type RevisaoProposta } from "@/lib/types";

/** Link da página do edital no PNCP a partir do nº de controle. */
function linkPncp(id: string) {
  const m = id.match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
  return m ? `https://pncp.gov.br/app/editais/${m[1]}/${m[3]}/${Number(m[2])}` : "https://pncp.gov.br";
}

/** Resultado da pesquisa de um item: referência no PNCP, preço de mercado e marcas (clicáveis). */
function PesquisaDoItem({ pq, aberto, onAbrir, onMarca }: {
  pq: PesquisaItem; aberto: boolean; onAbrir: () => void; onMarca: (marca: string, modelo?: string) => void;
}) {
  const r = pq.pncp;
  return (
    <div className="mt-1.5 space-y-1 rounded-md bg-blue-50/60 px-2 py-1.5 text-[11px]">
      {r && (
        <div>
          <b>PNCP:</b>{" "}
          {r.n ? <>mediana <b>{moeda(r.mediana)}</b> · {r.n} amostra{r.n > 1 ? "s" : ""} ({moeda(r.min)} a {moeda(r.max)})
            {r.nHomologados > 0 && <> · homologado <b>{moeda(r.medianaHomologada)}</b></>}</> : <span className="text-muted">nenhuma licitação parecida encontrada</span>}
        </div>
      )}
      {pq.mercado && (
        <div><b>Mercado (IA):</b> {pq.mercado.preco != null ? <b>{moeda(pq.mercado.preco)}</b> : <span className="text-muted">sem preço encontrado</span>}
          {pq.mercado.observacao && <span className="text-muted"> — {pq.mercado.observacao}</span>}</div>
      )}
      {!!pq.marcas?.length && (
        <div className="flex flex-wrap items-center gap-1">
          <b>Marcas:</b>
          {pq.marcas.map((m, k) => (
            <button key={k} type="button" title={m.observacao || "Usar esta marca"} onClick={() => onMarca(m.marca, m.modelo)}
              className="rounded-full border border-blue-200 bg-white px-2 py-0.5 font-semibold text-blue-800 hover:border-blue-600">
              {m.marca}{m.modelo ? ` · ${m.modelo}` : ""}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="font-semibold text-accent" onClick={onAbrir}>{aberto ? "ocultar fontes" : "ver fontes"}</button>
      {aberto && (
        <div className="space-y-1 pt-1">
          {r?.amostras.map((a, k) => (
            <a key={k} href={linkPncp(a.pncpId)} target="_blank" rel="noreferrer" className="block hover:underline">
              {a.tipo === "homologado" ? "🏆 homologado" : "estimado"} <b>{moeda(a.valor)}</b>/{a.unidade} — {a.descricao.slice(0, 80)} · {a.orgao.slice(0, 40)}/{a.uf}
            </a>
          ))}
          {pq.fontes?.slice(0, 8).map((f, k) => (
            <a key={`w${k}`} href={f.url} target="_blank" rel="noreferrer" className="block truncate text-blue-800 hover:underline">🌐 {f.titulo}</a>
          ))}
        </div>
      )}
    </div>
  );
}

/** "1.234,56" ou "1234.56" → 1234.56 */
function lerValor(t: string): number | null {
  const s = t.trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const fmtValor = (v: number | null) => (v == null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

/** Campo de preço: edita como texto e grava ao sair do campo. */
function PrecoInput({ valor, onChange, aria }: { valor: number | null; onChange: (v: number | null) => void; aria: string }) {
  const [t, setT] = useState(fmtValor(valor));
  useEffect(() => setT(fmtValor(valor)), [valor]);
  return (
    <input className="input !w-36 !py-1.5 !px-2.5 text-right text-sm font-semibold tabular-nums" inputMode="decimal" aria-label={aria} placeholder="0,00" value={t}
      onChange={(e) => setT(e.target.value)} onBlur={() => onChange(lerValor(t))}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

function Campo({ rotulo, children, className = "" }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return <label className={`block text-xs font-semibold text-muted ${className}`}>{rotulo}<div className="mt-1">{children}</div></label>;
}

const COR_GRAVIDADE: Record<RevisaoProposta["gravidade"], string> = {
  alta: "border-l-red-600 bg-red-50", media: "border-l-yellow-400 bg-yellow-50", baixa: "border-l-neutral-300 bg-bg",
};

export default function EditorProposta() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { items, ready } = useCollection("propostas");
  const { items: analises } = useCollection("analises");
  const { empresa } = useEmpresa();
  const salva = items.find((x) => x.id === id) ?? null;

  const [p, setP] = useState<Proposta | null>(null);
  const [filtro, setFiltro] = useState("");
  const [soParticipo, setSoParticipo] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);
  const [desconto, setDesconto] = useState("10");
  const [soSemPreco, setSoSemPreco] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [progresso, setProgresso] = useState("");
  const [verFontes, setVerFontes] = useState<number | null>(null);
  const parar = useRef(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  // Carrega uma vez; depois a tela é a fonte da verdade e grava com atraso curto (autosave).
  useEffect(() => { if (salva && !p) setP(salva); }, [salva, p]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef<Proposta | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (pendente.current) db.upsert("propostas", pendente.current); }, []);

  function muda(patch: Partial<Proposta> | ((cur: Proposta) => Partial<Proposta>)) {
    setP((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch), updated_at: nowIso() };
      pendente.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (pendente.current) db.upsert("propostas", pendente.current); pendente.current = null; }, 600);
      return next;
    });
  }
  const mudaItem = (numero: number, patch: Partial<ItemProposta>) =>
    muda((cur) => ({ itens: cur.itens.map((i) => (i.numero === numero ? { ...i, ...patch } : i)) }));

  if (!ready) return <div className="text-sm text-muted">Carregando…</div>;
  if (!salva && !p) return <Empty title="Proposta não encontrada" text="Ela pode ter sido excluída." action={<Link className="btn btn-ghost" href="/propostas">Voltar às propostas</Link>} />;
  if (!p) return null;

  const t = totais(p);
  const analise: AnaliseEdital | undefined = p.pncpId ? analises.find((a) => a.pncpId === p.pncpId) : undefined;
  const ia = iaDaEmpresa(empresa);
  const dias = diasAte(p.encerramento);
  const termos = filtro.toLowerCase().split(/\s+/).filter(Boolean);
  const visiveis = p.itens.filter((i) => (!soParticipo || i.participar) && termos.every((x) => `${i.numero} ${i.descricao} ${i.marca} ${i.modelo}`.toLowerCase().includes(x)));

  async function chamarIA(acao: "carta" | "descricoes" | "revisar") {
    if (!p) return;
    setMsg(null);
    setOcupado(acao);
    try {
      const r = await fetch("/api/propostas/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cabecalhosIA(empresa) },
        body: JSON.stringify({ acao, proposta: p, empresa: { razao_social: empresa.razao_social, cnpj: empresa.cnpj, dados_proposta: empresa.dados_proposta } }),
      });
      const d = await r.json();
      if (!d.ok) return setMsg({ ok: false, texto: d.error || "A IA não respondeu." });
      if (acao === "carta") { muda({ carta: d.texto }); setMsg({ ok: true, texto: "Carta-proposta gerada. Revise o texto antes de enviar." }); }
      if (acao === "descricoes") {
        const porNumero = new Map<number, string>((d.itens ?? []).map((x: { numero: number; descricao_ofertada: string }) => [Number(x.numero), x.descricao_ofertada]));
        muda((cur) => ({ itens: cur.itens.map((i) => (porNumero.has(i.numero) ? { ...i, descricaoOfertada: porNumero.get(i.numero) } : i)) }));
        setMsg({ ok: true, texto: `Descrição ofertada escrita para ${porNumero.size} itens. Confira os trechos marcados com [confirmar no catálogo].` });
      }
      if (acao === "revisar") {
        const pontos = (d.pontos ?? []) as RevisaoProposta[];
        muda({ revisao: { em: nowIso(), pontos } });
        setMsg({ ok: true, texto: pontos.length ? `Conferência concluída: ${pontos.length} ponto(s) para revisar.` : "Conferência concluída: nenhum problema encontrado." });
      }
    } catch {
      setMsg({ ok: false, texto: "Falha de conexão com o servidor." });
    } finally {
      setOcupado(null);
    }
  }

  async function analisarEdital() {
    if (!p?.link && !p?.pncpId) return;
    setMsg(null);
    setOcupado("edital");
    try {
      const fd = new FormData();
      fd.append("pncp", p.link || p.pncpId!);
      const r = await fetch("/api/edital/analisar", { method: "POST", body: fd, headers: cabecalhosIA(empresa) });
      const d = await r.json();
      if (d.error) return setMsg({ ok: false, texto: d.error });
      const a: AnaliseEdital = { id: newId(), titulo: d.titulo, fonte: d.fonte, pncpId: d.pncpId ?? p.pncpId, resultado: d.resultado, created_at: nowIso() };
      db.upsert("analises", a);
      muda(condicoesDaAnalise(a));
      setMsg({ ok: true, texto: "Edital analisado: condições e exigências preenchidas. A análise completa fica em Documentos." });
    } catch {
      setMsg({ ok: false, texto: "Falha de conexão durante a análise do edital." });
    } finally {
      setOcupado(null);
    }
  }

  /**
   * Pesquisa os itens em que participa (só os filtrados, se houver filtro):
   * - "precos": referência em contratações similares no PNCP (dados públicos, sem IA);
   * - "marcas": marcas e preço de mercado na internet, com IA.
   */
  async function pesquisarItens(tipo: "precos" | "marcas") {
    if (!p) return;
    const marcados = visiveis.filter((i) => i.participar);
    if (!marcados.length) return setMsg({ ok: false, texto: "Nenhum item para pesquisar: marque os itens em que vai participar (ou limpe o filtro)." });
    // Itens já pesquisados neste modo são pulados: rodar de novo continua de onde parou.
    const jaFeito = (i: ItemProposta) => (tipo === "precos" ? !!i.pesquisa?.pncp : i.pesquisa?.marcas !== undefined);
    const alvo = marcados.filter((i) => !jaFeito(i));
    const pulados = marcados.length - alvo.length;
    if (!alvo.length) return setMsg({ ok: true, texto: `Todos os ${marcados.length} itens já foram pesquisados (${tipo === "precos" ? "preços" : "marcas"}).` });
    setMsg(null);
    setOcupado(tipo);
    parar.current = false;
    const res = new Map<number, PesquisaItem>();
    const grava = () => muda((cur) => ({
      itens: cur.itens.map((i) => {
        const r = res.get(i.numero);
        if (!r) return i;
        const pq = { ...i.pesquisa, ...r };
        // Referência pesquisada: prefere contratações públicas (PNCP); senão o preço de mercado.
        return { ...i, pesquisa: pq, valorPesquisado: pq.pncp?.mediana ?? pq.mercado?.preco ?? i.valorPesquisado ?? null };
      }),
    }));
    let feitos = 0;
    let achados = 0;
    let erro = "";
    let falhas = 0;

    if (tipo === "precos") {
      for (let k = 0; k < alvo.length && !parar.current; k++) {
        const i = alvo[k];
        setProgresso(`Preço de referência no PNCP: item ${i.numero} (${k + 1} de ${alvo.length})…`);
        try {
          const r = await fetch("/api/propostas/pesquisa", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modo: "pncp", item: { descricao: i.descricao, unidade: i.unidade }, excluir: p.pncpId }),
          }).then((x) => x.json());
          if (r.ok) { res.set(i.numero, { ...i.pesquisa, em: nowIso(), pncp: r.ref }); if (r.ref.n) achados++; }
        } catch { /* segue para o próximo item */ }
        feitos++;
        grava();
      }
    } else {
      const pedirLote = (lote: ItemProposta[]) => fetch("/api/propostas/pesquisa", {
        method: "POST", headers: { "Content-Type": "application/json", ...cabecalhosIA(empresa) },
        body: JSON.stringify({ modo: "mercado", itens: lote.map((i) => ({ numero: i.numero, descricao: i.descricao, unidade: i.unidade })) }),
      }).then((x) => x.json()).catch(() => ({ ok: false, error: "falha de conexão" }));
      // Erros de configuração param tudo; os demais (sobrecarga, limite, rede) só pulam o lote.
      const deConfiguracao = (m: string) => /configurad|sem chave|inválid|permissão|não encontrado/i.test(m);
      for (let k = 0; k < alvo.length && !parar.current && !erro; k += 10) {
        const lote = alvo.slice(k, k + 10);
        setProgresso(`Marcas e preço de mercado na internet com IA: itens ${lote[0].numero} a ${lote[lote.length - 1].numero} (${Math.min(k + 10, alvo.length)} de ${alvo.length})… 1 a 2 min por lote.`);
        let r = await pedirLote(lote);
        if (!r.ok && !deConfiguracao(r.error || "") && !parar.current) {
          setProgresso(`A IA falhou neste lote (${r.error?.slice(0, 80) || "erro"}). Nova tentativa em 20 s…`);
          await new Promise((ok) => setTimeout(ok, 20000));
          if (!parar.current) r = await pedirLote(lote);
        }
        if (!r.ok) {
          if (deConfiguracao(r.error || "")) { erro = r.error; break; }
          falhas += lote.length;
          erro = "";
          continue;
        }
        {
          for (const x of r.itens ?? []) {
            const n = Number(x.numero);
            const atual = p.itens.find((i) => i.numero === n)?.pesquisa;
            if (x.marcas?.length) achados++;
            res.set(n, { ...atual, em: nowIso(), marcas: x.marcas ?? [], mercado: { preco: x.preco_medio ?? null, observacao: x.observacao ?? "" }, fontes: r.fontes ?? [] });
          }
          feitos += lote.length;
        }
        grava();
      }
    }

    setProgresso("");
    setOcupado(null);
    const interrompida = (parar.current ? ` Pesquisa interrompida em ${feitos} de ${alvo.length} itens.` : "")
      + (pulados ? ` ${pulados} já pesquisados foram pulados.` : "")
      + (falhas ? ` ${falhas} itens ficaram sem pesquisa por instabilidade da IA — clique de novo para completar.` : "");
    if (tipo === "precos") {
      setMsg({ ok: true, texto: `Referência no PNCP encontrada para ${achados} de ${feitos} itens pesquisados.${interrompida}` });
    } else {
      setMsg({
        ok: !erro && !falhas,
        texto: erro ? `Marcas não pesquisadas: ${erro}` : `Marcas sugeridas para ${achados} de ${feitos} itens — clique numa marca para usar.${interrompida}`,
      });
    }
  }

  function aplicarDesconto() {
    const pct = lerValor(desconto);
    if (pct == null || pct >= 100) return setMsg({ ok: false, texto: "Informe um desconto entre 0 e 99%." });
    const alvo = (i: ItemProposta) => i.participar && !!refItem(i) && !(soSemPreco && i.precoUnitario != null);
    const n = p!.itens.filter(alvo).length;
    muda((cur) => ({
      itens: cur.itens.map((i) => (alvo(i) ? { ...i, precoUnitario: Math.round(refItem(i)! * (1 - pct / 100) * 100) / 100 } : i)),
    }));
    setMsg({ ok: true, texto: n ? `Preço aplicado em ${n} itens (${pct}% abaixo da referência).` : "Nenhum item para aplicar: todos já têm preço ou não têm referência (use “Pesquisar preços”)." });
  }

  function baixarPlanilha() {
    if (!p) return;
    const blob = new Blob([csvProposta(p)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `proposta-${(p.numeroLicitacao || p.id).replace(/[^\w-]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const botaoIA = (acao: "carta" | "descricoes" | "revisar", Icone: typeof Sparkles, rotulo: string) => (
    <button className="btn btn-ghost justify-center" disabled={!!ocupado} onClick={() => void chamarIA(acao)}>
      {ocupado === acao ? <Loader2 size={14} className="animate-spin" /> : <Icone size={14} />} {rotulo}
    </button>
  );

  return (
    <>
      <Link href="/propostas" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-brand"><ArrowLeft size={13} /> Propostas</Link>

      {/* Cabeçalho */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <input className="w-full bg-transparent text-xl font-extrabold tracking-tight text-brand outline-none focus:underline" aria-label="Título da proposta"
            value={p.titulo} onChange={(e) => muda({ titulo: e.target.value })} />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{p.orgao || "Órgão não informado"}</span>
            {p.numeroLicitacao && <span>· {p.modalidade} {p.numeroLicitacao}</span>}
            {p.encerramento && <span>· propostas até {dataBR(p.encerramento, true)}</span>}
            {dias != null && dias >= 0 && <span className={`badge ${dias <= 2 ? "bg-red-600 text-white" : "bg-neutral-200 text-neutral-700"}`}>{dias === 0 ? "encerra hoje" : `faltam ${dias} dias`}</span>}
            {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent">PNCP <ExternalLink size={11} /></a>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`input !w-auto !py-1.5 font-semibold ${COR_STATUS[p.status]}`} aria-label="Status da proposta" value={p.status}
            onChange={(e) => muda({ status: e.target.value as Proposta["status"] })}>
            {STATUS_PROPOSTA.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Link href={`/propostas/${p.id}/imprimir`} className="btn btn-primary"><Printer size={14} /> Imprimir / PDF</Link>
          <button className="btn btn-ghost" onClick={baixarPlanilha}><FileSpreadsheet size={14} /> Planilha</button>
          <button className="btn btn-ghost !px-2.5" aria-label="Excluir proposta" onClick={() => { if (confirm("Excluir esta proposta?")) { pendente.current = null; db.remove("propostas", p.id); router.push("/propostas"); } }}><Trash2 size={14} /></button>
        </div>
      </div>

      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.texto}</div>}

      {/* Totais */}
      <div className="card sticky top-16 z-20 mb-4 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Total da proposta</div><div className="text-xl font-extrabold text-brand tabular-nums">{moeda(t.total)}</div></div>
        <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Referência total (ref. × qtd)</div><div className="text-lg font-bold tabular-nums">{moeda(t.referenciaTotal)}</div>
          {t.semReferencia > 0 && <div className="text-[11px] text-yellow-800">{t.semReferencia} item(ns) sem referência</div>}</div>
        <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Desconto sobre a referência</div>
          <div className={`text-lg font-bold tabular-nums ${t.desconto != null && t.desconto < 0 ? "text-red-600" : "text-green-700"}`}>{t.desconto == null ? "—" : `${t.desconto.toFixed(1)}%`}</div></div>
        <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Itens</div>
          <div className="text-sm font-semibold">{t.comPreco}/{t.participando} com preço</div>
          {t.acimaDoEstimado > 0 && <div className="text-xs font-semibold text-red-600">{t.acimaDoEstimado} acima da referência</div>}
        </div>
      </div>

      <div className="space-y-5">
        {/* Itens */}
        <section className="card p-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-brand flex-1">Itens ({p.itens.length})</h2>
            {ocupado === "precos" || ocupado === "marcas" ? (
              <button className="btn btn-ghost !py-1.5 !border-red-300 !text-red-700" onClick={() => { parar.current = true; }}>
                <Square size={13} /> Parar pesquisa
              </button>
            ) : (
              <>
                <button className="btn btn-primary !py-1.5" disabled={!!ocupado || !p.itens.length} onClick={() => void pesquisarItens("precos")}
                  title="Valor de referência em licitações parecidas no PNCP (dados públicos, sem IA)">
                  <Search size={14} /> Pesquisar preços
                </button>
                <button className="btn btn-ghost !py-1.5" disabled={!!ocupado || !p.itens.length} onClick={() => void pesquisarItens("marcas")}
                  title="Marcas e preço de mercado pesquisados na internet com IA">
                  <Tags size={14} /> Pesquisar marcas
                </button>
              </>
            )}
            <input className="input !w-56 !py-1.5" placeholder="Filtrar itens" aria-label="Filtrar itens" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="accent-black" checked={soParticipo} onChange={(e) => setSoParticipo(e.target.checked)} /> Só os que participo</label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-bg p-2.5 text-xs">
            <span className="font-semibold">Preço em lote:</span> referência menos
            <input className="input !w-16 !py-1 text-right" aria-label="Desconto em %" value={desconto} onChange={(e) => setDesconto(e.target.value)} /> %
            <label className="flex items-center gap-1"><input type="checkbox" className="accent-black" checked={soSemPreco} onChange={(e) => setSoSemPreco(e.target.checked)} /> só itens sem preço</label>
            <button className="btn btn-ghost !py-1 !text-xs" onClick={aplicarDesconto}>Aplicar</button>
            <span className="mx-1 text-muted">|</span>
            <button className="font-semibold text-accent" onClick={() => muda((cur) => ({ itens: cur.itens.map((i) => ({ ...i, participar: true })) }))}>Participar de todos</button>
            <button className="font-semibold text-muted hover:text-brand" onClick={() => muda((cur) => ({ itens: cur.itens.map((i) => ({ ...i, participar: false })) }))}>Nenhum</button>
          </div>

          {p.itens.length > 0 && p.itens.every((i) => i.valorEstimado == null) && (
            <p className="mt-2 rounded-lg bg-yellow-50 p-2.5 text-xs text-yellow-800">
              Orçamento sigiloso: o órgão não divulgou o valor estimado. Use “Pesquisar preços” para buscar a referência em licitações parecidas no PNCP.
            </p>
          )}
          {progresso && <p className="mt-2 flex items-center gap-2 rounded-lg bg-blue-50 p-2.5 text-xs text-blue-800"><Loader2 size={13} className="animate-spin" /> {progresso}</p>}
          {p.itens.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Proposta sem itens. Crie a proposta a partir do link do PNCP para importar os itens da licitação.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="w-8 py-2" aria-label="Participar" />
                    <th className="w-8 py-2">Nº</th>
                    <th className="py-2">Descrição, marca e modelo</th>
                    <th className="w-28 py-2 pl-3 text-right">Qtd</th>
                    <th className="w-28 py-2 pl-3 text-right">Referência unit.</th>
                    <th className="w-40 py-2 pl-3 text-right">Seu preço unit.</th>
                    <th className="w-36 py-2 pl-3 text-right">Total</th>
                    <th className="w-16 py-2 pl-3 text-right">Desc.</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((i) => {
                    const d = descontoItem(i);
                    return (
                      <tr key={i.numero} className={`border-b border-border align-top ${i.participar ? "" : "opacity-45"}`}>
                        <td className="py-3"><input type="checkbox" className="mt-1 accent-black" aria-label={`Participar do item ${i.numero}`} checked={i.participar} onChange={(e) => mudaItem(i.numero, { participar: e.target.checked })} /></td>
                        <td className="py-3 font-semibold">{i.numero}</td>
                        <td className="py-3 pr-3">
                          <button className="text-left" onClick={() => setAberto(aberto === i.numero ? null : i.numero)}>
                            <span className={aberto === i.numero ? "" : "line-clamp-2"}>{i.descricao}</span>
                          </button>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <input className="input !py-1.5 !px-2.5 text-xs" placeholder="Marca" aria-label={`Marca do item ${i.numero}`} value={i.marca} onChange={(e) => mudaItem(i.numero, { marca: e.target.value })} />
                            <input className="input !py-1.5 !px-2.5 text-xs" placeholder="Modelo / apresentação" aria-label={`Modelo do item ${i.numero}`} value={i.modelo} onChange={(e) => mudaItem(i.numero, { modelo: e.target.value })} />
                          </div>
                          {aberto === i.numero ? (
                            <textarea className="input mt-2 min-h-20 text-xs" placeholder="Descrição do produto/serviço ofertado (vai na proposta)" aria-label={`Descrição ofertada do item ${i.numero}`}
                              value={i.descricaoOfertada ?? ""} onChange={(e) => mudaItem(i.numero, { descricaoOfertada: e.target.value })} />
                          ) : i.descricaoOfertada ? (
                            <div className="mt-1.5 text-xs text-green-800 line-clamp-1">✓ Ofertado: {i.descricaoOfertada}</div>
                          ) : null}
                          {i.pesquisa && (
                            <PesquisaDoItem pq={i.pesquisa} aberto={verFontes === i.numero} onAbrir={() => setVerFontes(verFontes === i.numero ? null : i.numero)}
                              onMarca={(marca, modelo) => mudaItem(i.numero, { marca, ...(modelo ? { modelo } : {}) })} />
                          )}
                        </td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap tabular-nums">{i.quantidade.toLocaleString("pt-BR")}<div className="text-[11px] text-muted">{i.unidade}</div></td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap tabular-nums">
                          {i.valorEstimado ? moeda(i.valorEstimado) : i.valorPesquisado ? <><div>{moeda(i.valorPesquisado)}</div><div className="text-[10px] font-semibold text-blue-700">pesquisado</div></> : "—"}
                        </td>
                        <td className="py-3 pl-3 text-right"><PrecoInput valor={i.precoUnitario} aria={`Preço unitário do item ${i.numero}`} onChange={(v) => mudaItem(i.numero, { precoUnitario: v })} /></td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap font-semibold tabular-nums">
                          {i.precoUnitario != null ? moeda(totalItem(i)) : refItem(i) ? <><div className="font-normal text-muted">{moeda(estimadoItem(i))}</div><div className="text-[10px] font-normal text-muted">ref. × qtd</div></> : "—"}
                        </td>
                        <td className={`py-3 pl-3 text-right whitespace-nowrap text-xs font-semibold tabular-nums ${d == null ? "text-muted" : d < 0 ? "text-red-600" : "text-green-700"}`}>
                          {d == null ? "—" : `${d.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visiveis.length === 0 && <p className="py-4 text-sm text-muted">Nenhum item com esse filtro.</p>}
              <p className="mt-2 text-[11px] text-muted">Clique na descrição para escrever a descrição ofertada. Desconto em vermelho: preço acima do estimado (risco de desclassificação).</p>
            </div>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-2 items-start">
          {/* IA */}
          <section className="card p-4">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-brand flex-1 flex items-center gap-2"><Sparkles size={16} /> Inteligência artificial</h2>
              <Link href="/configuracoes#ia" className="text-[11px] font-semibold text-muted hover:text-brand">{ia.provedor === "gemini" ? `Gemini · ${ia.gemini_modelo}` : "Claude"}</Link>
            </div>
            <div className="mt-3 grid gap-2">
              {botaoIA("descricoes", Wand2, "Descrever itens ofertados")}
              {botaoIA("carta", FileText, "Gerar carta-proposta")}
              {botaoIA("revisar", ShieldCheck, "Conferir proposta antes de enviar")}
            </div>
            {ocupado && ocupado !== "edital" && <p className="mt-2 text-xs text-muted">A IA está trabalhando. Pode levar até 1 minuto.</p>}
            {!empresa.razao_social && <p className="mt-2 text-xs text-yellow-800">Dica: preencha os dados da empresa e do representante em <Link href="/configuracoes" className="font-semibold underline">Configurações</Link> para a carta sair completa.</p>}

            {p.revisao && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
                  {p.revisao.pontos.length ? <AlertTriangle size={13} className="text-red-600" /> : <CheckCircle2 size={13} className="text-green-700" />}
                  Conferência de {dataBR(p.revisao.em, true)}
                </div>
                {p.revisao.pontos.length === 0 && <p className="text-sm text-green-800">Nenhum problema encontrado.</p>}
                <ul className="space-y-2">
                  {p.revisao.pontos.map((x, k) => (
                    <li key={k} className={`rounded-lg border-l-4 p-2.5 text-xs ${COR_GRAVIDADE[x.gravidade]}`}>
                      <div className="font-semibold">{x.ponto}</div>
                      <div className="mt-0.5 text-muted">{x.sugestao}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Condições */}
          <section className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-brand flex-1">Condições comerciais</h2>
              {analise ? (
                <button className="text-xs font-semibold text-accent" onClick={() => { muda(condicoesDaAnalise(analise)); setMsg({ ok: true, texto: "Condições preenchidas com a análise do edital." }); }}>
                  Preencher com a análise do edital
                </button>
              ) : (p.link || p.pncpId) && (
                <button className="inline-flex items-center gap-1 text-xs font-semibold text-accent" disabled={!!ocupado} onClick={() => void analisarEdital()}>
                  {ocupado === "edital" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Ler edital com IA
                </button>
              )}
            </div>
            {ocupado === "edital" && <p className="text-xs text-muted">Baixando e lendo o edital no PNCP. Pode levar alguns minutos.</p>}
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Validade (dias)">
                <input className="input" type="number" min={1} value={p.validadeDias} onChange={(e) => muda({ validadeDias: Number(e.target.value) || 0 })} />
              </Campo>
              <Campo rotulo="Prazo de entrega"><input className="input" value={p.prazoEntrega} onChange={(e) => muda({ prazoEntrega: e.target.value })} /></Campo>
            </div>
            <Campo rotulo="Local de entrega"><input className="input" value={p.localEntrega ?? ""} onChange={(e) => muda({ localEntrega: e.target.value })} /></Campo>
            <Campo rotulo="Condições de pagamento"><input className="input" value={p.condicoesPagamento} onChange={(e) => muda({ condicoesPagamento: e.target.value })} /></Campo>
            <Campo rotulo="Garantia"><input className="input" value={p.garantia ?? ""} onChange={(e) => muda({ garantia: e.target.value })} /></Campo>
            <Campo rotulo="Observações"><textarea className="input min-h-16" value={p.observacoes} onChange={(e) => muda({ observacoes: e.target.value })} /></Campo>

            {!!p.exigencias?.length && (
              <div>
                <div className="text-xs font-semibold text-muted">Exigências do edital para a proposta</div>
                <ul className="mt-1.5 space-y-1 text-xs">
                  {p.exigencias.map((e, k) => <li key={k} className="flex gap-1.5"><span className="text-muted">•</span><span>{e}</span></li>)}
                </ul>
              </div>
            )}
          </section>

          {/* Carta */}
          <section className="card p-4 lg:col-span-2">
            <h2 className="font-bold text-brand">Carta-proposta</h2>
            <p className="mt-0.5 text-xs text-muted">Vai no início do documento impresso, antes da tabela de itens.</p>
            <textarea className="input mt-2 min-h-60 text-xs leading-relaxed" placeholder="Escreva aqui ou use “Gerar carta-proposta”."
              value={p.carta ?? ""} onChange={(e) => muda({ carta: e.target.value })} />
          </section>
        </div>
      </div>
    </>
  );
}
