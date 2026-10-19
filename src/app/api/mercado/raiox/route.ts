import { NextResponse } from "next/server";
import { buscarContratos, contratosDoDia, panorama } from "@/lib/mercado";

/**
 * GET /api/mercado/raiox?q=merenda&uf=SP
 * Com termo: até 500 contratos mais recentes que citam o termo (busca do PNCP).
 * Sem termo: contratos publicados ontem (até 500).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") || "").trim();
  const uf = (sp.get("uf") || "").toUpperCase();

  try {
    let items;
    let total;
    let fonte;
    if (q) {
      const r = await buscarContratos(q, 5);
      if (r.falhou) throw new Error("O PNCP não respondeu. Tente de novo em instantes.");
      items = r.items;
      total = r.total;
      fonte = `até 500 contratos mais recentes com "${q}"`;
    } else {
      const ontem = new Date(Date.now() - 86400000);
      const r = await contratosDoDia(ontem);
      items = r.items;
      total = r.total;
      fonte = `amostra de contratos publicados em ${ontem.toLocaleDateString("pt-BR")}`;
    }
    if (uf) items = items.filter((c) => c.uf === uf);
    return NextResponse.json({ fonte, totalNoPncp: total, ...panorama(items) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
