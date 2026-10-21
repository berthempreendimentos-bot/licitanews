import type { AnaliseEdital, DadosProposta, ItemProposta, Proposta, StatusProposta } from "./types";

/** Cálculos e montagem de propostas (usado no navegador e nas rotas). */

export const COR_STATUS: Record<StatusProposta, string> = {
  "Rascunho": "bg-neutral-200 text-neutral-700",
  "Em análise": "bg-yellow-100 text-yellow-800",
  "Pronta para envio": "bg-blue-100 text-blue-700",
  "Enviada": "bg-violet-100 text-violet-700",
  "Homologada": "bg-green-100 text-green-700",
  "Recusada": "bg-red-100 text-red-700",
};


export const DADOS_PROPOSTA_VAZIOS: DadosProposta = {
  endereco: "", cidade_uf: "", cep: "", telefone: "", email: "",
  representante: "", cpf_representante: "", cargo: "", banco: "", agencia: "", conta: "",
};

/** Moeda sempre com centavos (propostas exigem o valor exato). */
export const moeda = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Valor de referência unitário: o estimado do edital ou, se ele não existir, o pesquisado (PNCP/mercado). */
export const refItem = (i: ItemProposta) => i.valorEstimado || i.valorPesquisado || null;
export const totalItem = (i: ItemProposta) => (i.precoUnitario ?? 0) * (i.quantidade || 0);
export const estimadoItem = (i: ItemProposta) => (refItem(i) ?? 0) * (i.quantidade || 0);

/** % abaixo (+) ou acima (−) da referência; null sem preço ou sem referência. */
export function descontoItem(i: ItemProposta): number | null {
  const ref = refItem(i);
  if (i.precoUnitario == null || !ref) return null;
  return (1 - i.precoUnitario / ref) * 100;
}

export function totais(p: Pick<Proposta, "itens">) {
  const itens = p.itens.filter((i) => i.participar);
  const comPreco = itens.filter((i) => i.precoUnitario != null && i.precoUnitario > 0);
  const total = comPreco.reduce((s, i) => s + totalItem(i), 0);
  const estimado = comPreco.reduce((s, i) => s + estimadoItem(i), 0);
  return {
    participando: itens.length,
    comPreco: comPreco.length,
    semPreco: itens.length - comPreco.length,
    acimaDoEstimado: comPreco.filter((i) => { const r = refItem(i); return !!r && i.precoUnitario! > r; }).length,
    total,
    estimado,
    /** Referência × quantidade de todos os itens em que participa (com ou sem preço). */
    referenciaTotal: itens.reduce((acc, i) => acc + estimadoItem(i), 0),
    semReferencia: itens.filter((i) => !refItem(i)).length,
    desconto: estimado ? (1 - total / estimado) * 100 : null,
  };
}

/** Resposta de GET /api/compra (licitação + itens do PNCP). */
export type CompraPncp = {
  pncpId: string; objeto: string; orgao: string; orgaoCnpj: string; unidade: string; municipio: string; uf: string;
  numero: string; processo: string; modalidade: string; abertura: string | null; encerramento: string | null; link: string;
  itens: { numero: number; descricao: string; quantidade: number; unidade: string; valorUnitarioEstimado: number | null }[];
};

export function novaProposta(id: string, agora: string, parcial: Partial<Proposta> = {}): Proposta {
  return {
    id, pncpId: null, titulo: "Nova proposta", orgao: "", orgaoCnpj: "", numeroLicitacao: "", processo: "", modalidade: "",
    encerramento: null, link: null, status: "Rascunho", validadeDias: 60, prazoEntrega: "", condicoesPagamento: "", observacoes: "",
    itens: [], created_at: agora, updated_at: agora, ...parcial,
  };
}

export function propostaDaCompra(id: string, agora: string, c: CompraPncp): Proposta {
  return novaProposta(id, agora, {
    pncpId: c.pncpId,
    titulo: c.objeto.slice(0, 200) || `Licitação ${c.pncpId}`,
    orgao: [c.orgao, c.unidade && c.unidade !== c.orgao ? c.unidade : ""].filter(Boolean).join(" — "),
    orgaoCnpj: c.orgaoCnpj,
    numeroLicitacao: c.numero,
    processo: c.processo,
    modalidade: c.modalidade,
    encerramento: c.encerramento,
    link: c.link,
    itens: c.itens.map((i) => ({
      numero: i.numero, descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade,
      valorEstimado: i.valorUnitarioEstimado, precoUnitario: null, marca: "", modelo: "", participar: true,
    })),
  });
}

