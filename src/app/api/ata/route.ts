import { NextResponse } from "next/server";
import { fetchRetry } from "@/lib/mercado";
import { compraBase, itensDaCompra, mapArquivos, parseCompra } from "@/lib/compra";

export const maxDuration = 60;

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v).trim());
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Raw) : {});

/**
 * GET /api/ata?id=03155926000144-1-000102/2024-000001
 * Ata + arquivos + itens da licitação com o vencedor e o preço homologado de cada item.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "";
  const p = parseCompra(id);
  if (!p || p.seqAta == null) return NextResponse.json({ error: "Identificador de ata inválido." }, { status: 400 });
  const base = compraBase(p.cnpj, p.ano, p.seq);

  const [ata, arquivos, itens] = await Promise.all([
    fetchRetry<Raw>(`${base}/atas/${p.seqAta}`, 5, 10000),
    fetchRetry<Raw[]>(`${base}/atas/${p.seqAta}/arquivos`, 5, 10000),
    itensDaCompra(p.cnpj, p.ano, p.seq, { max: 300, resultados: true, maxResultados: 80 }),
  ]);
  if (!ata) return NextResponse.json({ error: "O PNCP não respondeu. Tente de novo em instantes." }, { status: 502 });

  const unidade = obj(ata.unidadeOrgao);
  return NextResponse.json({
    id,
    numero: s(ata.numeroAtaRegistroPreco),
    objeto: s(ata.objetoCompra),
    modalidade: s(ata.modalidadeNome),
    orgao: s(obj(ata.orgaoEntidade).razaoSocial),
    orgaoCnpj: p.cnpj,
    unidade: s(unidade.nomeUnidade),
    municipio: s(unidade.municipioNome),
    uf: s(unidade.ufSigla),
    assinatura: s(ata.dataAssinatura) || null,
    vigenciaInicio: s(ata.dataVigenciaInicio) || null,
    vigenciaFim: s(ata.dataVigenciaFim) || null,
    cancelado: !!ata.cancelado,
    adesao: ata.possibilidadeAdesao == null ? null : !!ata.possibilidadeAdesao,
    linkAta: `https://pncp.gov.br/app/atas/${p.cnpj}/${p.ano}/${p.seq}/${p.seqAta}`,
    linkCompra: `https://pncp.gov.br/app/editais/${p.cnpj}/${p.ano}/${p.seq}`,
    arquivos: mapArquivos(arquivos),
    itens,
  });
}
