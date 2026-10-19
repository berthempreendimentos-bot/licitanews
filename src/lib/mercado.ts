/**
 * Inteligência de mercado sobre dados públicos do PNCP.
 * Fontes:
 *  - Busca pública do PNCP (/api/search) — texto livre (objeto, órgão, CNPJ), contratos e atas.
 *  - API de consulta (/api/consulta/v1) — contratos por data/órgão e licitações abertas.
 */

export type Contrato = {
  id: string;
  objeto: string;
  orgao: string;
  orgaoCnpj: string;
  uf: string;
  municipio: string;
  fornecedorNi: string;
  fornecedorNome: string;
  valor: number;
  assinatura: string | null;
  vigenciaFim: string | null;
  link: string;
};

export type Ata = {
  id: string;
  titulo: string;
  objeto: string;
  orgao: string;
  orgaoCnpj: string;
  uf: string;
  municipio: string;
  assinatura: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  link: string;
};

export type Ranking = { chave: string; nome: string; contratos: number; valor: number };

export type Panorama = {
  contratos: number;
  valorTotal: number;
  valorMedio: number;
  fornecedores: number;
  compradores: number;
  topFornecedores: Ranking[];
  topCompradores: Ranking[];
  porUf: Ranking[];
  porAno: Ranking[];
  recentes: Contrato[];
};

const SEARCH = "https://pncp.gov.br/api/search/";
const CONSULTA = "https://pncp.gov.br/api/consulta/v1";

/**
 * O PNCP às vezes deixa uma requisição pendurada e responde a seguinte em
 * milissegundos: tempo-limite curto + até 5 tentativas. Devolve null se todas falharem.
 */
export async function fetchRetry<T>(url: string, tentativas = 5, limiteMs = 8000, seVazio: T | null = null): Promise<T | null> {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(limiteMs),
      });
      if (r.status === 204) return seVazio; // "sem conteúdo": consulta válida sem resultados
      if (r.ok) return (await r.json()) as T;
      if (r.status < 500) return null;
    } catch {
      /* tempo esgotado ou falha de rede: tenta de novo */
    }
  }
  return null;
}

/** Executa tarefas assíncronas com no máximo `n` simultâneas (não sobrecarrega o PNCP). */
async function pool<T>(tasks: (() => Promise<T>)[], n = 6): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]();
      }
    }),
  );
  return out;
}

