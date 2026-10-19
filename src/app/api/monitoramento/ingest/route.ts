import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { alertasDaEmpresa, classifyMessage, disparosPara, enriquecer, findMention, normalizeRawMessage, recente, watchTerms } from "@/lib/monitor";
import type { Alert, ChatMessage, Disparo, Empresa, Pregao } from "@/lib/types";

/**
 * Recebe mensagens do chat capturadas pela extensão (etapa 2).
 * Header: x-ingest-key (chave da empresa, em Configurações) — NÃO é o login do usuário.
 * Body: { codigo_compra: string, messages: object[] }  (até 50 por chamada)
 * Resposta: { synced, mentions, not_monitored?, encerrado? }
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

  const { data: pregRows } = await sb
    .from("records")
    .select("data")
    .eq("user_id", userId)
    .eq("collection", "pregoes")
    .eq("data->>codigo_compra", codigo);
  const pregao = pregRows?.[0]?.data as Pregao | undefined;
  if (!pregao) return NextResponse.json({ ok: true, not_monitored: true, synced: 0 });
  if (pregao.status === "Encerrado") return NextResponse.json({ ok: true, encerrado: true, synced: 0 });

  const msgs = raw.map((r) => normalizeRawMessage(codigo, r)).filter((m): m is Omit<ChatMessage, "evento"> => !!m);
  const ids = msgs.map((m) => m.id);
  const { data: existing } = ids.length
    ? await sb.from("records").select("id, data").eq("user_id", userId).eq("collection", "chat_messages").in("id", ids)
    : { data: [] as { id: string; data: unknown }[] };
  const known = new Map((existing ?? []).map((r) => [r.id as string, r.data as ChatMessage]));
  const fresh = msgs.filter((m) => !known.has(m.id));

  const terms = watchTerms(empresa);
  const mentions: { termo_encontrado: string; texto: string }[] = [];
  const rows: { user_id: string; collection: string; id: string; data: unknown }[] = [];
  const now = new Date().toISOString();
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
  // Sinal de vida da extensão (lista vazia): só marca como "Capturando", sem mexer na última captura.
  if (fresh.length || pregao.status !== "Capturando") {
    const updatedPregao: Pregao = {
      ...pregao,
      status: "Capturando",
      mensagens: (pregao.mensagens || 0) + fresh.length,
      ultima_captura: fresh.length ? now : pregao.ultima_captura,
    };
    rows.push({ user_id: userId, collection: "pregoes", id: pregao.id, data: updatedPregao });
  }
  if (!rows.length) return NextResponse.json({ ok: true, synced: 0, mentions, disparos, alertas: cfg });

  const { error } = await sb.from("records").upsert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, synced: fresh.length, mentions, disparos, alertas: cfg });
}
