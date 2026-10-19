import { fetchRetry } from "./mercado";

/** Itens e resultados de uma contratação (licitação) no PNCP. */

const API = "https://pncp.gov.br/api/pncp/v1";

export type ItemCompra = {
  numero: number;
  descricao: string;
  tipo: "Material" | "Serviço" | string;
  quantidade: number;
  unidade: string;
  valorUnitarioEstimado: number | null;
  valorTotalEstimado: number | null;
  situacao: string;
  criterio: string;
  beneficio: string;
  temResultado: boolean;
  vencedor?: { nome: string; ni: string; valorUnitario: number | null; quantidade: number | null; valorTotal: number | null } | null;
};

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v).trim());
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** "03155926000144-1-000102/2024" (ou com "-000001" da ata) → partes da compra. */
export function parseCompra(ctrl: string) {
  const m = ctrl.match(/^(\d{14})-\d-(\d+)\/(\d{4})(?:-(\d+))?$/);
  if (!m) return null;
  return { cnpj: m[1], seq: Number(m[2]), ano: Number(m[3]), seqAta: m[4] ? Number(m[4]) : null };
}

export function compraBase(cnpj: string, ano: number, seq: number) {
  return `${API}/orgaos/${cnpj}/compras/${ano}/${seq}`;
}

async function pool<T>(tasks: (() => Promise<T>)[], k = 6): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(k, tasks.length) }, async () => {
    while (i < tasks.length) { const j = i++; out[j] = await tasks[j](); }
  }));
  return out;
}

/**
 * Itens da contratação (até `max`) e, se pedido, o resultado (vencedor) de cada item
 * homologado — limitado a `maxResultados` consultas para não sobrecarregar o PNCP.
 */
export async function itensDaCompra(cnpj: string, ano: number, seq: number, opts: { max?: number; resultados?: boolean; maxResultados?: number } = {}) {
  const base = compraBase(cnpj, ano, seq);
  const max = opts.max ?? 500;
  const itens: ItemCompra[] = [];
  for (let pagina = 1; itens.length < max; pagina++) {
    const page = await fetchRetry<Raw[]>(`${base}/itens?pagina=${pagina}&tamanhoPagina=100`, 4, 15000);
    if (!page || page.length === 0) break;
    for (const it of page) {
      itens.push({
        numero: Number(it.numeroItem),
        descricao: s(it.descricao).replace(/\s+/g, " "),
        tipo: s(it.materialOuServicoNome),
        quantidade: Number(it.quantidade) || 0,
        unidade: s(it.unidadeMedida),
        valorUnitarioEstimado: it.orcamentoSigiloso ? null : n(it.valorUnitarioEstimado),
        valorTotalEstimado: it.orcamentoSigiloso ? null : n(it.valorTotal),
        situacao: s(it.situacaoCompraItemNome),
        criterio: s(it.criterioJulgamentoNome),
        beneficio: s(it.tipoBeneficioNome),
        temResultado: !!it.temResultado,
      });
    }
    if (page.length < 100) break;
  }

  if (opts.resultados) {
    const alvo = itens.filter((i) => i.temResultado).slice(0, opts.maxResultados ?? 60);
    await pool(alvo.map((it) => async () => {
      const r = await fetchRetry<Raw[]>(`${base}/itens/${it.numero}/resultados`, 3, 12000);
      const v = (r ?? []).find((x) => !x.dataCancelamento) ?? null;
      it.vencedor = v
        ? {
            nome: s(v.nomeRazaoSocialFornecedor),
            ni: s(v.niFornecedor),
            valorUnitario: n(v.valorUnitarioHomologado),
            quantidade: n(v.quantidadeHomologada),
            valorTotal: n(v.valorTotalHomologado),
          }
        : null;
    }));
  }
  return itens;
}

export type Arquivo = { titulo: string; tipo: string; data: string | null; url: string };

export function mapArquivos(raw: Raw[] | null): Arquivo[] {
  return (raw ?? []).map((a) => ({
    titulo: decodeURIComponent(s(a.titulo)) || "Documento",
    tipo: s(a.tipoDocumentoNome) || s(a.tipoDocumentoDescricao),
    data: s(a.dataPublicacaoPncp) || null,
    url: s(a.url) || s(a.uri),
  }));
}
