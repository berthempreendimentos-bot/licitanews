import { NextResponse } from "next/server";
import { buscarContratos, contratosDoDia } from "@/lib/mercado";

/**
 * GET /api/mercado/contratos?q=&uf=&valorMin=&valorMax=
 * Lista de contratos (até 500): com termo, os mais recentes que citam o termo;
 * sem termo, os publicados ontem.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") || "").trim();
  const uf = (sp.get("uf") || "").toUpperCase();
  const min = sp.get("valorMin") ? Number(sp.get("valorMin")) : null;
  const max = sp.get("valorMax") ? Number(sp.get("valorMax")) : null;
  try {
    let items;
    let total;
    if (q) {
      const r = await buscarContratos(q, 5);
      if (r.falhou) throw new Error("O PNCP não respondeu. Tente de novo em instantes.");
      ({ items, total } = r);
    } else {
      ({ items, total } = await contratosDoDia(new Date(Date.now() - 86400000)));
    }
    items = items.filter(
      (c) => (!uf || c.uf === uf) && (min == null || c.valor >= min) && (max == null || c.valor <= max),
    );
    return NextResponse.json({ items, totalNoPncp: total, base: q ? `contratos com "${q}"` : "contratos publicados ontem" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, items: [] }, { status: 502 });
  }
}
