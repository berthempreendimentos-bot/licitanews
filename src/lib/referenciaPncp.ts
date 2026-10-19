import { fetchRetry } from "./mercado";
import type { AmostraPreco, RefPncp } from "./types";

/**
 * Preço de referência por contratações similares (Lei 14.133, art. 23, §1º, II):
 * procura no PNCP licitações com itens parecidos e reúne os valores estimados e homologados.
 */

const API = "https://pncp.gov.br/api/pncp/v1";
const BUSCA = "https://pncp.gov.br/api/search/";
const MAX_LICITACOES = 10;
const MAX_RESULTADOS = 6;

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v).trim());
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PARADAS = new Set([
  "de", "da", "do", "das", "dos", "com", "sem", "para", "por", "em", "no", "na", "nos", "nas", "ou", "um", "uma", "tipo", "tudo",
  "acordo", "conforme", "termo", "referencia", "item", "itens", "unidade", "aproximadamente", "minimo", "maximo", "cada", "contendo",
  "diversos", "diversas", "variados", "variadas", "sabores", "sabor", "embalado", "embalada", "embalagem", "acondicionado", "acondicionados",
  "acondicionada", "qualidade", "primeira", "produto", "marca", "selo", "fiscalizacao", "validade", "sendo", "devera", "deverao",
]);

/** Raiz simples (sem plural nem gênero): "bombons"→"bombom", "congelada"→"congelad". */
const raiz = (w: string) => w.replace(/ns$/, "m").replace(/s$/, "").replace(/[aoe]$/, "");
const raizes = (t: string) => new Set(norm(t).split(/[^a-z]+/).filter((w) => w.length >= 3).map(raiz));

/** Embalagens: preço por caixa/pacote pode vir como "unidade" quando a descrição diz que é uma caixa. */
const PALAVRA_UNIDADE: Record<string, RegExp> = { cx: /caixa/, pct: /pacote/, fd: /fardo/, kg: /kg|quilo/ };
function unidadesCompativeis(minha: string, outra: string, minhaDesc: string, outraDesc: string) {
  if (!minha || !outra || minha === outra) return true;
  const emb = ["un", "cx", "pct", "fd"];
  if (!emb.includes(minha) || !emb.includes(outra)) return false;
  const pacote = minha === "un" ? outra : minha;
  const re = PALAVRA_UNIDADE[pacote];
  return !!re && (re.test(norm(minhaDesc)) || re.test(norm(outraDesc)));
}

/** Palavras que identificam o produto (as primeiras da descrição costumam ser o nome dele). */
export function palavrasChave(descricao: string, n = 4) {
  return norm(descricao).split(/[^a-z]+/).filter((w) => w.length >= 3 && !PARADAS.has(w)).slice(0, n);
}

/** Família da unidade de medida, para não comparar preço de quilo com preço de caixa. */
function familia(u: string): string {
  const t = norm(u).replace(/[^a-z]/g, "");
  if (/^(kg|kgs|quilo|quilos|quilograma|quilogramas)$/.test(t)) return "kg";
  if (/^(g|gr|grama|gramas)$/.test(t)) return "g";
  if (/^(l|lt|lts|litro|litros)$/.test(t)) return "l";
  if (/^(ml|mililitro|mililitros)$/.test(t)) return "ml";
  if (/^(cx|cxs|caixa|caixas)$/.test(t)) return "cx";
  if (/^(pct|pcts|pacote|pacotes)$/.test(t)) return "pct";
  if (/^(un|und|unid|unidade|unidades|pc|pca|peca|pecas)$/.test(t)) return "un";
  if (/^(fd|fardo|fardos)$/.test(t)) return "fd";
  if (/^(dz|duzia|duzias)$/.test(t)) return "dz";
  return t;
}

function mediana(v: number[]) {
  const a = [...v].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

async function pool<T>(tarefas: (() => Promise<T>)[], k = 4): Promise<T[]> {
  const out: T[] = new Array(tarefas.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(k, tarefas.length) }, async () => {
    while (i < tarefas.length) { const j = i++; out[j] = await tarefas[j](); }
  }));
  return out;
}

