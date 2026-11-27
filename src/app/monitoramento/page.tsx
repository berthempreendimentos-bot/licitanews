"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, X, Square, Play, ExternalLink, Building2, MapPin, BellRing, Search, ShieldCheck, Tag, Star } from "lucide-react";
import { Empty, PageHeader, StatCard } from "@/components/ui";
import { corEvento, EventoTag } from "@/components/EventoTag";
import { db, newId, useCollection, useEmpresa } from "@/lib/store";
import { alertaCorrespondeConfig, alertasDaEmpresa, codigoCompraFromLink, comprasnetUrl, itemDoTexto, orgaoPregao, parseCodigoCompra, pncpFromLink, rotuloRemetente, tituloPregao, findMention, watchTerms } from "@/lib/monitor";
import { rotuloSituacaoMonitoramento } from "@/lib/monitor";
import { abrirNoComprasnet } from "@/lib/extensao";
import { supabase } from "@/lib/supabase";
import { dataBR, nowIso } from "@/lib/format";
import type { ChatMessage, Pregao } from "@/lib/types";

type Filtro = "todos" | "ativos" | "favoritas" | "alertas" | "encerrados";
const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "todos", nome: "Todos" },
  { id: "ativos", nome: "Ativos" },
  { id: "favoritas", nome: "⭐ Favoritas" },
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

