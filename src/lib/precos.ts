import { fetchRetry } from "./mercado";

/**
 * Pesquisa de preços praticados em compras públicas (Compras.gov.br — Dados Abertos),
 * pelo código do item no catálogo (CATMAT para materiais, CATSER para serviços).
 */

const BASE = "https://dadosabertos.compras.gov.br";

export type PrecoRegistro = {
  id: string;
  data: string | null;
  precoUnitario: number;
  quantidade: number;
  unidade: string;
  fornecedor: string;
  fornecedorNi: string;
  marca: string;
  comprador: string;
  orgao: string;
  uf: string;
  municipio: string;
  descricao: string;
};

export type PesquisaPreco = {
  codigo: string;
  tipo: "material" | "servico";
  descricao: string;
  registros: number;
  totalNaFonte: number;
  min: number;
  max: number;
  media: number;
  mediana: number;
  porUf: { uf: string; registros: number; mediana: number }[];
  itens: PrecoRegistro[];
};

type Raw = Record<string, unknown>;
type Page = { resultado: Raw[]; totalRegistros: number; totalPaginas: number };

const s = (v: unknown) => (v == null ? "" : String(v).trim());

function mediana(v: number[]) {
  if (!v.length) return 0;
  const a = [...v].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

async function paginas(url: (p: number) => string, max: number) {
  const first = await fetchRetry<Page>(url(1), 4, 20000);
  if (!first) return null;
  const n = Math.min(max, first.totalPaginas || 1);
  const rest = await Promise.all(Array.from({ length: n - 1 }, (_, k) => fetchRetry<Page>(url(k + 2), 4, 20000)));
  return { total: first.totalRegistros ?? 0, rows: [first, ...rest].flatMap((p) => p?.resultado ?? []) };
}

export async function pesquisarPreco(codigo: string, opts: { uf?: string; meses?: number } = {}): Promise<PesquisaPreco | null> {
  const desde = new Date(Date.now() - (opts.meses ?? 12) * 30 * 86400000).toISOString().slice(0, 10);
  const filtros = (p: number) => {
    const q = new URLSearchParams({ pagina: String(p), tamanhoPagina: "500", dataCompraInicio: desde });
    if (opts.uf) q.set("estado", opts.uf);
    return q;
  };

  let tipo: PesquisaPreco["tipo"] = "material";
  let r = await paginas((p) => {
    const q = filtros(p);
    q.set("tipo", "codigoItemCatalogo");
    q.set("codigo", codigo);
    return `${BASE}/modulo-pesquisa-preco/1_consultarMaterial?${q}`;
  }, 2);
  if (!r || r.rows.length === 0) {
    tipo = "servico";
    r = await paginas((p) => {
      const q = filtros(p);
      q.set("codigoItemCatalogo", codigo);
      return `${BASE}/modulo-pesquisa-preco/3_consultarServico?${q}`;
    }, 2);
  }
  if (!r) return null;

  const itens = r.rows
    .map<PrecoRegistro>((x) => ({
      id: s(x.idCompraItem) || `${s(x.idCompra)}-${s(x.numeroItemCompra)}`,
      data: s(x.dataResultado) || s(x.dataCompra) || null,
      precoUnitario: Number(x.precoUnitario) || 0,
      quantidade: Number(x.quantidade) || 0,
      unidade: s(x.siglaUnidadeFornecimento) || s(x.siglaUnidadeMedida) || s(x.nomeUnidadeMedida),
      fornecedor: s(x.nomeFornecedor),
      fornecedorNi: s(x.niFornecedor),
      marca: s(x.marca),
      comprador: s(x.nomeUasg),
      orgao: s(x.nomeOrgao),
      uf: s(x.estado),
      municipio: s(x.municipio),
      descricao: s(x.descricaoItem),
    }))
    .filter((x) => x.precoUnitario > 0)
    .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));

  const precos = itens.map((x) => x.precoUnitario);
  const ufs = new Map<string, number[]>();
  for (const x of itens) ufs.set(x.uf, [...(ufs.get(x.uf) ?? []), x.precoUnitario]);

  return {
    codigo,
    tipo,
    descricao: itens[0]?.descricao ?? "",
    registros: itens.length,
    totalNaFonte: r.total,
    min: precos.length ? Math.min(...precos) : 0,
    max: precos.length ? Math.max(...precos) : 0,
    media: precos.length ? precos.reduce((a, b) => a + b, 0) / precos.length : 0,
    mediana: mediana(precos),
    porUf: [...ufs.entries()]
      .map(([uf, v]) => ({ uf, registros: v.length, mediana: mediana(v) }))
      .sort((a, b) => b.registros - a.registros),
    itens: itens.slice(0, 300),
  };
}
