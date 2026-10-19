import type { Opportunity } from "./types";

/** API pública de consulta do PNCP (Portal Nacional de Contratações Públicas). */
const BASE = "https://pncp.gov.br/api/consulta/v1";

export const MODALIDADES: { id: number; nome: string }[] = [
  { id: 6, nome: "Pregão - Eletrônico" },
  { id: 8, nome: "Dispensa" },
  { id: 4, nome: "Concorrência - Eletrônica" },
  { id: 7, nome: "Pregão - Presencial" },
  { id: 5, nome: "Concorrência - Presencial" },
  { id: 9, nome: "Inexigibilidade" },
  { id: 12, nome: "Credenciamento" },
];

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

type PncpCompra = {
  numeroControlePNCP: string;
  objetoCompra: string;
  orgaoEntidade: { cnpj: string; razaoSocial: string };
  unidadeOrgao: { ufSigla: string; municipioNome: string };
  modalidadeId: number;
  modalidadeNome: string;
  valorTotalEstimado: number | null;
  dataAberturaProposta: string | null;
  dataEncerramentoProposta: string | null;
  situacaoCompraNome: string;
  srp: boolean;
  anoCompra: number;
  sequencialCompra: number;
};

type PncpPage = { data: PncpCompra[]; totalRegistros: number; totalPaginas: number; numeroPagina: number };

export function toOpportunity(c: PncpCompra): Opportunity {
  return {
    id: c.numeroControlePNCP,
    titulo: (c.objetoCompra || "").replace(/\s+/g, " ").trim(),
    orgao: c.orgaoEntidade?.razaoSocial ?? "",
    uf: c.unidadeOrgao?.ufSigla ?? "",
    municipio: c.unidadeOrgao?.municipioNome ?? "",
    modalidade: c.modalidadeNome,
    modalidadeId: c.modalidadeId,
    valor: c.valorTotalEstimado ?? null,
    abertura: c.dataAberturaProposta,
    encerramento: c.dataEncerramentoProposta,
    situacao: c.situacaoCompraNome,
    srp: !!c.srp,
    link: `https://pncp.gov.br/app/editais/${c.orgaoEntidade?.cnpj}/${c.anoCompra}/${c.sequencialCompra}`,
  };
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Licitações com propostas abertas (encerramento a partir de hoje), por modalidade.
 * O PNCP exige modalidade e não tem busca textual — o filtro por termo é aplicado aqui.
 */
export async function fetchAbertas(opts: { modalidade: number; uf?: string; cnpj?: string; pagina?: number; tamanho?: number }) {
  const dataFinal = new Date(Date.now() + 90 * 86400000);
  const params = new URLSearchParams({
    dataFinal: ymd(dataFinal),
    codigoModalidadeContratacao: String(opts.modalidade),
    pagina: String(opts.pagina ?? 1),
    tamanhoPagina: String(opts.tamanho ?? 50),
  });
  if (opts.uf) params.set("uf", opts.uf);
  if (opts.cnpj) params.set("cnpj", opts.cnpj);
  const res = await fetch(`${BASE}/contratacoes/proposta?${params}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 204) return { items: [] as Opportunity[], total: 0, paginas: 0 };
  if (!res.ok) throw new Error(`PNCP respondeu HTTP ${res.status}`);
  const page = (await res.json()) as PncpPage;
  return { items: (page.data ?? []).map(toOpportunity), total: page.totalRegistros ?? 0, paginas: page.totalPaginas ?? 0 };
}

/** Publicadas em um dia (para o gráfico e o contador "novas hoje"). */
export async function fetchPublicadasNoDia(dia: Date, modalidade: number) {
  const d = ymd(dia);
  const params = new URLSearchParams({
    dataInicial: d,
    dataFinal: d,
    codigoModalidadeContratacao: String(modalidade),
    pagina: "1",
    tamanhoPagina: "10",
  });
  const res = await fetch(`${BASE}/contratacoes/publicacao?${params}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 204) return 0;
  if (!res.ok) throw new Error(`PNCP respondeu HTTP ${res.status}`);
  const page = (await res.json()) as PncpPage;
  return page.totalRegistros ?? 0;
}

export function matchText(o: Opportunity, termos: string[]) {
  if (!termos.length) return true;
  const hay = `${o.titulo} ${o.orgao} ${o.municipio}`
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return termos.some((t) => hay.includes(t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()));
}
