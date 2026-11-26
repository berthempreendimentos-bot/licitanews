import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";

/**
 * GET /api/monitoramento/check?codigo_compra=XXXXX
 *
 * Verificação leve: devolve apenas o ID e timestamp da última mensagem
 * conhecida para a compra, sem trazer nenhum conteúdo do chat.
 *
 * Uso: a extensão chama este endpoint ANTES de abrir o browser.
 * Se a última mensagem local da extensão já é a mais recente, não abre
 * a página nem faz scraping — pula direto para a próxima licitação.
 *
 * Se a extensão enviar ?since=<id_mensagem>, também devolve se há
 * mensagens mais novas que o `since`.
 *
 * Auth: x-ingest-key (chave da empresa).
 */
export async function GET(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Supabase não configurado no servidor" }, { status: 503 });

  const key = req.headers.get("x-ingest-key") || "";
  if (key.length < 16) return NextResponse.json({ error: "chave inválida" }, { status: 401 });

  const url = new URL(req.url);
  const codigo = String(url.searchParams.get("codigo_compra") || "");
  if (!/^\d{10,}$/.test(codigo)) return NextResponse.json({ error: "codigo_compra inválido" }, { status: 400 });
  const since = url.searchParams.get("since") || null;

  // Verifica que a chave pertence a pelo menos um usuário que monitora esta compra
  const { data: emps, error: empErr } = await sb
    .from("records")
    .select("user_id")
    .eq("collection", "empresa")
    .eq("data->>ingest_key", key.trim());
  if (empErr || !emps || !emps.length) return NextResponse.json({ error: "chave inválida" }, { status: 401 });

  const userIds = emps.map((e) => e.user_id as string);
  const { data: pregRows } = await sb
    .from("records")
    .select("user_id")
    .eq("collection", "pregoes")
    .eq("data->>codigo_compra", codigo)
    .in("user_id", userIds)
    .limit(1);

  if (!pregRows || !pregRows.length) {
    return NextResponse.json({ monitored: false, has_new: false, last_message_id: null, last_message_time: null });
  }

  // Busca a mensagem mais recente (qualquer usuário que monitora)
  const { data: msgRows } = await sb
    .from("records")
    .select("data")
    .eq("collection", "chat_messages")
    .eq("data->>codigo_compra", codigo)
    .order("data->>created_at", { ascending: false })
    .limit(1);

  const lastMsg = msgRows?.[0]?.data as { id?: string; created_at?: string } | undefined;

  if (!lastMsg?.id) {
    return NextResponse.json({ monitored: true, has_new: true, last_message_id: null, last_message_time: null });
  }

  const hasNew = !since || lastMsg.id !== since;

  console.log(`[ingest-check] compra=${codigo} since=${since ?? "(nenhum)"} lastMsgId=${lastMsg.id} lastMsgTime=${lastMsg.created_at} has_new=${hasNew}`);

  return NextResponse.json({
    monitored: true,
    has_new: hasNew,
    last_message_id: lastMsg.id,
    last_message_time: lastMsg.created_at ?? null,
  });
}
