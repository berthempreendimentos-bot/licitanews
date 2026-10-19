import { NextResponse } from "next/server";
import { pesquisarPreco } from "@/lib/precos";

export const maxDuration = 60;

/** GET /api/mercado/precos?codigo=461944&uf=PE&meses=12 — preços praticados por código CATMAT/CATSER. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const codigo = (sp.get("codigo") || "").replace(/\D/g, "");
  const uf = (sp.get("uf") || "").toUpperCase() || undefined;
  const meses = Math.min(36, Math.max(1, Number(sp.get("meses") || 12)));
  if (!codigo) return NextResponse.json({ error: "Informe o código CATMAT ou CATSER do item." }, { status: 400 });
  try {
    const r = await pesquisarPreco(codigo, { uf, meses });
    if (!r) throw new Error("O Compras.gov.br não respondeu. Tente de novo em instantes.");
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
