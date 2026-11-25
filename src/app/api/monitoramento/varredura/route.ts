import { NextResponse } from "next/server";

import { serviceClient } from "@/lib/supabase";
import { alertaCorrespondeConfig, alertasDaEmpresa, classifyMessage, findMention, watchTerms } from "@/lib/monitor";
import type { Alert, ChatMessage, Empresa } from "@/lib/types";

/**
 * POST/GET /api/monitoramento/varredura — varredura atualizada dos alertas não lidos.
 * Analisa as mensagens monitoradas (collection "chat_messages") do usuário dono da chave
 * (header x-ingest-key) contra as palavras-chave vigiadas (palavras_chave + CNPJ + razão social)
 * e os eventos selecionados, e cria/atualiza alertas não lidos para as que ainda não têm alerta.
 */
export async function POST(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Supabase não configurado no servidor" }, { status: 503 });

  const key = req.headers.get("x-ingest-key") || "";
  if (key.length < 16) return NextResponse.json({ error: "chave inválida" }, { status: 401 });

  const { data: emps, error: empErr } = await sb
    .from("records")
    .select("user_id, data")
    .eq("collection", "empresa")
    .eq("data->>ingest_key", key.trim());
  if (empErr || !emps || !emps.length) return NextResponse.json({ error: "chave inválida" }, { status: 401 });

  let totalAlertas = 0;
  let totalMensagens = 0;
  const resultados: { user_id: string; novos: number; mensagens: number }[] = [];

  for (const empRow of emps) {
    const userId = empRow.user_id as string;
    const empresa = empRow.data as Empresa;
    const terms = watchTerms(empresa);
    const cfg = alertasDaEmpresa(empresa);

    // Carrega todas as mensagens monitoradas do usuário.
    const { data: msgRows, error: msgErr } = await sb
      .from("records")
      .select("data")
      .eq("user_id", userId)
      .eq("collection", "chat_messages");
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

    const msgs = (msgRows ?? []).map((r) => r.data as ChatMessage);
    totalMensagens += msgs.length;

    // Alertas já existentes (para não duplicar).
    const { data: alertRows } = await sb
      .from("records")
      .select("id")
      .eq("user_id", userId)
      .eq("collection", "alerts");
    const existentes = new Set((alertRows ?? []).map((r) => r.id as string));

    const now = new Date().toISOString();
    const rows: { user_id: string; collection: string; id: string; data: unknown }[] = [];
    let novos = 0;

    for (const m of msgs) {
      const ev = classifyMessage(m.texto);
      const termo = findMention(m.texto, terms);
      if (!termo && !ev) continue;

      const tipoAlerta = termo ? "Menção" : ev!.evento;
      if (!alertaCorrespondeConfig(tipoAlerta, cfg.eventos)) continue;

      const alertId = `alert:${m.id}`;
      if (existentes.has(alertId)) continue;

      const alert: Alert = {
        id: alertId,
        tipo: tipoAlerta,
        titulo: termo
          ? `🚨 Menção a "${termo}" no pregão ${m.codigo_compra}`
          : `${ev!.evento} — pregão ${m.codigo_compra}`,
        mensagem: m.texto.slice(0, 300),
        prioridade: termo ? "Alta" : ev!.prioridade,
        lido: false,
        ref: m.codigo_compra,
        created_at: now,
      };
      rows.push({ user_id: userId, collection: "alerts", id: alert.id, data: alert });
      existentes.add(alert.id);
      novos++;
    }

    if (rows.length) {
      const { error } = await sb.from("records").upsert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    totalAlertas += novos;
    resultados.push({ user_id: userId, novos, mensagens: msgs.length });
  }

  return NextResponse.json({ ok: true, total_alertas: totalAlertas, total_mensagens: totalMensagens, resultados });
}

export async function GET(req: Request) {
  return POST(req);
}
