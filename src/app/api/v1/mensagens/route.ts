import { acessoDaRequisicao, desde, limite, preflight, resposta } from "@/lib/apiDados";
import type { ChatMessage } from "@/lib/types";

export const OPTIONS = preflight;

/**
 * GET /api/v1/mensagens?codigo_compra=<código>&desde=<data>&cursor=<cursor>&limite=<n> — chat do pregoeiro capturado no Comprasnet.
 * codigo_compra: opcional (sem ele, as mensagens de todas as compras visíveis à chave).
 * desde: só mensagens gravadas depois desta data.
 * cursor: o `proximo_cursor` da resposta anterior, para continuar de onde parou (tem precedência sobre `desde`).
 * limite: 1–500 (padrão 200). Ordem: gravação mais antiga primeiro.
 * Administrador lê de todos os usuários; a mesma mensagem aparece uma vez só.
 */
export async function GET(req: Request) {
  const acesso = await acessoDaRequisicao(req);
  if (acesso instanceof Response) return acesso;
  const { sb, userId, admin } = acesso;
  const url = new URL(req.url);
  const codigo = url.searchParams.get("codigo_compra") || "";
  if (codigo && !/^\d{10,}$/.test(codigo)) return resposta({ error: "codigo_compra inválido" }, 400);
  const max = limite(url, 200, 500);

  // Cursor = data de gravação + id: as mensagens de um mesmo envio da extensão têm a mesma data.
  const cursor = lerCursor(url.searchParams.get("cursor"));
  if (url.searchParams.get("cursor") && !cursor) return resposta({ error: "cursor inválido" }, 400);
  const apos = desde(url);

  // O administrador vê cada mensagem repetida por usuário: busca a mais e tira as repetidas.
  let q = sb.from("records").select("id, data, created_at").eq("collection", "chat_messages")
    .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(admin ? max * 5 : max);
  if (!admin) q = q.eq("user_id", userId);
  if (codigo) q = q.eq("data->>codigo_compra", codigo);
  if (cursor) q = q.or(`created_at.gt."${cursor.t}",and(created_at.eq."${cursor.t}",id.gt."${cursor.id}")`);
  else if (apos) q = q.gt("created_at", apos);
  const { data, error } = await q;
  if (error) return resposta({ error: error.message }, 500);

  const vistas = new Set<string>();
  const mensagens: (ChatMessage & { gravada_em: string })[] = [];
  let ultima: { t: string; id: string } | null = cursor;
  for (const r of data ?? []) {
    if (mensagens.length >= max) break;
    ultima = { t: r.created_at as string, id: r.id as string };
    const m = r.data as ChatMessage;
    if (vistas.has(m.id)) continue;
    vistas.add(m.id);
    const { raw: _raw, ...limpa } = m;
    void _raw;
    mensagens.push({ ...limpa, gravada_em: r.created_at as string });
  }
  return resposta({
    total: mensagens.length,
    proximo_cursor: ultima ? Buffer.from(JSON.stringify(ultima)).toString("base64url") : null,
    mensagens,
  });
}

function lerCursor(c: string | null): { t: string; id: string } | null {
  if (!c) return null;
  try {
    const v = JSON.parse(Buffer.from(c, "base64url").toString()) as { t?: unknown; id?: unknown };
    // Os valores vão entre aspas no filtro do PostgREST: aspas e barra invertida não podem aparecer.
    if (typeof v.t !== "string" || isNaN(Date.parse(v.t)) || /["\\]/.test(v.t)) return null;
    if (typeof v.id !== "string" || !v.id || /["\\]/.test(v.id)) return null;
    return { t: v.t, id: v.id };
  } catch {
    return null;
  }
}
