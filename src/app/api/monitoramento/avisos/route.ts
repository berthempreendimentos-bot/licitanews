import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { alertasDaEmpresa } from "@/lib/monitor";
import type { Empresa } from "@/lib/types";

/**
 * GET /api/monitoramento/avisos?desde=<data> — alarmes do usuário dono do token (header x-ingest-key).
 * Quem captura é a extensão do administrador; os avisos dos demais usuários ficam guardados
 * (coleção "disparos") e a extensão de cada um busca aqui de tempos em tempos para tocar o alarme.
 * Resposta: { desde, disparos: [{ tipo, titulo, mensagem, codigo_compra }], alertas }
 * desde: o valor a mandar na próxima consulta. Sem `desde` (primeira vez) não devolve os antigos.
 */
export async function GET(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Supabase não configurado no servidor" }, { status: 503 });

  const key = req.headers.get("x-ingest-key") || "";
  if (key.length < 16) return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  const { data: emp } = await sb
    .from("records")
    .select("user_id, data")
    .eq("collection", "empresa")
    .eq("data->>ingest_key", key)
    .maybeSingle();
  if (!emp) return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  const userId = emp.user_id as string;
  const alertas = alertasDaEmpresa(emp.data as Empresa);

  const desde = new URL(req.url).searchParams.get("desde");
  if (!desde || isNaN(Date.parse(desde))) {
    // Primeira consulta: começa a partir de agora (folga para a diferença de relógio com o banco).
    return NextResponse.json({ desde: new Date(Date.now() - 5000).toISOString(), disparos: [], alertas });
  }

  const { data, error } = await sb
    .from("records")
    .select("data, created_at")
    .eq("user_id", userId)
    .eq("collection", "disparos")
    .gt("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Avisos com mais de 2 dias não servem mais para alarme.
  void sb.from("records").delete().eq("user_id", userId).eq("collection", "disparos")
    .lt("created_at", new Date(Date.now() - 2 * 86400000).toISOString()).then(() => {});

  const linhas = data ?? [];
  return NextResponse.json({
    desde: linhas.length ? linhas[linhas.length - 1].created_at : desde,
    disparos: linhas.map((r) => r.data),
    alertas,
  });
}
