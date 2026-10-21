import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase";
import { ehAdmin } from "@/lib/adminServidor";
import { alertasDaEmpresa, classifyMessage, disparosPara, enriquecer, findMention, normalizeRawMessage, recente, watchTerms } from "@/lib/monitor";
import type { Alert, AlertasChat, ChatMessage, Disparo, Empresa, Pregao } from "@/lib/types";

type Linha = { user_id: string; collection: string; id: string; data: unknown };
type Mencao = { termo_encontrado: string; texto: string };

/** Usuário sem dados da empresa: só os eventos do chat geram alerta (sem termos vigiados). */
const EMPRESA_VAZIA = { cnpj: "", razao_social: "", palavras_chave: [] as string[] };

/**
 * Recebe mensagens do chat capturadas pela extensão (etapa 2).
 * Header: x-ingest-key (chave da empresa, em Configurações) — NÃO é o login do usuário.
 * Body: { codigo_compra: string, messages: object[] }  (até 50 por chamada)
 * Resposta: { synced, mentions, mensagens, not_monitored?, encerrado? }
 * mensagens: quantas o PEPPACORP já tem da compra (a extensão decide se faz a verificação rápida).
 * Só a chave de um administrador captura, e a captura vale para todos os usuários que monitoram a compra.
 * Chave de outro usuário: { somente_admin: true } (a extensão dele não grava nada).
 */