export async function referenciaPncp(descricao: string, unidade: string, excluirPncpId?: string | null): Promise<RefPncp> {
  const chave = palavrasChave(descricao);
  const consulta = chave.slice(0, 3).join(" ");
  const vazio: RefPncp = { consulta, n: 0, mediana: null, media: null, min: null, max: null, nHomologados: 0, medianaHomologada: null, amostras: [] };
  if (chave.length === 0) return vazio;

  const q = new URLSearchParams({ q: consulta, tipos_documento: "edital", ordenacao: "-data", pagina: "1", tam_pagina: "30", status: "todos" });
  const busca = await fetchRetry<{ items?: Raw[] }>(`${BUSCA}?${q}`, 3, 15000);
  const licitacoes = (busca?.items ?? [])
    .map((x) => ({ id: s(x.numero_controle_pncp), orgao: s(x.orgao_nome), uf: s(x.uf), data: s(x.data_publicacao_pncp) || null }))
    .filter((x) => x.id && x.id !== excluirPncpId)
    .slice(0, MAX_LICITACOES);

  const fam = familia(unidade);
  const chaveR = chave.map(raiz);
  const souKit = /^(cesta|kit|conjunto|combo)/.test(norm(descricao));
  const amostras: (AmostraPreco & { base: string; temResultado: boolean; numeroItem: number; pontos: number })[] = [];

  await pool(licitacoes.map((l) => async () => {
    const m = l.id.match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
    if (!m) return;
    const base = `${API}/orgaos/${m[1]}/compras/${m[3]}/${Number(m[2])}`;
    const itens = await fetchRetry<Raw[]>(`${base}/itens?pagina=1&tamanhoPagina=500`, 3, 15000, []);
    for (const it of itens ?? []) {
      const desc = s(it.descricao);
      const palavras = raizes(desc);
      // O nome do produto (1ª palavra-chave) é obrigatório; o resto conta pontos de semelhança.
      if (!palavras.has(chaveR[0])) continue;
      if (!souKit && /^(cesta|kit|conjunto|combo)/.test(norm(desc))) continue;
      const pontos = chaveR.filter((w) => palavras.has(w)).length / chaveR.length;
      if (pontos < 0.25) continue;
      const un = s(it.unidadeMedida);
      if (!unidadesCompativeis(fam, familia(un), descricao, desc)) continue;
      const valor = Number(it.valorUnitarioEstimado) || 0;
      if (valor <= 0 && !it.temResultado) continue;
      amostras.push({
        pncpId: l.id, orgao: l.orgao, uf: l.uf, data: l.data, descricao: desc.slice(0, 200), unidade: un,
        valor, tipo: "estimado", base, temResultado: !!it.temResultado, numeroItem: Number(it.numeroItem), pontos,
      });
    }
  }));

  // Valor homologado (vencedor) dos primeiros itens que já têm resultado.
  const comResultado = amostras.filter((a) => a.temResultado).slice(0, MAX_RESULTADOS);
  await pool(comResultado.map((a) => async () => {
    const r = await fetchRetry<Raw[]>(`${a.base}/itens/${a.numeroItem}/resultados`, 2, 12000, []);
    const v = Number(r?.[0]?.valorUnitarioHomologado) || 0;
    if (v > 0) amostras.push({ ...a, valor: v, tipo: "homologado", fornecedor: s(r?.[0]?.nomeRazaoSocialFornecedor) });
  }));

  // Um valor por item: o homologado (preço que venceu) substitui o estimado do mesmo item.
  const porItem = new Map<string, (typeof amostras)[number]>();
  for (const a of amostras) {
    if (a.valor <= 0) continue;
    const k = `${a.pncpId}#${a.numeroItem}`;
    const atual = porItem.get(k);
    if (!atual || (a.tipo === "homologado" && atual.tipo === "estimado")) porItem.set(k, a);
  }
  // No máximo 2 itens por órgão, para um mesmo comprador (com várias licitações) não dominar a média.
  const porOrgao = new Map<string, number>();
  const unicas = [...porItem.values()]
    .sort((a, b) => b.pontos - a.pontos)
    .filter((a) => {
      const chaveOrgao = a.orgao || a.pncpId;
      const n = porOrgao.get(chaveOrgao) ?? 0;
      porOrgao.set(chaveOrgao, n + 1);
      return n < 2;
    });

  // Prefere as amostras mais parecidas; descarta valores fora da curva (menos de 1/3 ou mais de 3x a mediana).
  let validas = unicas;
  const parecidas = validas.filter((a) => a.pontos >= 0.5);
  if (parecidas.length >= 3) validas = parecidas;
  if (!validas.length) return { ...vazio, n: 0 };
  const m0 = mediana(validas.map((a) => a.valor));
  validas = validas.filter((a) => a.valor >= m0 / 3 && a.valor <= m0 * 3);
  const valores = validas.map((a) => a.valor);
  const homologados = validas.filter((a) => a.tipo === "homologado").map((a) => a.valor);
  const r2 = (v: number) => Math.round(v * 100) / 100;

  return {
    consulta,
    n: valores.length,
    mediana: r2(mediana(valores)),
    media: r2(valores.reduce((x, y) => x + y, 0) / valores.length),
    min: r2(Math.min(...valores)),
    max: r2(Math.max(...valores)),
    nHomologados: homologados.length,
    medianaHomologada: homologados.length ? r2(mediana(homologados)) : null,
    amostras: validas
      .sort((a, b) => (a.tipo === b.tipo ? (b.data ?? "").localeCompare(a.data ?? "") : a.tipo === "homologado" ? -1 : 1))
      .slice(0, 15)
      .map((a): AmostraPreco => ({
        pncpId: a.pncpId, orgao: a.orgao, uf: a.uf, data: a.data, descricao: a.descricao, unidade: a.unidade,
        valor: a.valor, tipo: a.tipo, ...(a.fornecedor ? { fornecedor: a.fornecedor } : {}),
      })),
  };
}
