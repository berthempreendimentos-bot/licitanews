import { NextResponse } from "next/server";
import { fetchRetry } from "@/lib/mercado";

const API = "https://pncp.gov.br/api/pncp/v1";

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v).trim());
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Raw) : {});

/** "23773012000154-1-000058/2025" → link do edital no PNCP. */
function linkCompra(ctrl: string) {
  const m = ctrl.match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
  return m ? `https://pncp.gov.br/app/editais/${m[1]}/${m[3]}/${Number(m[2])}` : null;
}

/**
 * GET /api/mercado/contrato?id=78485554000113-2-001279/2026
 * Detalhes do contrato + arquivos (contrato, aditivos, apostilamentos) + termos aditivos.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "";
  const m = id.match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
  if (!m) return NextResponse.json({ error: "Identificador de contrato inválido." }, { status: 400 });
  const [, cnpj, seqStr, ano] = m;
  const base = `${API}/orgaos/${cnpj}/contratos/${ano}/${Number(seqStr)}`;

  const [det, arquivos, termos] = await Promise.all([
    fetchRetry<Raw>(base, 5, 10000),
    fetchRetry<Raw[]>(`${base}/arquivos`, 5, 10000),
    fetchRetry<Raw[]>(`${base}/termos`, 5, 10000),
  ]);
  if (!det) return NextResponse.json({ error: "O PNCP não respondeu. Tente de novo em instantes." }, { status: 502 });

  const orgao = obj(det.orgaoEntidade);
  const unidade = obj(det.unidadeOrgao);
  const compra = s(det.numeroControlePncpCompra);

  return NextResponse.json({
    id,
    numero: s(det.numeroContratoEmpenho),
    tipo: s(obj(det.tipoContrato).nome),
    categoria: s(obj(det.categoriaProcesso).nome),
    processo: s(det.processo),
    objeto: s(det.objetoContrato),
    informacaoComplementar: s(det.informacaoComplementar),
    orgao: s(orgao.razaoSocial),
    orgaoCnpj: s(orgao.cnpj),
    unidade: s(unidade.nomeUnidade),
    municipio: s(unidade.municipioNome),
    uf: s(unidade.ufSigla),
    fornecedor: s(det.nomeRazaoSocialFornecedor),
    fornecedorNi: s(det.niFornecedor),
    subcontratado: s(det.nomeFornecedorSubContratado),
    valorInicial: n(det.valorInicial),
    valorGlobal: n(det.valorGlobal),
    valorParcela: n(det.valorParcela),
    numeroParcelas: n(det.numeroParcelas),
    valorAcumulado: n(det.valorAcumulado),
    assinatura: s(det.dataAssinatura) || null,
    vigenciaInicio: s(det.dataVigenciaInicio) || null,
    vigenciaFim: s(det.dataVigenciaFim) || null,
    publicacao: s(det.dataPublicacaoPncp) || null,
    frutoAdesao: !!det.frutoAdesao,
    linkContrato: `https://pncp.gov.br/app/contratos/${cnpj}/${ano}/${Number(seqStr)}`,
    linkCompra: compra ? linkCompra(compra) : null,
    arquivos: (arquivos ?? []).map((a) => ({
      titulo: decodeURIComponent(s(a.titulo)) || "Documento",
      tipo: s(a.tipoDocumentoNome),
      data: s(a.dataPublicacaoPncp) || null,
      url: s(a.url) || s(a.uri),
    })),
    termos: (termos ?? []).map((t) => ({
      tipo: s(t.tipoTermoContratoNome) || s(obj(t.tipoTermoContrato).nome) || "Termo",
      numero: s(t.numeroTermoContrato),
      objeto: s(t.objetoTermoContrato) || s(t.fundamentoLegal),
      assinatura: s(t.dataAssinatura) || null,
      vigenciaFim: s(t.dataVigenciaFim) || null,
      valorAcrescido: n(t.valorAcrescido),
      valorGlobal: n(t.valorGlobal),
    })),
  });
}
