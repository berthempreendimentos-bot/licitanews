import { NextResponse } from "next/server";
import { fetchRetry } from "@/lib/mercado";
import { itensDaCompra } from "@/lib/compra";

export const maxDuration = 60;

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v).trim());
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Raw) : {});

/** Aceita o link do edital no PNCP ou o nº de controle "{cnpj}-1-{seq}/{ano}". */
function parse(v: string) {
  const link = v.match(/editais\/(\d{14})\/(\d{4})\/(\d+)/);
  if (link) return { cnpj: link[1], ano: Number(link[2]), seq: Number(link[3]) };
  const ctrl = v.trim().match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
  if (ctrl) return { cnpj: ctrl[1], ano: Number(ctrl[3]), seq: Number(ctrl[2]) };
  return null;
}

/** GET /api/compra?id=<link ou nº de controle> — dados da licitação e seus itens (para montar proposta). */
export async function GET(req: Request) {
  const p = parse(new URL(req.url).searchParams.get("id") || "");
  if (!p) return NextResponse.json({ error: "Informe o link da licitação no PNCP." }, { status: 400 });
  // O detalhe da compra mudou para a API de consulta (a API antiga responde 301).
  const [c, itens] = await Promise.all([fetchRetry<Raw>(`https://pncp.gov.br/api/consulta/v1/orgaos/${p.cnpj}/compras/${p.ano}/${p.seq}`, 5, 10000), itensDaCompra(p.cnpj, p.ano, p.seq, { max: 1000 })]);
  if (!c) return NextResponse.json({ error: "Licitação não encontrada ou PNCP fora do ar. Tente de novo." }, { status: 502 });
  const unidade = obj(c.unidadeOrgao);
  return NextResponse.json({
    pncpId: s(c.numeroControlePNCP) || `${p.cnpj}-1-${String(p.seq).padStart(6, "0")}/${p.ano}`,
    objeto: s(c.objetoCompra).replace(/\s+/g, " "),
    orgao: s(obj(c.orgaoEntidade).razaoSocial),
    orgaoCnpj: p.cnpj,
    unidade: s(unidade.nomeUnidade),
    municipio: s(unidade.municipioNome),
    uf: s(unidade.ufSigla),
    numero: [s(c.numeroCompra), s(c.anoCompra)].filter(Boolean).join("/"),
    processo: s(c.processo),
    modalidade: s(c.modalidadeNome),
    abertura: s(c.dataAberturaProposta) || null,
    encerramento: s(c.dataEncerramentoProposta) || null,
    link: `https://pncp.gov.br/app/editais/${p.cnpj}/${p.ano}/${p.seq}`,
    itens,
  });
}
