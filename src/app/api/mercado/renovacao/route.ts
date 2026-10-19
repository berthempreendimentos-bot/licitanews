import { NextResponse } from "next/server";
import { buscarContratos, diasAte } from "@/lib/mercado";

/**
 * GET /api/mercado/renovacao?q=limpeza&uf=&dias=90
 * Contratos com o termo cuja vigência termina nos próximos `dias`:
 * o órgão vai precisar renovar ou abrir nova licitação.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") || "").trim();
  const uf = (sp.get("uf") || "").toUpperCase();
  const dias = Math.min(365, Math.max(7, Number(sp.get("dias") || 90)));
  if (!q) return NextResponse.json({ error: "Informe um produto ou serviço.", items: [] }, { status: 400 });
  try {
    const r = await buscarContratos(q, 5);
    if (r.falhou) throw new Error("O PNCP não respondeu. Tente de novo em instantes.");
    const items = r.items
      .map((c) => ({ ...c, diasRestantes: diasAte(c.vigenciaFim) }))
      .filter((c) => c.diasRestantes != null && c.diasRestantes >= 0 && c.diasRestantes <= dias && (!uf || c.uf === uf))
      .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0));
    return NextResponse.json({ items, analisados: r.items.length, totalNoPncp: r.total });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, items: [] }, { status: 502 });
  }
}
