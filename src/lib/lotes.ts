import type { ResultadoEdital } from "./edital";

export type ItemEdital = ResultadoEdital["itens"][number];
export type Lote = { nome: string; itens: ItemEdital[]; total: number | null; totalTexto: string };

/** "R$ 1.801,95" → 1801.95; sem valor → null. */
export function valorBRL(v?: string): number | null {
  const m = (v ?? "").match(/(\d{1,3}(?:\.\d{3})+|\d+)(,\d{1,2})?/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "") + (m[2] ? "." + m[2].slice(1) : ""));
  return Number.isFinite(n) ? n : null;
}

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Total do item: o informado no edital ou quantidade × unitário. */
export function totalDoItem(it: ItemEdital): number | null {
  const t = valorBRL(it.valor_total);
  if (t != null) return t;
  const unit = valorBRL(it.valor_estimado);
  const qtd = valorBRL(it.quantidade);
  return unit != null && qtd != null ? unit * qtd : null;
}

/**
 * Itens agrupados por lote, na ordem do edital. Edital sem lotes: [] (a tela mostra a tabela simples).
 * O total do lote é a soma dos itens; sem valores nos itens, usa o total informado em "lotes".
 */
export function lotesDoEdital(r: ResultadoEdital): Lote[] {
  const itens = r.itens ?? [];
  if (!itens.some((it) => it.lote?.trim())) return [];
  const mapa = new Map<string, ItemEdital[]>();
  for (const it of itens) {
    const nome = it.lote?.trim() || "Sem lote";
    if (!mapa.has(nome)) mapa.set(nome, []);
    mapa.get(nome)!.push(it);
  }
  return [...mapa].map(([nome, lista]) => {
    const valores = lista.map(totalDoItem);
    let total: number | null = valores.some((v) => v != null) ? valores.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
    const informado = r.lotes?.find((l) => chave(l.nome) === chave(nome) || chave(nome).startsWith(chave(l.nome)) || chave(l.nome).startsWith(chave(nome)));
    if (total == null && informado) total = valorBRL(informado.valor_total);
    return { nome, itens: lista, total, totalTexto: total != null ? brl(total) : "—" };
  });
}

/**
 * Cor de cada lote (pela ordem no edital), igual na análise e na proposta.
 * Classes escritas por extenso para o Tailwind gerar.
 */
export const CORES_LOTE = [
  { ponto: "bg-blue-500", texto: "text-blue-800", fundo: "bg-blue-50", borda: "border-blue-500", bordaL: "border-l-blue-500", anel: "ring-blue-500/20" },
  { ponto: "bg-emerald-500", texto: "text-emerald-800", fundo: "bg-emerald-50", borda: "border-emerald-500", bordaL: "border-l-emerald-500", anel: "ring-emerald-500/20" },
  { ponto: "bg-amber-500", texto: "text-amber-800", fundo: "bg-amber-50", borda: "border-amber-500", bordaL: "border-l-amber-500", anel: "ring-amber-500/20" },
  { ponto: "bg-violet-500", texto: "text-violet-800", fundo: "bg-violet-50", borda: "border-violet-500", bordaL: "border-l-violet-500", anel: "ring-violet-500/20" },
  { ponto: "bg-rose-500", texto: "text-rose-800", fundo: "bg-rose-50", borda: "border-rose-500", bordaL: "border-l-rose-500", anel: "ring-rose-500/20" },
  { ponto: "bg-cyan-500", texto: "text-cyan-800", fundo: "bg-cyan-50", borda: "border-cyan-500", bordaL: "border-l-cyan-500", anel: "ring-cyan-500/20" },
  { ponto: "bg-orange-500", texto: "text-orange-800", fundo: "bg-orange-50", borda: "border-orange-500", bordaL: "border-l-orange-500", anel: "ring-orange-500/20" },
  { ponto: "bg-teal-500", texto: "text-teal-800", fundo: "bg-teal-50", borda: "border-teal-500", bordaL: "border-l-teal-500", anel: "ring-teal-500/20" },
] as const;

export const corDoLote = (indice: number) => CORES_LOTE[Math.max(0, indice) % CORES_LOTE.length];
