import { NextResponse } from "next/server";
import { fetchRetry } from "@/lib/mercado";
import { parseCodigoCompra } from "@/lib/monitor";

type Raw = Record<string, unknown>;
type Lista = { resultado?: Raw[] };
const s = (v: unknown) => (v == null ? "" : String(v).trim());
const BASE = "https://dadosabertos.compras.gov.br/modulo-uasg";

/**
 * GET /api/monitoramento/uasg?codigo=<código da compra>
 * Nome do órgão, município e UF pela UASG (dados abertos do Compras.gov.br).
 */
export async function GET(req: Request) {
  const codigo = new URL(req.url).searchParams.get("codigo") || "";
  const c = parseCodigoCompra(codigo);
  if (!c) return NextResponse.json({ error: "Código da compra inválido (17 dígitos)." }, { status: 400 });
  const u = (await fetchRetry<Lista>(`${BASE}/1_consultarUasg?codigoUasg=${c.uasg}&statusUasg=true`, 3, 10000))?.resultado?.[0];
  if (!u) return NextResponse.json({ error: "UASG não encontrada ou Compras.gov.br fora do ar." }, { status: 502 });
  let orgao = s(u.nomeUasg);
  // A sigla do órgão (ex.: EBSERH) ajuda a reconhecer; vem do cadastro do órgão.
  if (u.codigoOrgao) {
    const o = (await fetchRetry<Lista>(`${BASE}/2_consultarOrgao?codigoOrgao=${u.codigoOrgao}&statusOrgao=true`, 2, 8000))?.resultado?.[0];
    const sigla = s(o?.nomeMnemonicoOrgao);
    if (/^[A-Z0-9]{2,12}$/i.test(sigla) && !orgao.toUpperCase().includes(sigla.toUpperCase())) orgao = `${orgao} - ${sigla}`;
  }
  return NextResponse.json({ ...c, orgao, municipio: s(u.nomeMunicipioIbge), uf: s(u.siglaUf) });
}