function PregaoCard({ p, selected, onSelect, onAbrir, alertas, mensagens, ultima, onToggleFavorita }: {
  p: Pregao; selected: boolean; onSelect: () => void; onAbrir: () => void; alertas: number; mensagens: number; ultima: string | null; onToggleFavorita: () => void;
}) {
  const ativo = p.status !== "Encerrado";
  const valido = !!parseCodigoCompra(p.codigo_compra);
  const local = [p.municipio, p.uf].filter(Boolean).join("/");
  return (
    <div onClick={onSelect} className={`card p-4 cursor-pointer transition hover:border-accent/50 ${selected ? "border-accent ring-2 ring-accent-soft" : ""} ${ativo ? "" : "opacity-60"}`}>
      <div className="font-bold text-[15px] leading-snug text-brand truncate">
        {p.favorita && <Star size={14} className="inline text-yellow-500 fill-yellow-400 mr-1 -mt-0.5" />}
        {tituloPregao(p)}
      </div>
      {p.situacao_monitoramento && (
        <div className="mt-1">
          <span className="badge bg-bg text-muted">{rotuloSituacaoMonitoramento(p.situacao_monitoramento)}</span>
        </div>
      )}
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted min-w-0">
        <Building2 size={12} className="shrink-0" />
        <span className="truncate" title={p.orgao}>{p.orgao || (valido ? "Buscando dados do órgão…" : "Órgão não identificado")}</span>
      </div>
      {local && (
        <div className="mt-1 flex items-center gap-1 text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[11px] border border-blue-200/70">
            <MapPin size={11} className="shrink-0 text-blue-600" />
            <span className="truncate">{local}</span>
          </span>
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
        <button className={`inline-flex items-center gap-1 ${p.favorita ? "text-yellow-500 hover:text-yellow-600" : "text-muted hover:text-yellow-500"}`}
          onClick={(e) => { e.stopPropagation(); onToggleFavorita(); }} title={p.favorita ? "Remover dos favoritos" : "Marcar como favorito"}>
          <Star size={14} className={p.favorita ? "fill-yellow-400" : ""} />
          {p.favorita ? "Favorita" : "Favoritar"}
        </button>
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

function ChatPainel({ pregao, msgs: salvas, carregando }: { pregao: Pregao; msgs: ChatMessage[]; carregando?: boolean }) {
  const { empresa } = useEmpresa();
  const termos = watchTerms(empresa);

  const [itens, setItens] = useState<Set<string>>(new Set());
  const [eventoFiltro, setEventoFiltro] = useState<string>("todos");
  const [mencaoFiltro, setMencaoFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState<string>("");

  const msgs = salvas.map((m) => {
    const exib = paraExibir(m);
    const termo = findMention(exib.texto, termos);
    return { ...exib, mencaoTermo: termo };
  });

  const ordenadas = [...msgs].sort((a, b) => quando(b).localeCompare(quando(a)));

  // Contagem de itens
  const contagemItens = new Map<string, number>();
  for (const m of ordenadas) {
    const k = m.item ?? "geral";
    contagemItens.set(k, (contagemItens.get(k) ?? 0) + 1);
  }
  const chips = [...contagemItens.keys()].filter((k) => k !== "geral").sort((a, b) => Number(a) - Number(b));

  // Contagem de eventos / tipos de alarme presentes neste pregão
  const eventosMapa = new Map<string, number>();
  for (const m of ordenadas) {
    if (m.evento) eventosMapa.set(m.evento, (eventosMapa.get(m.evento) ?? 0) + 1);
  }
  const eventosDisponiveis = Array.from(eventosMapa.entries()).sort((a, b) => b[1] - a[1]);

  // Contagem de menções aos termos da empresa presentes neste pregão
  const mencoesMapa = new Map<string, number>();
  for (const m of ordenadas) {
    if (m.mencaoTermo) mencoesMapa.set(m.mencaoTermo, (mencoesMapa.get(m.mencaoTermo) ?? 0) + 1);
  }
  const mencoesDisponiveis = Array.from(mencoesMapa.entries()).sort((a, b) => b[1] - a[1]);

  // Aplica os filtros
  const buscaLimpa = busca.trim().toLowerCase();
  const visiveis = ordenadas.filter((m) => {
    // 1. Filtro por item
    if (itens.size > 0 && !itens.has(m.item ?? "geral")) return false;

    // 2. Filtro por tipo de alarme/evento
    if (eventoFiltro !== "todos") {
      if (eventoFiltro === "mencao") {
        if (!m.mencaoTermo) return false;
      } else if (m.evento !== eventoFiltro) {
        return false;
      }
    }

    // 3. Filtro por nome da menção
    if (mencaoFiltro !== "todos") {
      if (!m.mencaoTermo || m.mencaoTermo.toLowerCase() !== mencaoFiltro.toLowerCase()) {
        return false;
      }
    }

    // 4. Busca de texto
    if (buscaLimpa) {
      const texto = `${m.texto} ${m.remetente} ${m.item ?? ""}`.toLowerCase();
      if (!texto.includes(buscaLimpa)) return false;
    }

    return true;
  });

  const alternar = (k: string) => setItens((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const chip = (ativo: boolean) => `rounded-full border px-2.5 py-1 text-xs font-semibold transition ${ativo ? "border-brand bg-brand text-white" : "border-border bg-surface text-muted hover:text-brand"}`;

  return (
    <>
      <div className="mb-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="font-bold text-brand flex-1">{tituloPregao(pregao)}</div>
          <span className="text-xs text-muted">
            {carregando ? "Carregando mensagens…" : `${visiveis.length} de ${msgs.length} mensagens`}
          </span>
        </div>
        {orgaoPregao(pregao) && <div className="mt-0.5 text-xs text-muted">{orgaoPregao(pregao)}</div>}
      </div>

      {msgs.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-bg/80 p-3 space-y-3">
          {/* Header dos filtros */}
          <div className="flex items-center gap-2">
            <Search size={13} className="text-muted" />
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Filtros</span>
          </div>

          {/* Linha 1: Busca + Evento + Menção */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input !py-1.5 !pl-7 !text-xs"
                placeholder="Buscar no chat..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              {busca && (
                <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-brand">
                  <X size={11} />
                </button>
              )}
            </div>

            <select
              className="input !py-1.5 !text-xs cursor-pointer font-medium"
              value={eventoFiltro}
              onChange={(e) => setEventoFiltro(e.target.value)}
              aria-label="Filtrar por tipo de alarme/evento"
            >
              <option value="todos">Todos os tipos de alarme ({msgs.length})</option>
              {mencoesDisponiveis.length > 0 && (
                <option value="mencao">Menções à empresa ({mencoesDisponiveis.reduce((s, [, q]) => s + q, 0)})</option>
              )}
              {eventosDisponiveis.map(([ev, qtd]) => (
                <option key={ev} value={ev}>{ev} ({qtd})</option>
              ))}
            </select>

            <select
              className="input !py-1.5 !text-xs cursor-pointer font-medium"
              value={mencaoFiltro}
              onChange={(e) => setMencaoFiltro(e.target.value)}
              disabled={mencoesDisponiveis.length === 0}
              aria-label="Filtrar por nome da menção"
            >
              <option value="todos">
                {mencoesDisponiveis.length > 0 ? `Todas as menções (${mencoesDisponiveis.reduce((s, [, q]) => s + q, 0)})` : "Sem menções neste chat"}
              </option>
              {mencoesDisponiveis.map(([nome, qtd]) => (
                <option key={nome} value={nome}>@{nome} ({qtd})</option>
              ))}
            </select>
          </div>

          {/* Linha 2: Chips de Itens */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60" role="group" aria-label="Filtrar por item">
            <span className="text-[11px] font-semibold text-muted uppercase mr-1">Itens:</span>
            <button className={chip(itens.size === 0)} onClick={() => setItens(new Set())}>Todas ({msgs.length})</button>
            {chips.map((k) => (
              <button key={k} className={chip(itens.has(k))} aria-pressed={itens.has(k)} onClick={() => alternar(k)}>
                Item {k} ({contagemItens.get(k)})
              </button>
            ))}
            {contagemItens.has("geral") && chips.length > 0 && (
              <button className={chip(itens.has("geral"))} aria-pressed={itens.has("geral")} onClick={() => alternar("geral")}>
                Gerais ({contagemItens.get("geral")})
              </button>
            )}
            {(itens.size > 0 || eventoFiltro !== "todos" || mencaoFiltro !== "todos" || busca) && (
              <button
                onClick={() => { setItens(new Set()); setEventoFiltro("todos"); setMencaoFiltro("todos"); setBusca(""); }}
                className="text-accent hover:underline ml-auto text-[11px] font-medium"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {carregando && msgs.length === 0 && (
        <div className="py-12 text-center text-sm text-muted animate-pulse">
          Carregando mensagens do pregão…
        </div>
      )}
      {!carregando && msgs.length === 0 && (
        <div className="text-sm text-muted">Nenhuma mensagem capturada ainda.</div>
      )}
      <ul className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
        {visiveis.map((m) => (
          <li key={m.id} className={`rounded-xl border-l-4 p-3 text-sm shadow-sm ${m.remetente === "Pregoeiro" ? "bg-accent-soft" : "bg-bg"} ${corEvento(m.evento)?.borda ?? (m.remetente === "Pregoeiro" ? "border-l-brand" : "border-l-transparent")}`}>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-semibold text-brand">{deQuem(m.remetente)}</span>
              {m.evento && <EventoTag evento={m.evento} />}
              {m.mencaoTermo && (
                <span className="badge bg-danger/15 text-danger font-semibold text-[11px] gap-1" title="Menção à sua empresa">
                  <Tag size={10} /> @{m.mencaoTermo}
                </span>
              )}
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
  const { empresa } = useEmpresa();
  const cfg = alertasDaEmpresa(empresa);
  const alertsConfigurados = alerts.filter((a) => alertaCorrespondeConfig(a.tipo, cfg.eventos));
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setAdmin(data.user?.app_metadata?.role === "admin"));
  }, []);
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [palavraFiltro, setPalavraFiltro] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [toast, setToast] = useState("");

  useDadosOrgao(pregoes);

  function toggleFavorita(pregao: Pregao) {
    const nova = !pregao.favorita;
    db.update("pregoes", pregao.id, { favorita: nova });
    setToast(nova ? `⭐ "${tituloPregao(pregao)}" adicionada aos favoritos.` : `"${tituloPregao(pregao)}" removida dos favoritos.`);
    setTimeout(() => setToast(""), 3000);
  }

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

  const alertasNovos = (codigo: string) => alertsConfigurados.filter((a) => !a.lido && a.ref === codigo).length;
  const contagem: Record<Filtro, number> = {
    todos: pregoes.length,
    ativos: pregoes.filter((p) => p.status !== "Encerrado").length,
    favoritas: pregoes.filter((p) => p.favorita && p.status !== "Encerrado").length,
    alertas: pregoes.filter((p) => alertasNovos(p.codigo_compra) > 0).length,
    encerrados: pregoes.filter((p) => p.status === "Encerrado").length,
  };

  const filtrados = pregoes
    .filter((p) => {
      if (filtro === "ativos" && p.status === "Encerrado") return false;
      if (filtro === "encerrados" && p.status !== "Encerrado") return false;
      if (filtro === "favoritas" && !p.favorita) return false;
      if (filtro === "alertas" && !alertasNovos(p.codigo_compra)) return false;
      if (busca.trim() && !combina(p, busca)) return false;
      if (palavraFiltro && !p.palavras_chave?.includes(palavraFiltro)) return false;
      return true;
    })
    .sort((a, b) => {
      // 1. Novas (nunca capturadas) na frente
      const aUltima = a.ultima_captura || "";
      const bUltima = b.ultima_captura || "";
      if (!aUltima && bUltima) return -1;
      if (aUltima && !bUltima) return 1;
      // 2. Das já capturadas, as mais antigas primeiro (as atualizadas recentemente vão para o final da fila)
      return aUltima.localeCompare(bUltima);
    });
  const current = filtrados.find((p) => p.id === selected) ?? filtrados[0] ?? null;
  const currentMsgs = current ? msgs.filter((m) => m.codigo_compra === current.codigo_compra) : [];
  const [carregandoChat, setCarregandoChat] = useState(false);

  // Busca sempre as mensagens mais atualizadas do pregão selecionado no Supabase
  useEffect(() => {
    if (!current || !supabase) return;

    let cancelado = false;
    setCarregandoChat(!msgs.some((m) => m.codigo_compra === current.codigo_compra));

    async function buscarDireto() {
      try {
        const { data: sess } = await supabase!.auth.getSession();
        const uid = sess.session?.user.id;
        if (!uid || cancelado) {
          if (!cancelado) setCarregandoChat(false);
          return;
        }

        const { data, error } = await supabase!
          .from("records")
          .select("data")
          .eq("collection", "chat_messages")
          .eq("user_id", uid)
          .eq("data->>codigo_compra", current!.codigo_compra)
          .order("created_at", { ascending: false });

        if (!cancelado) setCarregandoChat(false);
        if (error || !data || data.length === 0) return;
        const diretas = data.map((r) => r.data as ChatMessage);
        db.upsertMany("chat_messages", diretas);
      } catch {
        if (!cancelado) setCarregandoChat(false);
      }
    }

    void buscarDireto();

    return () => { cancelado = true; };
  }, [current, msgs]);

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
        <Link href="/monitoramento/palavras-chave" className="btn btn-ghost shrink-0 justify-center"><Tag size={14} /> Palavras-chave</Link>
      </form>
      {err && <div className="-mt-2 mb-4 text-xs text-danger">{err}</div>}
      {info && <div className="-mt-2 mb-4 text-xs text-ok">{info}</div>}
      {toast && <div className="-mt-2 mb-4 text-xs text-yellow-600 bg-yellow-50 px-3 py-2 rounded-lg border border-yellow-200">{toast}</div>}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Monitorados" value={pregoes.length} />
        <StatCard label="Favoritos" value={pregoes.filter((p) => p.favorita).length} />
        <StatCard label="Alertas não lidos" value={alertsConfigurados.filter((a) => !a.lido).length} accent />
      </div>

      <div className="card p-4 mt-4 text-xs text-muted">
        A captura automática do chat é feita pela extensão PEPPACORP Monitor. Instale e conecte em
        <Link href="/conectar-robo" className="mx-1 font-semibold text-accent">Conectar Monitor</Link>
        e cadastre a compra acima: a extensão abre o acompanhamento no Comprasnet e captura o chat sozinha.
      </div>

      {pregoes.length > 0 && (
        <div className="card mt-4 p-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !pl-9 !pr-9" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar pregão: UASG, número, órgão, cidade, objeto ou código" aria-label="Pesquisar pregões monitorados" />
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
          <select className="input w-auto shrink-0" value={palavraFiltro} onChange={(e) => setPalavraFiltro(e.target.value)} aria-label="Filtrar por palavra-chave">
            <option value="">Todas as palavras-chave</option>
            {(() => {
              const todas = new Set<string>();
              pregoes.forEach((p) => p.palavras_chave?.forEach((kw: string) => todas.add(kw)));
              return Array.from(todas).sort().map((kw) => <option key={kw} value={kw}>{kw}</option>);
            })()}
          </select>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-3">
          {pregoes.length === 0 && <Empty title="Nenhum pregão monitorado" text="Cole acima o link de acompanhamento do Comprasnet ou o link do edital no PNCP." />}
          {pregoes.length > 0 && filtrados.length === 0 && (
            <Empty title="Nenhum pregão encontrado" text="Mude a pesquisa ou o filtro."
              action={<button className="btn btn-ghost" onClick={() => { setBusca(""); setFiltro("todos"); setPalavraFiltro(""); }}>Limpar pesquisa</button>} />
          )}
          {(busca || filtro !== "todos") && filtrados.length > 0 && (
            <div className="px-1 text-xs text-muted">
              {filtrados.length} de {pregoes.length} pregões
            </div>
          )}
          {filtrados.map((p) => (
            <PregaoCard key={p.id} p={p} selected={current?.id === p.id} alertas={alertasNovos(p.codigo_compra)}
              mensagens={Math.max(porCompra.get(p.codigo_compra)?.n ?? 0, p.mensagens ?? 0)}
              ultima={maisRecente(porCompra.get(p.codigo_compra)?.ultima ?? null, p.ultima_captura)}
              onSelect={() => setSelected(p.id)} onAbrir={() => void abrir(p.codigo_compra, true)}
              onToggleFavorita={() => toggleFavorita(p)} />
          ))}
        </div>
        <div className="card p-4 min-h-60 lg:sticky lg:top-20 self-start">
          {!current ? (
            <div className="text-sm text-muted">Selecione um pregão para ver as mensagens.</div>
          ) : (
            <ChatPainel key={current.id} pregao={current} msgs={currentMsgs} carregando={carregandoChat} />
          )}
        </div>
      </div>
    </>
  );
}