export function ymd(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export function soDigitos(s: string) {
  return s.replace(/\D/g, "");
}

const limpa = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- busca (/api/search)

type SearchItem = {
  numero_controle_pncp: string;
  description: string | null;
  title: string | null;
  orgao_nome: string | null;
  orgao_cnpj: string | null;
  uf: string | null;
  municipio_nome: string | null;
  fornecedor_ni: string | null;
  fornecedor_nome: string | null;
  valor_global: number | null;
  data_assinatura: string | null;
  data_inicio_vigencia: string | null;
  data_fim_vigencia: string | null;
  item_url: string | null;
  cancelado?: boolean;
};

/** Busca textual no PNCP. Lê o total na 1ª página e só pede as páginas que existem
 * (a busca trava ao pedir uma página além da última). */
async function buscar(q: string, tipo: "contrato" | "ata", paginas: number) {
  const fetchPage = (n: number) => {
    const params = new URLSearchParams({ q, tipos_documento: tipo, ordenacao: "-data", pagina: String(n), tam_pagina: "100" });
    return fetchRetry<{ items: SearchItem[]; total: number }>(`${SEARCH}?${params}`);
  };
  const first = await fetchPage(1);
  const existentes = first ? Math.min(paginas, Math.ceil((first.total ?? 0) / 100)) : 0;
  const rest = await pool(Array.from({ length: Math.max(0, existentes - 1) }, (_, k) => () => fetchPage(k + 2)));
  const pages = [first, ...rest];
  const seen = new Set<string>();
  const items: SearchItem[] = [];
  let falhas = 0;
  for (const p of pages) {
    if (!p) { falhas++; continue; }
    for (const i of p.items ?? []) {
      if (i.cancelado || seen.has(i.numero_controle_pncp)) continue;
      seen.add(i.numero_controle_pncp);
      items.push(i);
    }
  }
  return { items, total: first?.total ?? 0, falhou: falhas === pages.length };
}

function contratoFromSearch(i: SearchItem): Contrato {
  return {
    id: i.numero_controle_pncp,
    objeto: limpa(i.description || i.title),
    orgao: i.orgao_nome ?? "",
    orgaoCnpj: i.orgao_cnpj ?? "",
    uf: i.uf ?? "",
    municipio: i.municipio_nome ?? "",
    fornecedorNi: i.fornecedor_ni ?? "",
    fornecedorNome: i.fornecedor_nome ?? "",
    valor: Number(i.valor_global) || 0,
    assinatura: i.data_assinatura,
    vigenciaFim: i.data_fim_vigencia,
    link: i.item_url ? `https://pncp.gov.br/app${i.item_url}` : "https://pncp.gov.br/app/contratos",
  };
}

/** Contratos que citam o termo (objeto, órgão ou CNPJ). Até `paginas` × 100, mais recentes primeiro. */
export async function buscarContratos(q: string, paginas = 5) {
  const r = await buscar(q, "contrato", paginas);
  return { items: r.items.map(contratoFromSearch), total: r.total, falhou: r.falhou };
}

/** Atas de registro de preço que citam o termo. */
export async function buscarAtas(q: string, paginas = 5) {
  const r = await buscar(q, "ata", paginas);
  const items = r.items.map<Ata>((i) => ({
    id: i.numero_controle_pncp,
    titulo: limpa(i.title),
    objeto: limpa(i.description),
    orgao: i.orgao_nome ?? "",
    orgaoCnpj: i.orgao_cnpj ?? "",
    uf: i.uf ?? "",
    municipio: i.municipio_nome ?? "",
    assinatura: i.data_assinatura,
    vigenciaInicio: i.data_inicio_vigencia,
    vigenciaFim: i.data_fim_vigencia,
    link: i.item_url ? `https://pncp.gov.br/app${i.item_url}` : "https://pncp.gov.br/app/atas",
  }));
  return { items, total: r.total, falhou: r.falhou };
}

// ---------------------------------------------------------- consulta (/api/consulta/v1)

type ConsultaContrato = {
  numeroControlePNCP: string;
  objetoContrato: string | null;
  orgaoEntidade: { cnpj: string; razaoSocial: string };
  unidadeOrgao: { ufSigla: string; municipioNome: string };
  niFornecedor: string | null;
  nomeRazaoSocialFornecedor: string | null;
  valorGlobal: number | null;
  dataAssinatura: string | null;
  dataVigenciaFim: string | null;
  anoContrato: number;
  sequencialContrato: number;
};
type ConsultaPage<T> = { data: T[]; totalRegistros: number; totalPaginas: number };

function contratoFromConsulta(c: ConsultaContrato): Contrato {
  return {
    id: c.numeroControlePNCP,
    objeto: limpa(c.objetoContrato),
    orgao: c.orgaoEntidade?.razaoSocial ?? "",
    orgaoCnpj: c.orgaoEntidade?.cnpj ?? "",
    uf: c.unidadeOrgao?.ufSigla ?? "",
    municipio: c.unidadeOrgao?.municipioNome ?? "",
    fornecedorNi: c.niFornecedor ?? "",
    fornecedorNome: c.nomeRazaoSocialFornecedor ?? "",
    valor: Number(c.valorGlobal) || 0,
    assinatura: c.dataAssinatura,
    vigenciaFim: c.dataVigenciaFim,
    link: `https://pncp.gov.br/app/contratos/${c.orgaoEntidade?.cnpj}/${c.anoContrato}/${c.sequencialContrato}`,
  };
}

/**
 * Contratos publicados no período (opcionalmente de um órgão), 500 por página,
 * até `maxPaginas`. Devolve também quantos existem no total.
 */
export async function contratosPeriodo(inicio: Date, fim: Date, opts: { cnpjOrgao?: string; maxPaginas?: number } = {}) {
  const fetchPage = (n: number) => {
    const params = new URLSearchParams({ dataInicial: ymd(inicio), dataFinal: ymd(fim), pagina: String(n), tamanhoPagina: "500" });
    if (opts.cnpjOrgao) params.set("cnpjOrgao", opts.cnpjOrgao);
    return fetchRetry<ConsultaPage<ConsultaContrato>>(`${CONSULTA}/contratos?${params}`, 4, 15000, { data: [], totalRegistros: 0, totalPaginas: 0 });
  };
  const first = await fetchPage(1);
  if (!first) return { items: [] as Contrato[], total: 0, lidas: 0, falhou: true };
  const paginas = Math.min(opts.maxPaginas ?? 1, first.totalPaginas ?? 1);
  const rest = await pool(Array.from({ length: Math.max(0, paginas - 1) }, (_, k) => () => fetchPage(k + 2)));
  const items = [first, ...rest].flatMap((p) => (p?.data ?? []).map(contratoFromConsulta));
  return { items, total: first.totalRegistros ?? items.length, lidas: paginas, falhou: false };
}

/** Contratos publicados em um dia (até 500), para o panorama sem termo de busca. */
export async function contratosDoDia(dia: Date) {
  const r = await contratosPeriodo(dia, dia, { maxPaginas: 1 });
  if (r.falhou) throw new Error("O PNCP não respondeu. Tente de novo em instantes.");
  return { items: r.items, total: r.total };
}

type ConsultaAta = {
  numeroControlePNCPAta: string;
  numeroAtaRegistroPreco: string | null;
  cancelado: boolean;
  dataAssinatura: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  objetoContratacao: string | null;
  cnpjOrgao: string | null;
  nomeOrgao: string | null;
  nomeUnidadeOrgao: string | null;
  possibilidadeAdesao: boolean | null;
};

export type AtaVencendo = Ata & { adesao: boolean; diasRestantes: number };

function linkAta(ctrl: string) {
  // "45780103000150-1-000001/2023-000001" → /app/atas/45780103000150/2023/1/1
  const m = ctrl.match(/^(\d{14})-\d-(\d+)\/(\d{4})-(\d+)$/);
  return m ? `https://pncp.gov.br/app/atas/${m[1]}/${m[3]}/${Number(m[2])}/${Number(m[4])}` : "https://pncp.gov.br/app/atas";
}

/**
 * Atas de registro de preço cuja vigência termina nos próximos `dias`.
 * A consulta do PNCP devolve as atas vigentes em algum momento da janela; as que
 * vencem primeiro tendem a vir nas primeiras páginas, então varremos até `maxPaginas`.
 */
export async function atasVencendo(dias: number, termo: string, maxPaginas = 10) {
  const hoje = new Date();
  const fim = new Date(hoje.getTime() + dias * 86400000);
  const fetchPage = (n: number) => {
    const params = new URLSearchParams({ dataInicial: ymd(hoje), dataFinal: ymd(fim), pagina: String(n), tamanhoPagina: "500" });
    return fetchRetry<ConsultaPage<ConsultaAta>>(`${CONSULTA}/atas?${params}`, 4, 20000);
  };
  const first = await fetchPage(1);
  if (!first) return { items: [] as AtaVencendo[], analisadas: 0, falhou: true };
  const paginas = Math.min(maxPaginas, first.totalPaginas ?? 1);
  const rest = await pool(Array.from({ length: Math.max(0, paginas - 1) }, (_, k) => () => fetchPage(k + 2)));
  const all = [first, ...rest].flatMap((p) => p?.data ?? []);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = norm(termo.trim());
  const limite = ymd(fim);
  const seen = new Set<string>();
  const items: AtaVencendo[] = [];
  for (const a of all) {
    if (a.cancelado || !a.vigenciaFim || seen.has(a.numeroControlePNCPAta)) continue;
    const vf = a.vigenciaFim.slice(0, 10).replace(/-/g, "");
    if (vf < ymd(hoje) || vf > limite) continue;
    if (t && !norm(`${a.objetoContratacao ?? ""} ${a.nomeOrgao ?? ""}`).includes(t)) continue;
    seen.add(a.numeroControlePNCPAta);
    items.push({
      id: a.numeroControlePNCPAta,
      titulo: `Ata nº ${a.numeroAtaRegistroPreco ?? "—"}`,
      objeto: limpa(a.objetoContratacao),
      orgao: a.nomeOrgao ?? "",
      orgaoCnpj: a.cnpjOrgao ?? "",
      uf: "",
      municipio: limpa(a.nomeUnidadeOrgao),
      assinatura: a.dataAssinatura,
      vigenciaInicio: a.vigenciaInicio,
      vigenciaFim: a.vigenciaFim,
      link: linkAta(a.numeroControlePNCPAta),
      adesao: !!a.possibilidadeAdesao,
      diasRestantes: diasAte(a.vigenciaFim) ?? 0,
    });
  }
  items.sort((a, b) => a.diasRestantes - b.diasRestantes);
  return { items, analisadas: all.length, falhou: false };
}

// ------------------------------------------------------------------------- agregações

function rank(items: Contrato[], key: (c: Contrato) => [string, string], top: number): Ranking[] {
  const m = new Map<string, Ranking>();
  for (const c of items) {
    const [chave, nome] = key(c);
    if (!chave) continue;
    const r = m.get(chave) ?? { chave, nome, contratos: 0, valor: 0 };
    r.contratos++;
    r.valor += c.valor;
    m.set(chave, r);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, top);
}

export function panorama(items: Contrato[]): Panorama {
  const valorTotal = items.reduce((a, c) => a + c.valor, 0);
  const fornecedores = new Set(items.map((c) => c.fornecedorNi).filter(Boolean));
  const compradores = new Set(items.map((c) => c.orgaoCnpj).filter(Boolean));
  return {
    contratos: items.length,
    valorTotal,
    valorMedio: items.length ? valorTotal / items.length : 0,
    fornecedores: fornecedores.size,
    compradores: compradores.size,
    topFornecedores: rank(items, (c) => [c.fornecedorNi, c.fornecedorNome], 10),
    topCompradores: rank(items, (c) => [c.orgaoCnpj, c.orgao], 10),
    porUf: rank(items, (c) => [c.uf, c.uf], 27),
    porAno: rank(items, (c) => [c.assinatura?.slice(0, 4) ?? "", c.assinatura?.slice(0, 4) ?? ""], 20).sort((a, b) =>
      a.chave.localeCompare(b.chave),
    ),
    recentes: [...items].sort((a, b) => (b.assinatura ?? "").localeCompare(a.assinatura ?? "")).slice(0, 50),
  };
}

/** Dias entre hoje e a data (negativo = já passou). */
export function diasAte(iso: string | null) {
  if (!iso) return null;
  const t = new Date(`${iso.slice(0, 10)}T23:59:59`).getTime();
  return Number.isNaN(t) ? null : Math.ceil((t - Date.now()) / 86400000);
}
