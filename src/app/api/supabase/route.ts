import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Item = { ok: boolean; texto: string };

/**
 * GET /api/supabase — diagnóstico da configuração (sem revelar chaves):
 * variáveis de ambiente, conexão com o banco e a tabela `records`.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const itens: Item[] = [
    { ok: /^https:\/\/.+\.supabase\.co\/?$/.test(url) || /^https?:\/\//.test(url), texto: url ? `URL do projeto: ${url.replace(/^https?:\/\//, "")}` : "NEXT_PUBLIC_SUPABASE_URL não definida" },
    { ok: anon.length > 20, texto: anon ? "Chave pública (anon) definida" : "NEXT_PUBLIC_SUPABASE_ANON_KEY não definida" },
    { ok: service.length > 20, texto: service ? "Chave de serviço definida (usada pela extensão)" : "SUPABASE_SERVICE_ROLE_KEY não definida — a extensão não consegue gravar o chat" },
  ];

  const sb = serviceClient();
  if (sb) {
    // Sem "head": a consulta HEAD não traz o corpo do erro e uma tabela inexistente passaria como encontrada.
    const { error, count } = await sb.from("records").select("id", { count: "exact" }).limit(1);
    if (!error) itens.push({ ok: true, texto: `Tabela records encontrada (${count ?? 0} registros)` });
    else if (/does not exist|relation|schema cache|PGRST205/i.test(`${error.code} ${error.message}`)) itens.push({ ok: false, texto: "Tabela records não existe: rode supabase/schema.sql no SQL Editor do Supabase" });
    else if (/invalid api key|jwt/i.test(error.message)) itens.push({ ok: false, texto: "Chave de serviço inválida para este projeto" });
    else itens.push({ ok: false, texto: `Erro ao consultar o banco: ${error.message}` });
  }

  return NextResponse.json({ configurado: !!(url && anon), ok: itens.every((i) => i.ok), itens });
}
