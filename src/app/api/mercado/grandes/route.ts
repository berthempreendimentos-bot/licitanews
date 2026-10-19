import { NextResponse } from "next/server";
import { contratosPeriodo } from "@/lib/mercado";

export const maxDuration = 60;

/**
 * GET /api/mercado/grandes?dias=3&min=5000000&uf=
 * Maiores contratos publicados nos últimos `dias` (varre até 20 páginas de 500).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const dias = Math.min(7, Math.max(1, Number(sp.get("dias") || 3)));
  const min = Number(sp.get("min") || 5_000_000);
  const uf = (sp.get("uf") || "").toUpperCase();
  const fim = new Date(Date.now() - 86400000);
  const inicio = new Date(fim.getTime() - (dias - 1) * 86400000);
  try {
    const r = await contratosPeriodo(inicio, fim, { maxPaginas: 20 });
    if (r.falhou) throw new Error("O PNCP não respondeu. Tente de novo em instantes.");
    const items = r.items
      .filter((c) => c.valor >= min && (!uf || c.uf === uf))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 200);
    return NextResponse.json({
      items,
      analisados: r.items.length,
      totalNoPeriodo: r.total,
      periodo: `${inicio.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, items: [] }, { status: 502 });
  }
}
