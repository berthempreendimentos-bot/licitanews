import { NextResponse } from "next/server";
import { buscarAtas, diasAte } from "@/lib/mercado";

/**
 * GET /api/atas?q=pneus&uf=SP&situacao=vigentes|todas
 * Atas de registro de preço (até 500 mais recentes) que citam o termo.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") || "").trim();
  const uf = (sp.get("uf") || "").toUpperCase();
  const vigentes = sp.get("situacao") !== "todas";
  if (!q) return NextResponse.json({ error: "Informe um produto, serviço ou órgão.", items: [] }, { status: 400 });
  try {
    const r = await buscarAtas(q, 5);
    if (r.falhou) throw new Error("O PNCP não respondeu. Tente de novo em instantes.");
    const items = r.items
      .map((a) => ({ ...a, diasRestantes: diasAte(a.vigenciaFim) }))
      .filter((a) => (!uf || a.uf === uf) && (!vigentes || (a.diasRestantes != null && a.diasRestantes >= 0)));
    return NextResponse.json({ items, analisadas: r.items.length, totalNoPncp: r.total });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, items: [] }, { status: 502 });
  }
}
