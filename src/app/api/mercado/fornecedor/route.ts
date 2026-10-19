import { NextResponse } from "next/server";
import { buscarContratos, panorama, soDigitos } from "@/lib/mercado";

/** GET /api/mercado/fornecedor?cnpj=00000000000000 — contratos de um fornecedor (concorrente). */
export async function GET(req: Request) {
  const cnpj = soDigitos(new URL(req.url).searchParams.get("cnpj") || "");
  if (cnpj.length !== 14 && cnpj.length !== 11) {
    return NextResponse.json({ error: "Informe um CNPJ com 14 dígitos." }, { status: 400 });
  }
  try {
    const r = await buscarContratos(cnpj, 5);
    if (r.falhou) throw new Error("O PNCP não respondeu. Tente de novo em instantes.");
    // A busca é textual: mantém só os contratos em que o CNPJ é o fornecedor.
    const items = r.items.filter((c) => soDigitos(c.fornecedorNi) === cnpj);
    const nome = items[0]?.fornecedorNome ?? "";
    return NextResponse.json({ cnpj, nome, totalNoPncp: r.total, ...panorama(items) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
