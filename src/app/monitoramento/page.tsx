"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, X, Square, Play, ExternalLink, Building2, MapPin, BellRing, Search, ShieldCheck } from "lucide-react";
import { Empty, PageHeader, StatCard } from "@/components/ui";
import { corEvento, EventoTag } from "@/components/EventoTag";
import { db, newId, useCollection, useEmpresa } from "@/lib/store";
import { codigoCompraFromLink, comprasnetUrl, itemDoTexto, orgaoPregao, parseCodigoCompra, pncpFromLink, rotuloRemetente, tituloPregao } from "@/lib/monitor";
import { abrirNoComprasnet } from "@/lib/extensao";
import { supabase } from "@/lib/supabase";
import { retroSearch } from "@/lib/ingestLocal";
import { dataBR, nowIso } from "@/lib/format";
import type { ChatMessage, Pregao } from "@/lib/types";

function Keywords() {
  const { empresa, save } = useEmpresa();
  const [term, setTerm] = useState("");
  const [info, setInfo] = useState("");

  function add(e: React.FormEvent) {
    e.preventDefault();
    const t = term.trim();
    if (!t || empresa.palavras_chave.some((k) => k.toLowerCase() === t.toLowerCase())) return setTerm("");
    save({ palavras_chave: [...empresa.palavras_chave, t] });
    const n = retroSearch(t);
    setInfo(n ? `Busca retroativa: ${n} menção(ões) encontradas nas mensagens já capturadas.` : "Termo salvo. Nenhuma menção nas mensagens já capturadas.");
    setTerm("");
  }

  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Palavras-chave do alerta — valem para todos os pregões</div>
      <p className="text-xs text-muted mt-1">
        Além destes termos, vigiamos o CNPJ e a razão social cadastrados em Configurações.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {empresa.palavras_chave.length === 0 && <span className="text-sm text-muted">Nenhuma palavra-chave ainda.</span>}
        {empresa.palavras_chave.map((k) => (
          <span key={k} className="badge bg-accent-soft text-accent !text-xs !py-1">
            {k}
            <button aria-label={`Remover ${k}`} onClick={() => save({ palavras_chave: empresa.palavras_chave.filter((x) => x !== k) })}><X size={12} /></button>
          </span>
        ))}
      </div>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input className="input" placeholder="Ex.: nome fantasia, item 3, recurso" value={term} onChange={(e) => setTerm(e.target.value)} />
        <button className="btn btn-primary shrink-0"><Plus size={14} /> Adicionar</button>
      </form>
      {info && <div className="mt-2 text-xs text-ok">{info}</div>}
    </div>
  );
}

type Filtro = "todos" | "ativos" | "alertas" | "encerrados";
const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "todos", nome: "Todos" },
  { id: "ativos", nome: "Ativos" },
  { id: "alertas", nome: "Com alertas novos" },
  { id: "encerrados", nome: "Encerrados" },
];

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Pesquisa por UASG, número, órgão, cidade/UF, objeto e código (todas as palavras precisam aparecer). */
function combina(p: Pregao, busca: string) {
  const termos = semAcento(busca).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const alvo = semAcento([tituloPregao(p), p.codigo_compra, p.orgao, p.municipio, p.uf, p.objeto].filter(Boolean).join(" "));
  return termos.every((t) => alvo.includes(t));
}

function haQuanto(iso: string | null) {
  if (!iso) return "—";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  return dataBR(iso, true);
}