/** "R$ 1.801,95" ou "20" → número. */
function numeroBR(v?: string): number | null {
  const m = (v ?? "").match(/(\d{1,3}(?:\.\d{3})+|\d+)(,\d+)?/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "") + (m[2] ? "." + m[2].slice(1) : ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Itens da proposta a partir da análise do edital (com lotes, quando houver). Usado quando o PNCP
 * registra a compra como um item só (ex.: "Fornecimento de eletrodomésticos…") e os itens estão no edital.
 * Participa dos lotes escolhidos na análise; sem escolha, de todos.
 */
export function itensDaAnalise(a: AnaliseEdital): ItemProposta[] {
  const escolhidos = a.lotes_escolhidos ?? [];
  return (a.resultado.itens ?? []).map((it, i) => ({
    numero: i + 1,
    ...(it.lote?.trim() ? { lote: it.lote.trim(), numeroEdital: it.numero } : {}),
    descricao: it.descricao,
    quantidade: numeroBR(it.quantidade) ?? 1,
    unidade: it.unidade || "UN",
    valorEstimado: numeroBR(it.valor_estimado),
    precoUnitario: null, marca: "", modelo: "",
    participar: !escolhidos.length || !it.lote?.trim() || escolhidos.includes(it.lote.trim()),
  }));
}

/** Nada digitado nos itens ainda (dá para trocar pelos do edital sem perder trabalho). */
export const itensIntocados = (p: Pick<Proposta, "itens">) =>
  p.itens.every((i) => i.precoUnitario == null && !i.marca && !i.modelo && !i.descricaoOfertada?.trim());

/** Proposta nova a partir só da análise do edital (edital enviado em PDF, sem link do PNCP). */
export function propostaDaAnalise(id: string, agora: string, a: AnaliseEdital): Proposta {
  const g = a.resultado.dados_gerais;
  const ok = (v?: string) => (v && !/^n[ãa]o informado/i.test(v.trim()) ? v.trim() : "");
  return novaProposta(id, agora, {
    analiseId: a.id,
    titulo: (ok(g.objeto) || a.titulo).slice(0, 200),
    orgao: ok(g.orgao),
    numeroLicitacao: ok(g.modalidade),
    processo: ok(g.numero_processo),
    modalidade: ok(g.modalidade).split(/\s+\d/)[0],
    itens: itensDaAnalise(a),
    ...condicoesDaAnalise(a),
  });
}

/** A análise traz mais itens que o PNCP? (então os itens do edital são os que valem para a proposta) */
export function analiseTemMaisItens(a: AnaliseEdital | null | undefined, itensAtuais: number) {
  return !!a && (a.resultado.itens?.length ?? 0) > Math.max(itensAtuais, 1);
}

const informado = (v: string | undefined) => (v && !/^n[ãa]o informado$/i.test(v.trim()) ? v.trim() : "");

/** Condições e exigências tiradas da análise do edital feita com IA (sem custo novo de IA). */
export function condicoesDaAnalise(a: AnaliseEdital): Partial<Proposta> {
  const r = a.resultado;
  const dias = Number((informado(r.proposta?.validade_proposta).match(/(\d+)\s*dias/) ?? [])[1]);
  return {
    ...(dias ? { validadeDias: dias } : {}),
    ...(informado(r.execucao?.prazo_entrega) ? { prazoEntrega: informado(r.execucao.prazo_entrega) } : {}),
    ...(informado(r.execucao?.pagamento) ? { condicoesPagamento: informado(r.execucao.pagamento) } : {}),
    ...(informado(r.execucao?.local) ? { localEntrega: informado(r.execucao.local) } : {}),
    ...(informado(r.proposta?.garantia) ? { garantia: informado(r.proposta.garantia) } : {}),
    exigencias: [...(r.proposta?.exigencias ?? []), ...(r.declaracoes ?? []).map((d) => `Declaração: ${d}`)].filter(Boolean),
  };
}

const csvCampo = (v: unknown) => {
  const t = v == null ? "" : String(v);
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const num = (v: number | null) => (v == null ? "" : v.toFixed(2).replace(".", ","));

/** Planilha dos itens (CSV com ";" — abre direto no Excel em português). */
export function csvProposta(p: Proposta) {
  const linhas = [["Lote", "Item", "Descrição do edital", "Descrição ofertada", "Marca", "Modelo", "Unidade", "Quantidade", "Valor estimado unit.", "Preço unit.", "Preço total", "Participa"]];
  for (const i of p.itens) {
    linhas.push([i.lote ?? "", i.numeroEdital ?? String(i.numero), i.descricao, i.descricaoOfertada ?? "", i.marca, i.modelo, i.unidade, String(i.quantidade),
      num(i.valorEstimado), num(i.precoUnitario), num(i.precoUnitario == null ? null : totalItem(i)), i.participar ? "Sim" : "Não"]);
  }
  return "﻿" + linhas.map((l) => l.map(csvCampo).join(";")).join("\r\n");
}

/** Valor por extenso em reais (para a carta-proposta). */
export function porExtenso(valor: number): string {
  const u = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const ate999 = (n: number): string => {
    if (n === 100) return "cem";
    const partes: string[] = [];
    if (n >= 100) partes.push(c[Math.floor(n / 100)]);
    const r = n % 100;
    if (r >= 20) partes.push(d[Math.floor(r / 10)] + (r % 10 ? ` e ${u[r % 10]}` : ""));
    else if (r) partes.push(u[r]);
    return partes.join(" e ");
  };
  const grupos: [number, string, string][] = [[1e9, "bilhão", "bilhões"], [1e6, "milhão", "milhões"], [1e3, "mil", "mil"], [1, "", ""]];
  const inteiro = Math.floor(valor + 1e-9);
  const centavos = Math.round((valor - inteiro) * 100);
  // Cada grupo de 3 dígitos vira um pedaço ("duzentos mil", "trinta e quatro").
  const pedacos: { n: number; t: string }[] = [];
  let resto = inteiro;
  for (const [base, sing, plur] of grupos) {
    const q = Math.floor(resto / base);
    resto %= base;
    if (!q) continue;
    if (base === 1) pedacos.push({ n: q, t: ate999(q) });
    else pedacos.push({ n: q, t: base === 1e3 && q === 1 ? "mil" : `${ate999(q)} ${q === 1 ? sing : plur}` });
  }
  // Liga com "e" quando o pedaço seguinte é menor que 100 ou centena redonda; senão vírgula (ou espaço depois de "mil").
  let texto = pedacos.map((x, i) => {
    if (i === 0) return x.t;
    const liga = x.n < 100 || x.n % 100 === 0 ? " e " : /mil$/.test(pedacos[i - 1].t) ? " " : ", ";
    return liga + x.t;
  }).join("") || "zero";
  texto += inteiro === 1 ? " real" : inteiro >= 1e6 && inteiro % 1e6 === 0 ? " de reais" : " reais";
  if (centavos) texto += ` e ${ate999(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
  return texto;
}
