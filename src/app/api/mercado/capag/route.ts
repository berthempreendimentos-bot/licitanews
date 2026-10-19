import { NextResponse } from "next/server";
import { carregarCapag } from "@/lib/capag";

export const runtime = "nodejs";
export const maxDuration = 120;

const ORDEM = ["A+", "A", "B+", "B", "C", "D", "n.d."];

/** GET /api/mercado/capag?uf=SP&q=campinas&nota=A — nota CAPAG dos municípios. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const uf = (sp.get("uf") || "").toUpperCase();
  const q = (sp.get("q") || "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const nota = sp.get("nota") || "";
  try {
    const base = await carregarCapag();
    const porUf = base.municipios.filter((m) => !uf || m.uf === uf);
    const distribuicao = ORDEM.map((n) => ({
      nota: n,
      total: porUf.filter((m) => (n === "n.d." ? !ORDEM.slice(0, -1).includes(m.capag) : m.capag === n)).length,
    }));
    const lista = porUf
      .filter((m) => !nota || (nota === "n.d." ? !ORDEM.slice(0, -1).includes(m.capag) : m.capag === nota))
      .filter((m) => !q || m.municipio.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q))
      .sort((a, b) => a.municipio.localeCompare(b.municipio, "pt-BR"));
    return NextResponse.json({
      fonte: base.fonte,
      atualizadoEm: base.atualizadoEm,
      url: base.url,
      totalMunicipios: porUf.length,
      distribuicao,
      encontrados: lista.length,
      municipios: lista.slice(0, 300),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
