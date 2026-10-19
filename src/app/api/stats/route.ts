import { NextResponse } from "next/server";
import { fetchAbertas, fetchPublicadasNoDia } from "@/lib/pncp";

export const revalidate = 3600;

/** Números do mercado para o Dashboard: abertas agora, publicadas por dia (14 dias). */
export async function GET() {
  const mods = [6, 8, 4];
  const dias = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d;
  });
  try {
    const [abertas, serie] = await Promise.all([
      Promise.all(mods.map((m) => fetchAbertas({ modalidade: m, tamanho: 10 }).then((r) => r.total).catch(() => 0))),
      Promise.all(
        dias.map(async (d) => {
          const counts = await Promise.all(mods.map((m) => fetchPublicadasNoDia(d, m).catch(() => 0)));
          return { dia: d.toISOString().slice(0, 10), total: counts.reduce((a, b) => a + b, 0) };
        }),
      ),
    ]);
    return NextResponse.json({
      abertas: abertas.reduce((a, b) => a + b, 0),
      novasHoje: serie[serie.length - 1]?.total ?? 0,
      serie,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
