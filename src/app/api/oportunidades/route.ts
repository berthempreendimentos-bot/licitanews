import { NextResponse } from "next/server";
import { fetchAbertas, matchText } from "@/lib/pncp";
import type { Opportunity } from "@/lib/types";

/**
 * GET /api/oportunidades?modalidades=6,8&uf=SP&municipio=3550308&q=termo1,termo2&pagina=1&valorMin=&valorMax=&dataInicio=&dataFim=
 * Sem termo ou datas: devolve uma página do PNCP por modalidade.
 * Com termo ou datas: varre até 6 páginas por modalidade e filtra pelos critérios.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const modalidades = (sp.get("modalidades") || "6").split(",").map(Number).filter(Boolean).slice(0, 4);
  const uf = sp.get("uf") || undefined;
  const municipio = sp.get("municipio") || undefined; // código IBGE
  const termos = (sp.get("q") || "").split(",").map((t) => t.trim()).filter(Boolean);
  const pagina = Math.max(1, Number(sp.get("pagina") || 1));
  const valorMin = sp.get("valorMin") ? Number(sp.get("valorMin")) : null;
  const valorMax = sp.get("valorMax") ? Number(sp.get("valorMax")) : null;
  const dataInicio = sp.get("dataInicio") || null; // YYYY-MM-DD
  const dataFim = sp.get("dataFim") || null;       // YYYY-MM-DD

  try {
    const precisaVarredura = termos.length > 0 || dataInicio != null || dataFim != null;
    const pages = precisaVarredura ? [1, 2, 3, 4, 5, 6] : [pagina];
    const jobs = modalidades.flatMap((m) => pages.map((p) => fetchAbertas({ modalidade: m, uf, municipio, pagina: p }).catch(() => null)));
    const results = await Promise.all(jobs);
    let total = 0;
    const seen = new Set<string>();
    let items: Opportunity[] = [];
    results.forEach((r, i) => {
      if (!r) return;
      if (i % pages.length === 0) total += r.total;
      for (const o of r.items) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        items.push(o);
      }
    });
    items = items.filter(
      (o) =>
        matchText(o, termos) &&
        (valorMin == null || (o.valor ?? 0) >= valorMin) &&
        (valorMax == null || (o.valor ?? Infinity) <= valorMax) &&
        (!dataInicio || (o.abertura && o.abertura.slice(0, 10) >= dataInicio)) &&
        (!dataFim || (o.abertura && o.abertura.slice(0, 10) <= dataFim)),
    );
    const now = Date.now();
    items = items.filter((o) => !o.encerramento || new Date(o.encerramento).getTime() >= now);
    if (dataInicio || dataFim) {
      items.sort((a, b) => (a.abertura ?? "9").localeCompare(b.abertura ?? "9"));
    } else {
      items.sort((a, b) => (a.encerramento ?? "9").localeCompare(b.encerramento ?? "9"));
    }
    return NextResponse.json({
      items,
      total,
      filtrado: termos.length > 0 || valorMin != null || valorMax != null || dataInicio != null || dataFim != null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, items: [] }, { status: 502 });
  }
}
