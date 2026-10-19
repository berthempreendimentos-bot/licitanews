"use client";

import { db } from "./store";
import { alertasDaEmpresa, classifyMessage, disparosPara, enriquecer, findMention, recente, watchTerms } from "./monitor";
import { nowIso } from "./format";
import type { Alert, ChatMessage, Disparo, Empresa, Pregao } from "./types";

/**
 * Processa mensagens no próprio navegador com as mesmas regras da rota
 * /api/monitoramento/ingest (classificação de evento + menção a termos vigiados).
 * Usado pela ponte da extensão (modo demonstração) e na busca retroativa de palavras-chave.
 * Mensagens já salvas que voltam com mais dados (remetente/item) são completadas, sem novo alerta.
 */
export function ingestLocal(pregao: Pregao, msgs: Omit<ChatMessage, "evento">[], empresa: Empresa) {
  const known = new Map(db.get("chat_messages").map((m) => [m.id, m]));
  const fresh = msgs.filter((m) => !known.has(m.id));
  const completadas = msgs
    .map((m) => (known.has(m.id) ? enriquecer(known.get(m.id)!, m) : null))
    .filter((m): m is ChatMessage => !!m);
  if (completadas.length) db.upsertMany("chat_messages", completadas);
  const terms = watchTerms(empresa);
  const chats: ChatMessage[] = [];
  const alerts: Alert[] = [];
  const found: { termo_encontrado: string; texto: string }[] = [];
  const cfg = alertasDaEmpresa(empresa);
  const disparos: Disparo[] = [];
  for (const m of fresh) {
    const ev = classifyMessage(m.texto);
    chats.push({ ...m, evento: ev?.evento ?? null });
    const termo = findMention(m.texto, terms);
    if (termo) found.push({ termo_encontrado: termo, texto: m.texto.slice(0, 160) });
    const d = recente(m.data_hora) ? disparosPara(cfg, m, termo, ev?.evento ?? null) : null;
    if (d) disparos.push(d);
    if (termo || ev) {
      alerts.push({
        id: `alert:${m.id}`,
        tipo: termo ? "Menção" : ev!.evento,
        titulo: termo ? `🚨 Menção a "${termo}" no pregão ${pregao.codigo_compra}` : `${ev!.evento} — pregão ${pregao.codigo_compra}`,
        mensagem: m.texto.slice(0, 300),
        prioridade: termo ? "Alta" : ev!.prioridade,
        lido: false,
        ref: pregao.codigo_compra,
        created_at: nowIso(),
      });
    }
  }
  db.upsertMany("chat_messages", chats);
  db.upsertMany("alerts", alerts);
  const latest = db.get("pregoes").find((p) => p.id === pregao.id) ?? pregao;
  // Sinal de vida da extensão sem mensagens novas: só marca como "Capturando".
  if (fresh.length || latest.status !== "Capturando") {
    db.update("pregoes", pregao.id, {
      status: "Capturando",
      mensagens: (latest.mensagens || 0) + fresh.length,
      ...(fresh.length ? { ultima_captura: nowIso() } : {}),
    });
  }
  return { synced: fresh.length, mentions: found.length, found, disparos, alertas: cfg };
}

/** Busca retroativa: aplica um termo novo às mensagens já capturadas. */
export function retroSearch(term: string) {
  const alerts: Alert[] = [];
  for (const m of db.get("chat_messages")) {
    if (!findMention(m.texto, [term])) continue;
    alerts.push({
      id: `alert:${m.id}:${term.toLowerCase()}`,
      tipo: "Menção",
      titulo: `🚨 Menção a "${term}" no pregão ${m.codigo_compra} (busca retroativa)`,
      mensagem: m.texto.slice(0, 300),
      prioridade: "Alta",
      lido: false,
      ref: m.codigo_compra,
      created_at: nowIso(),
    });
  }
  db.upsertMany("alerts", alerts);
  return alerts.length;
}
