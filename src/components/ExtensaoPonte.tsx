"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellRing, VolumeX } from "lucide-react";
import { db, useCollection, useEmpresa } from "@/lib/store";
import { normalizeRawMessage } from "@/lib/monitor";
import { ingestLocal } from "@/lib/ingestLocal";
import { detectarExtensao } from "@/lib/extensao";
import type { ChatMessage } from "@/lib/types";

type IngestReq = { type: "PEPPA_EXT_INGEST"; reqId: string; key: string; codigo_compra: string; messages: unknown[] };

/**
 * Recebe as mensagens da extensão PEPPACORP Monitor quando o servidor está em
 * modo demonstração (sem Supabase, dados no navegador). Aplica as mesmas regras
 * da rota /api/monitoramento/ingest e responde no mesmo formato.
 */
export function ExtensaoPonte() {
  const { empresa, ready: empresaReady } = useEmpresa();
  const pregoes = useCollection("pregoes");
  const msgs = useCollection("chat_messages");
  const alerts = useCollection("alerts");
  const ready = empresaReady && pregoes.ready && msgs.ready && alerts.ready;
  const state = useRef({ empresa, ready });
  state.current = { empresa, ready };

  // Detecta a extensão logo ao abrir o app (o botão "Abrir no Comprasnet" precisa saber na hora do clique).
  useEffect(() => { void detectarExtensao(); }, []);

  useEffect(() => {
    function reply(reqId: string, result: unknown) {
      window.postMessage({ type: "PEPPA_EXT_INGEST_RESULT", reqId, result }, window.location.origin);
    }
    function onMessage(ev: MessageEvent) {
      if (ev.source !== window || ev.data?.type !== "PEPPA_EXT_INGEST") return;
      const d = ev.data as IngestReq;
      const { empresa, ready } = state.current;
      if (!ready) return reply(d.reqId, { ok: false, error: "PEPPACORP ainda carregando" });
      if (!empresa.ingest_key || d.key !== empresa.ingest_key) return reply(d.reqId, { ok: false, error: "chave de ingestão inválida" });
      const codigo = String(d.codigo_compra || "");
      if (!/^\d{10,}$/.test(codigo)) return reply(d.reqId, { ok: false, error: "codigo_compra inválido" });

      const pregao = db.get("pregoes").find((p) => p.codigo_compra === codigo);
      if (!pregao) return reply(d.reqId, { ok: true, data: { ok: true, not_monitored: true, synced: 0 } });
      if (pregao.status === "Encerrado") return reply(d.reqId, { ok: true, data: { ok: true, encerrado: true, synced: 0 } });

      const raw = Array.isArray(d.messages) ? d.messages.slice(0, 50) : [];
      const parsed = raw
        .map((r) => (r && typeof r === "object" ? normalizeRawMessage(codigo, r as Record<string, unknown>) : null))
        .filter((m): m is Omit<ChatMessage, "evento"> => !!m);
      const r = ingestLocal(pregao, parsed, empresa);
      reply(d.reqId, { ok: true, data: { ok: true, synced: r.synced, mentions: r.found, disparos: r.disparos, alertas: r.alertas } });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return <FaixaAlarme />;
}

/** Faixa no topo enquanto o alarme da extensão está tocando, com o botão para silenciar. */
function FaixaAlarme() {
  const [tocando, setTocando] = useState(false);
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source === window && ev.data?.type === "PEPPA_EXT_ALARM") setTocando(!!ev.data.on);
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ type: "PEPPA_EXT_ALARM_STATUS" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  if (!tocando) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[60] flex flex-wrap items-center justify-center gap-3 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
      <BellRing size={18} className="animate-bounce" />
      <span>Alarme tocando: chegou mensagem importante no chat do pregão.</span>
      <Link href="/monitoramento" className="underline underline-offset-2">Ver mensagens</Link>
      <button className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-red-700"
        onClick={() => { setTocando(false); window.postMessage({ type: "PEPPA_EXT_SILENCE" }, window.location.origin); }}>
        <VolumeX size={14} /> Silenciar
      </button>
    </div>
  );
}
