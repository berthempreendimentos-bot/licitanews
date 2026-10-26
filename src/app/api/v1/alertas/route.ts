import { acessoDaRequisicao, desde, limite, preflight, resposta } from "@/lib/apiDados";
import type { Alert } from "@/lib/types";

export const OPTIONS = preflight;

/**
 * GET /api/v1/alertas?codigo_compra=<código>&desde=<data>&limite=<n> — alertas gerados pelo chat
 * (menções à empresa, convocações, prazos…) do dono da chave. Ordem: mais novos primeiro.
 */
export async function GET(req: Request) {
  const acesso = await acessoDaRequisicao(req);
  if (acesso instanceof Response) return acesso;
  const { sb, userId } = acesso;
  const url = new URL(req.url);
  const codigo = url.searchParams.get("codigo_compra") || "";
  const apos = desde(url);

  let q = sb.from("records").select("data").eq("user_id", userId).eq("collection", "alerts")
    .order("created_at", { ascending: false }).limit(limite(url, 100, 500));
  if (codigo) q = q.eq("data->>ref", codigo);
  if (apos) q = q.gt("created_at", apos);
  const { data, error } = await q;
  if (error) return resposta({ error: error.message }, 500);

  const alertas = (data ?? []).map((r) => r.data as Alert);
  return resposta({ total: alertas.length, alertas });
}
