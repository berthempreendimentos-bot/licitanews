import { NextResponse } from "next/server";
import { fetchRetry } from "@/lib/mercado";
import { codigoCompraFromLink, pncpFromLink } from "@/lib/monitor";

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v).trim());

const PORTAIS: [RegExp, string][] = [
  [/portaldecompraspublicas/i, "Portal de Compras Públicas"],
  [/licitanet/i, "Licitanet"],
  [/bll\.org|bllcompras/i, "BLL Compras"],
  [/licitacoes-e|bb\.com\.br/i, "Licitações-e (Banco do Brasil)"],
  [/bnc\.org|bnccompras/i, "BNC Compras"],
  [/compras\.gov\.br|comprasnet|serpro/i, "Compras.gov.br"],
];
function portalName(link: string) {
  if (!link) return "";
  for (const [re, nome] of PORTAIS) if (re.test(link)) return nome;
  try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/**
 * GET /api/monitoramento/resolver?link=<link do PNCP>
 * Descobre no PNCP o link do sistema de origem. Se for Comprasnet, devolve o código da compra.
 */
export async function GET(req: Request) {
  const link = new URL(req.url).searchParams.get("link") || "";
  const p = pncpFromLink(link);
  if (!p) return NextResponse.json({ error: "Informe um link de edital do PNCP." }, { status: 400 });
  const c = await fetchRetry<Raw>(`https://pncp.gov.br/api/consulta/v1/orgaos/${p.cnpj}/compras/${p.ano}/${p.seq}`, 4, 10000);
  if (!c) return NextResponse.json({ error: "Licitação não encontrada ou PNCP fora do ar. Tente de novo." }, { status: 502 });
  const origem = s(c.linkSistemaOrigem);
  const portal = portalName(origem) || s(c.usuarioNome) || "outro portal";
  const objeto = s(c.objetoCompra).replace(/\s+/g, " ");
  const codigo = origem ? codigoCompraFromLink(origem) : null;
  const comprasnet = /cnetmobile\.estaleiro\.serpro\.gov\.br|comprasnet/i.test(origem);
  if (!codigo || !comprasnet) {
    return NextResponse.json({ ok: false, portal, link_origem: origem || null, objeto,
      error: `Esta licitação é do portal “${portal}”. O monitor de chat funciona só no Comprasnet (Compras.gov.br).` });
  }
  return NextResponse.json({ ok: true, codigo_compra: codigo, link_origem: origem, objeto, numero: [s(c.numeroCompra), s(c.anoCompra)].filter(Boolean).join("/") });
}