export async function POST(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Supabase não configurado no servidor" }, { status: 503 });

  const key = req.headers.get("x-ingest-key") || "";
  if (key.length < 16) return NextResponse.json({ error: "chave inválida" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { codigo_compra?: string; messages?: Record<string, unknown>[] } | null;
  const codigo = String(body?.codigo_compra || "");
  if (!/^\d{10,}$/.test(codigo)) return NextResponse.json({ error: "codigo_compra inválido" }, { status: 400 });
  const raw = Array.isArray(body?.messages) ? body!.messages.slice(0, 50) : [];

  const { data: emp } = await sb
    .from("records")
    .select("user_id, data")
    .eq("collection", "empresa")
    .eq("data->>ingest_key", key)
    .maybeSingle();
  if (!emp) return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  const userId = emp.user_id as string;
  const empresa = emp.data as Empresa;

  // Só a extensão do administrador captura (e grava para todos os usuários que monitoram a compra).
  if (!(await ehAdmin(sb, userId))) return NextResponse.json({ ok: true, somente_admin: true, synced: 0 });
  const { data: pregRows } = await sb.from("records").select("user_id, data").eq("collection", "pregoes").eq("data->>codigo_compra", codigo);
  // Um pregão por usuário (o primeiro, como antes).
  const porUsuario = new Map<string, Pregao>();
  for (const r of pregRows ?? []) if (!porUsuario.has(r.user_id as string)) porUsuario.set(r.user_id as string, r.data as Pregao);
  if (!porUsuario.size) return NextResponse.json({ ok: true, not_monitored: true, synced: 0 });
  const ativos = [...porUsuario].filter(([, p]) => p.status !== "Encerrado");
  if (!ativos.length) return NextResponse.json({ ok: true, encerrado: true, synced: 0 });

  // Empresa de cada usuário (termos vigiados e configuração dos alertas).
  const empresas = new Map<string, Empresa>([[userId, empresa]]);
  const outros = ativos.map(([u]) => u).filter((u) => u !== userId);
  if (outros.length) {
    const { data } = await sb.from("records").select("user_id, data").eq("collection", "empresa").in("user_id", outros);
    for (const r of data ?? []) empresas.set(r.user_id as string, r.data as Empresa);
  }

  const msgs = raw.map((r) => normalizeRawMessage(codigo, r)).filter((m): m is Omit<ChatMessage, "evento"> => !!m);
  const now = new Date().toISOString();
  const rows: Linha[] = [];
  let resposta: { synced: number; mentions: Mencao[]; disparos: Disparo[]; alertas: AlertasChat } = {
    synced: 0, mentions: [], disparos: [], alertas: alertasDaEmpresa(empresa),
  };
  let maiorSynced = 0;
  for (const [uid, pregao] of ativos) {
    const { rows: linhas, ...r } = await processar(sb, uid, empresas.get(uid) ?? EMPRESA_VAZIA, pregao, codigo, msgs, now);
    rows.push(...linhas);
    maiorSynced = Math.max(maiorSynced, r.synced);
    // Alarme de quem enviou vai na resposta. Os dos outros usuários ficam guardados e a extensão
    // de cada um busca em /api/monitoramento/avisos (o administrador não toca alarme pelos outros).
    if (uid === userId) resposta = r;
    else {
      r.disparos.forEach((d, i) => rows.push({
        user_id: uid, collection: "disparos", id: `disparo:${codigo}:${Date.now()}:${i}`, data: { ...d, codigo_compra: codigo },
      }));
    }
  }
  if (!porUsuario.has(userId) || porUsuario.get(userId)!.status === "Encerrado") resposta.synced = maiorSynced;
  // O menor entre os usuários: quem acabou de cadastrar a compra ainda precisa do histórico inteiro.
  const mensagens = Math.min(...ativos.map(([, p]) => p.mensagens || 0));

  if (rows.length) {
    const { error } = await sb.from("records").upsert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...resposta, mensagens });
}

/** Mensagens novas, alertas e situação do pregão de um usuário. */
async function processar(
  sb: SupabaseClient,
  userId: string,
  empresa: { cnpj: string; razao_social: string; palavras_chave: string[]; alertas_chat?: AlertasChat },
  pregao: Pregao,
  codigo: string,
  msgs: Omit<ChatMessage, "evento">[],
  now: string,
) {
  const ids = msgs.map((m) => m.id);
  const { data: existing } = ids.length
    ? await sb.from("records").select("id, data").eq("user_id", userId).eq("collection", "chat_messages").in("id", ids)
    : { data: [] as { id: string; data: unknown }[] };
  const known = new Map((existing ?? []).map((r) => [r.id as string, r.data as ChatMessage]));
  const fresh = msgs.filter((m) => !known.has(m.id));

  const terms = watchTerms(empresa);
  const mentions: Mencao[] = [];
  const rows: Linha[] = [];
  // Mensagens já salvas que voltaram com remetente/item: completa sem gerar alerta de novo.
  for (const m of msgs) {
    const old = known.get(m.id);
    const upd = old ? enriquecer(old, m) : null;
    if (upd) rows.push({ user_id: userId, collection: "chat_messages", id: upd.id, data: upd });
  }

  const cfg = alertasDaEmpresa(empresa);
  const disparos: Disparo[] = [];
  for (const m of fresh) {
    const ev = classifyMessage(m.texto);
    const full: ChatMessage = { ...m, evento: ev?.evento ?? null };
    rows.push({ user_id: userId, collection: "chat_messages", id: full.id, data: full });
    const termo = findMention(m.texto, terms);
    if (termo) mentions.push({ termo_encontrado: termo, texto: m.texto.slice(0, 160) });
    const disparo = recente(m.data_hora) ? disparosPara(cfg, m, termo, ev?.evento ?? null) : null;
    if (disparo) disparos.push(disparo);
    if (termo || ev) {
      const alert: Alert = {
        id: `alert:${full.id}`,
        tipo: termo ? "Menção" : ev!.evento,
        titulo: termo ? `🚨 Menção a "${termo}" no pregão ${codigo}` : `${ev!.evento} — pregão ${codigo}`,
        mensagem: m.texto.slice(0, 300),
        prioridade: termo ? "Alta" : ev!.prioridade,
        lido: false,
        ref: codigo,
        created_at: now,
      };
      rows.push({ user_id: userId, collection: "alerts", id: alert.id, data: alert });
    }
  }
  // Mensagens lidas do portal (mesmo sem novidade) atualizam a última captura.
  // Sinal de vida da extensão (lista vazia): só marca como "Capturando", sem mexer na última captura.
  if (msgs.length || pregao.status !== "Capturando") {
    const updatedPregao: Pregao = {
      ...pregao,
      status: "Capturando",
      mensagens: (pregao.mensagens || 0) + fresh.length,
      ultima_captura: msgs.length ? now : pregao.ultima_captura,
    };
    rows.push({ user_id: userId, collection: "pregoes", id: pregao.id, data: updatedPregao });
  }
  return { rows, synced: fresh.length, mentions, disparos, alertas: cfg };
}
