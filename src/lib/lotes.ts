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
