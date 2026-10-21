import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { adminDaRequisicao } from "@/lib/adminServidor";
import type { Pregao } from "@/lib/types";

export type CompraAdmin = {
  codigo_compra: string;
  titulo: string;
  orgao?: string;
  municipio?: string;
  uf?: string;
  usuarios: number;
  ultima_captura: string | null;
};

/**
 * GET /api/admin/monitoramento — só administradores (Authorization: Bearer <token do Supabase>).
 * Todas as compras em monitoramento de todos os usuários, uma por código, as mais desatualizadas primeiro.
 */
export async function GET(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Supabase não configurado no servidor" }, { status: 503 });
  if (!(await adminDaRequisicao(sb, req))) return NextResponse.json({ error: "acesso só para administradores" }, { status: 403 });

  const { data, error } = await sb.from("records").select("user_id, data").eq("collection", "pregoes").limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const porCodigo = new Map<string, CompraAdmin & { donos: Set<string> }>();
  for (const r of data ?? []) {
    const p = r.data as Pregao;
    if (!p?.codigo_compra || p.status === "Encerrado") continue;
    const atual = porCodigo.get(p.codigo_compra);
    if (!atual) {
      porCodigo.set(p.codigo_compra, {
        codigo_compra: p.codigo_compra, titulo: p.titulo, orgao: p.orgao, municipio: p.municipio, uf: p.uf,
        usuarios: 0, ultima_captura: p.ultima_captura, donos: new Set(),
      });
    } else if (p.ultima_captura && (!atual.ultima_captura || p.ultima_captura > atual.ultima_captura)) {
      atual.ultima_captura = p.ultima_captura;
    }
    porCodigo.get(p.codigo_compra)!.donos.add(r.user_id as string);
  }

  const compras: CompraAdmin[] = [...porCodigo.values()]
    .map(({ donos, ...c }) => ({ ...c, usuarios: donos.size }))
    .sort((a, b) => (a.ultima_captura ?? "").localeCompare(b.ultima_captura ?? ""));
  return NextResponse.json({ compras });
}
