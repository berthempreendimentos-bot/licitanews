import { NextResponse } from "next/server";
import { atasVencendo } from "@/lib/mercado";

export const maxDuration = 60;

/**
 * GET /api/mercado/atas?q=medicamentos&dias=60&adesao=1
 * Atas de registro de preço vencendo nos próximos `dias` (sinal de nova licitação
 * em breve; enquanto vigentes e com adesão permitida, ainda cabe "carona").
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") || "").trim();
  const dias = Math.min(180, Math.max(7, Number(sp.get("dias") || 60)));
  const soAdesao = sp.get("adesao") === "1";
  try {
    const r = await atasVencendo(dias, q, 10);
    if (r.falhou) throw new Error("O PNCP não respondeu. Tente de novo em instantes.");
    const items = soAdesao ? r.items.filter((a) => a.adesao) : r.items;
    return NextResponse.json({ items: items.slice(0, 500), encontradas: items.length, analisadas: r.analisadas });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, items: [] }, { status: 502 });
  }
}