/** Última captura: a leitura mais recente do portal (mesmo sem mensagem nova) ou a última mensagem salva. */
function maisRecente(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function PregaoCard({ p, selected, onSelect, onAbrir, alertas, mensagens, ultima }: {
  p: Pregao; selected: boolean; onSelect: () => void; onAbrir: () => void; alertas: number; mensagens: number; ultima: string | null;
}) {
  const ativo = p.status !== "Encerrado";
  const valido = !!parseCodigoCompra(p.codigo_compra);
  const local = [p.municipio, p.uf].filter(Boolean).join("/");
  return (
    <div onClick={onSelect} className={`card p-4 cursor-pointer transition hover:border-accent/50 ${selected ? "border-accent ring-2 ring-accent-soft" : ""} ${ativo ? "" : "opacity-60"}`}>
      <div className="font-bold text-[15px] leading-snug text-brand truncate">{tituloPregao(p)}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted min-w-0">
        <Building2 size={12} className="shrink-0" />
        <span className="truncate" title={p.orgao}>{p.orgao || (valido ? "Buscando dados do órgão…" : "Órgão não identificado")}</span>
      </div>
      {local && (
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <MapPin size={12} className="shrink-0" />
          <span className="truncate">{local}</span>
        </div>
      )}

      {p.objeto && <div className="mt-2 text-xs leading-snug line-clamp-2">{p.objeto}</div>}

      {!valido && (
        <div className="mt-2 rounded-lg bg-danger/10 p-2 text-xs text-danger">
          Código com {p.codigo_compra.length} dígitos: não parece de compra do Comprasnet (pode ser o CNPJ de um link do PNCP).
          Remova e cadastre de novo com o link do edital ou do acompanhamento.
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 divide-x divide-border rounded-lg bg-bg py-2 text-center">
        <div>
          <div className="text-[15px] font-bold tabular-nums">{mensagens}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Mensagens</div>
        </div>
        <div>
          <div className={`text-[15px] font-bold tabular-nums ${alertas ? "text-danger" : ""}`}>{alertas}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Alertas novos</div>
        </div>
        <div>
          <div className="text-[13px] font-semibold leading-[22px]">{haQuanto(ultima)}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Última captura</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {ativo && valido && (
          <button className="font-semibold text-accent inline-flex items-center gap-1" onClick={(e) => { e.stopPropagation(); onAbrir(); }}>
            <ExternalLink size={12} /> Abrir no Comprasnet
          </button>
        )}
        <button className="text-muted hover:text-brand inline-flex items-center gap-1"
          onClick={(e) => { e.stopPropagation(); db.update("pregoes", p.id, { status: ativo ? "Encerrado" : "Aguardando captura" }); }}>
          {ativo ? <><Square size={12} /> Encerrar</> : <><Play size={12} /> Reativar</>}
        </button>
        <span className="ml-auto font-mono text-[10px] text-muted" title="Código da compra no Comprasnet">{p.codigo_compra}</span>
        <button className="text-muted hover:text-danger" aria-label="Remover do monitoramento"
          onClick={(e) => { e.stopPropagation(); if (confirm("Remover este pregão do monitoramento?")) db.remove("pregoes", p.id); }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function deQuem(remetente: string) {
  const r = remetente || "Sistema";
  if (/^(Comissão|Autoridade)/.test(r)) return `Mensagem da ${r}`;
  if (/^(Pregoeiro|Sistema|Fornecedor)$/.test(r)) return `Mensagem do ${r}`;
  return `Mensagem de ${r}`;
}

function quando(m: ChatMessage) {
  return m.data_hora && !Number.isNaN(new Date(m.data_hora).getTime()) ? m.data_hora : m.created_at;
}

/** Chat de um pregão: todas as mensagens juntas ou só as dos itens escolhidos. */
/** Ajusta mensagens salvas antes da leitura de remetente/item (códigos 0/1/3, item no texto, "Mensagem geral:"). */
function paraExibir(m: ChatMessage): ChatMessage & { geral: boolean } {
  const geral = /^\s*mensagem geral\s*:\s*/i.test(m.texto);
  return {
    ...m,
    remetente: rotuloRemetente(m.remetente),
    item: m.item ?? itemDoTexto(m.texto),
    texto: geral ? m.texto.replace(/^\s*mensagem geral\s*:\s*/i, "") : m.texto,
    geral,
  };
}

function ChatPainel({ pregao, msgs: salvas }: { pregao: Pregao; msgs: ChatMessage[] }) {
  const [itens, setItens] = useState<Set<string>>(new Set());
  const msgs = salvas.map(paraExibir);
  const ordenadas = [...msgs].sort((a, b) => quando(b).localeCompare(quando(a)));
  const contagem = new Map<string, number>();
  for (const m of ordenadas) { const k = m.item ?? "geral"; contagem.set(k, (contagem.get(k) ?? 0) + 1); }
  const chips = [...contagem.keys()].filter((k) => k !== "geral").sort((a, b) => Number(a) - Number(b));
  const visiveis = itens.size ? ordenadas.filter((m) => itens.has(m.item ?? "geral")) : ordenadas;
  const alternar = (k: string) => setItens((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const chip = (ativo: boolean) => `rounded-full border px-2.5 py-1 text-xs font-semibold transition ${ativo ? "border-brand bg-brand text-white" : "border-border bg-surface text-muted hover:text-brand"}`;

  return (
    <>
      <div className="mb-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="font-bold text-brand flex-1">{tituloPregao(pregao)}</div>
          <span className="text-xs text-muted">{visiveis.length} de {msgs.length} mensagens</span>
        </div>
        {orgaoPregao(pregao) && <div className="mt-0.5 text-xs text-muted">{orgaoPregao(pregao)}</div>}
      </div>

      {msgs.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por item">
          <button className={chip(itens.size === 0)} onClick={() => setItens(new Set())}>Todas ({msgs.length})</button>
          {chips.map((k) => (
            <button key={k} className={chip(itens.has(k))} aria-pressed={itens.has(k)} onClick={() => alternar(k)}>
              Item {k} ({contagem.get(k)})
            </button>
          ))}
          {contagem.has("geral") && chips.length > 0 && (
            <button className={chip(itens.has("geral"))} aria-pressed={itens.has("geral")} onClick={() => alternar("geral")}>
              Gerais ({contagem.get("geral")})
            </button>
          )}
        </div>
      )}

      {msgs.length === 0 && <div className="text-sm text-muted">Nenhuma mensagem capturada ainda.</div>}
      <ul className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
        {visiveis.map((m) => (
          <li key={m.id} className={`rounded-xl border-l-4 p-3 text-sm shadow-sm ${m.remetente === "Pregoeiro" ? "bg-accent-soft" : "bg-bg"} ${corEvento(m.evento)?.borda ?? (m.remetente === "Pregoeiro" ? "border-l-brand" : "border-l-transparent")}`}>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-semibold text-brand">{deQuem(m.remetente)}</span>
              {m.evento && <EventoTag evento={m.evento} />}
              {m.item ? <span className="ml-auto font-semibold text-accent">Item {m.item}</span>
                : m.geral && <span className="ml-auto text-xs font-semibold text-muted">Mensagem geral</span>}
            </div>
            <div className="mt-1.5 leading-relaxed">{m.texto}</div>
            <div className="mt-1 text-right text-[11px] text-muted">{dataBR(m.data_hora ?? m.created_at, true)}</div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Completa órgão/município/UF dos pregões pela UASG (uma consulta por pregão). */
function useDadosOrgao(pregoes: Pregao[]) {
  const pedidos = useRef(new Set<string>());
  useEffect(() => {
    for (const p of pregoes) {
      if (p.orgao || !parseCodigoCompra(p.codigo_compra) || pedidos.current.has(p.id)) continue;
      pedidos.current.add(p.id);
      fetch(`/api/monitoramento/uasg?codigo=${p.codigo_compra}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.orgao) db.update("pregoes", p.id, { orgao: d.orgao, municipio: d.municipio, uf: d.uf, titulo: tituloPregao(p) }); })
        .catch(() => {});
    }
  }, [pregoes]);
}

export default function Monitoramento() {
  const { items: pregoes } = useCollection("pregoes");
  const { items: msgs } = useCollection("chat_messages");
  const { items: alerts } = useCollection("alerts");
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setAdmin(data.user?.app_metadata?.role === "admin"));
  }, []);
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  useDadosOrgao(pregoes);

  async function abrir(codigo: string, mostrar: boolean) {
    setErr("");
    const r = await abrirNoComprasnet(codigo, mostrar);
    if (!r.ok) return setErr("A extensão não respondeu. Recarregue a extensão em chrome://extensions e dê F5 nesta página.");
    if (!r.viaExtensao) return setInfo(`Compra ${codigo} aberta numa aba nova. Com a extensão conectada, ela abre e captura sozinha.`);
    if (mostrar) return setInfo("");
    setInfo(r.jaAberta ? `A compra ${codigo} já está aberta no Comprasnet.` : `Compra ${codigo} aberta no Comprasnet numa janela minimizada — a captura começa sozinha.`);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setInfo("");
    let codigo = codigoCompraFromLink(link);
    let objeto = "";
    if (!codigo && pncpFromLink(link)) {
      // Link do PNCP: descobre no PNCP o código da compra no Comprasnet.
      setBusy(true);
      const r = await fetch(`/api/monitoramento/resolver?link=${encodeURIComponent(link.trim())}`).then((x) => x.json()).catch(() => null);
      setBusy(false);
      if (!r?.ok) return setErr(r?.error || "Não consegui consultar o PNCP. Tente de novo.");
      codigo = r.codigo_compra as string;
      objeto = String(r.objeto || "").slice(0, 300);
    }
    if (!codigo) return setErr("Não encontrei o código da compra. Cole o link de acompanhamento do Comprasnet (…acompanhamento-compra?compra=…) ou o link do edital no PNCP.");
    if (pregoes.some((p) => p.codigo_compra === codigo)) return setErr("Esse pregão já está sendo monitorado.");
    db.upsert("pregoes", {
      id: newId(), codigo_compra: codigo, link: comprasnetUrl(codigo), titulo: tituloPregao({ codigo_compra: codigo, titulo: `Compra ${codigo}` }),
      ...(objeto ? { objeto } : {}),
      status: "Aguardando captura", mensagens: 0, ultima_captura: null, created_at: nowIso(),
    });
    setLink("");
    // Usuário comum: quem captura é o robô do administrador (entra na frente da fila dele).
    if (admin) void abrir(codigo, false);
    else setInfo(`Compra ${codigo} adicionada. O robô do PEPPACORP vai capturar as mensagens e elas aparecem aqui sozinhas.`);
  }

  const alertasNovos = (codigo: string) => alerts.filter((a) => !a.lido && a.ref === codigo).length;
  const contagem: Record<Filtro, number> = {
    todos: pregoes.length,
    ativos: pregoes.filter((p) => p.status !== "Encerrado").length,
    alertas: pregoes.filter((p) => alertasNovos(p.codigo_compra) > 0).length,
    encerrados: pregoes.filter((p) => p.status === "Encerrado").length,
  };
  const filtrados = pregoes.filter((p) => {
    if (filtro === "ativos" && p.status === "Encerrado") return false;
    if (filtro === "encerrados" && p.status !== "Encerrado") return false;
    if (filtro === "alertas" && !alertasNovos(p.codigo_compra)) return false;
    return combina(p, busca);
  });
  const current = filtrados.find((p) => p.id === selected) ?? filtrados[0] ?? null;
  const currentMsgs = current ? msgs.filter((m) => m.codigo_compra === current.codigo_compra) : [];
  // Contagem direto das mensagens salvas (o contador do pregão zera se ele for removido e cadastrado de novo).
  const porCompra = new Map<string, { n: number; ultima: string | null }>();
  for (const m of msgs) {
    const c = porCompra.get(m.codigo_compra) ?? { n: 0, ultima: null };
    c.n++;
    if (!c.ultima || m.created_at > c.ultima) c.ultima = m.created_at;
    porCompra.set(m.codigo_compra, c);
  }

  return (
    <>
      <PageHeader title="Monitoramento" subtitle="Chat do pregoeiro do Comprasnet: alertas de prazos, convocações e menções à sua empresa"
        actions={
          <>
            {admin && <Link href="/monitoramento/admin" className="btn btn-ghost"><ShieldCheck size={14} /> Ciclo (admin)</Link>}
            <Link href="/monitoramento/alarme" className="btn btn-primary"><BellRing size={14} /> Alarme</Link>
          </>
        } />

      <form onSubmit={add} className="card p-4 mb-4 flex flex-col sm:flex-row gap-2">
        <input className="input" placeholder="Link de acompanhamento do Comprasnet (…?compra=98412305941402025) ou link do edital no PNCP" value={link} onChange={(e) => setLink(e.target.value)} />
        <button className="btn btn-primary shrink-0 justify-center" disabled={busy}><Plus size={14} /> {busy ? "Consultando PNCP…" : "Monitorar"}</button>
      </form>
      {err && <div className="-mt-2 mb-4 text-xs text-danger">{err}</div>}
      {info && <div className="-mt-2 mb-4 text-xs text-ok">{info}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Pregões monitorados" value={pregoes.length} />
        <StatCard label="Capturando agora" value={pregoes.filter((p) => p.status === "Capturando").length} />
        <StatCard label="Mensagens capturadas" value={msgs.length} />
        <StatCard label="Alertas não lidos" value={alerts.filter((a) => !a.lido).length} accent />
      </div>

      <Keywords />

      <div className="card p-4 mt-4 text-xs text-muted">
        A captura automática do chat é feita pela extensão PEPPACORP Monitor. Instale e conecte em
        <Link href="/conectar-robo" className="mx-1 font-semibold text-accent">Conectar Robô</Link>
        e cadastre a compra acima: a extensão abre o acompanhamento no Comprasnet e captura o chat sozinha.
      </div>

      {pregoes.length > 0 && (
        <div className="card mt-4 p-3 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !pl-9 !pr-9" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar pregão: UASG, número, órgão, cidade, objeto ou código da compra" aria-label="Pesquisar pregões monitorados" />
            {busca && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-brand" aria-label="Limpar pesquisa" onClick={() => setBusca("")}>
                <X size={15} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar pregões">
            {FILTROS.map((f) => (
              <button key={f.id} onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filtro === f.id ? "border-brand bg-brand text-white" : "border-border bg-surface text-muted hover:text-brand"}`}>
                {f.nome} ({contagem[f.id]})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-3">
          {pregoes.length === 0 && <Empty title="Nenhum pregão monitorado" text="Cole acima o link de acompanhamento do Comprasnet ou o link do edital no PNCP." />}
          {pregoes.length > 0 && filtrados.length === 0 && (
            <Empty title="Nenhum pregão encontrado" text="Mude a pesquisa ou o filtro."
              action={<button className="btn btn-ghost" onClick={() => { setBusca(""); setFiltro("todos"); }}>Limpar pesquisa</button>} />
          )}
          {(busca || filtro !== "todos") && filtrados.length > 0 && (
            <div className="px-1 text-xs text-muted">{filtrados.length} de {pregoes.length} pregões</div>
          )}
          {filtrados.map((p) => (
            <PregaoCard key={p.id} p={p} selected={current?.id === p.id} alertas={alertasNovos(p.codigo_compra)}
              mensagens={porCompra.get(p.codigo_compra)?.n ?? 0} ultima={maisRecente(porCompra.get(p.codigo_compra)?.ultima ?? null, p.ultima_captura)}
              onSelect={() => setSelected(p.id)} onAbrir={() => void abrir(p.codigo_compra, true)} />
          ))}
        </div>
        <div className="card p-4 min-h-60 lg:sticky lg:top-20 self-start">
          {!current ? (
            <div className="text-sm text-muted">Selecione um pregão para ver as mensagens.</div>
          ) : (
            <ChatPainel key={current.id} pregao={current} msgs={currentMsgs} />
          )}
        </div>
      </div>
    </>
  );
}
