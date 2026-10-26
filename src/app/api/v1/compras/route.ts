import { acessoDaRequisicao, preflight, resposta } from "@/lib/apiDados";
import type { Pregao } from "@/lib/types";

export type CompraApi = {
  codigo_compra: string;
  titulo: string;
  link: string;
  status: Pregao["status"];
  orgao?: string;
  municipio?: string;
  uf?: string;
  objeto?: string;
  mensagens: number;
  ultima_captura: string | null;
  /** Só na chave de administrador: quantos usuários monitoram a compra. */
  usuarios?: number;
};

export const OPTIONS = preflight;

/**
 * GET /api/v1/compras?status=Capturando — compras em monitoramento no Comprasnet.
 * Administrador: todas as compras de todos os usuários (uma por código). Demais: as próprias.
 * Ordem: capturadas mais recentemente primeiro.
 */
export async function GET(req: Request) {
  const acesso = await acessoDaRequisicao(req);
  if (acesso instanceof Response) return acesso;
  const { sb, userId, admin } = acesso;
  const status = new URL(req.url).searchParams.get("status");

  let q = sb.from("records").select("user_id, data").eq("collection", "pregoes").limit(10000);
  if (!admin) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) return resposta({ error: error.message }, 500);

  const porCodigo = new Map<string, CompraApi & { donos: Set<string> }>();
  for (const r of data ?? []) {
    const p = r.data as Pregao;
    if (!p?.codigo_compra) continue;
    const atual = porCodigo.get(p.codigo_compra);
    if (!atual) {
      porCodigo.set(p.codigo_compra, {
        codigo_compra: p.codigo_compra, titulo: p.titulo, link: p.link, status: p.status,
        orgao: p.orgao, municipio: p.municipio, uf: p.uf, objeto: p.objeto,
        mensagens: p.mensagens || 0, ultima_captura: p.ultima_captura, donos: new Set(),
      });
    } else {
      // Entre usuários, vale a captura mais nova e o maior histórico; "Encerrado" só se todos encerraram.
      if (p.ultima_captura && (!atual.ultima_captura || p.ultima_captura > atual.ultima_captura)) atual.ultima_captura = p.ultima_captura;
      atual.mensagens = Math.max(atual.mensagens, p.mensagens || 0);
      if (atual.status === "Encerrado" && p.status !== "Encerrado") atual.status = p.status;
    }
    porCodigo.get(p.codigo_compra)!.donos.add(r.user_id as string);
  }

  const compras: CompraApi[] = [...porCodigo.values()]
    .map(({ donos, ...c }) => (admin ? { ...c, usuarios: donos.size } : c))
    .filter((c) => !status || c.status === status)
    .sort((a, b) => (b.ultima_captura ?? "").localeCompare(a.ultima_captura ?? ""));
  return resposta({ total: compras.length, compras });
}
