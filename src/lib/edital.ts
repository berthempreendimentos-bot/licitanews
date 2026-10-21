import { gerarJsonIA, type IAEscolhida } from "./iaServidor";

/**
 * Análise de edital com IA (Claude, com a chave do servidor, ou Google Gemini, com a chave da empresa): lê o PDF (ou o texto) e devolve um JSON
 * estruturado com dados gerais, itens, exigências de habilitação, prazos,
 * riscos e pontos de impugnação.
 */

export type ResultadoEdital = {
  resumo: string;
  dados_gerais: {
    orgao: string;
    /** Nº da licitação (ex.: "15/2026"); análises antigas não têm. */
    numero_licitacao?: string;
    numero_processo: string;
    modalidade: string;
    objeto: string;
    criterio_julgamento: string;
    modo_disputa: string;
    valor_estimado: string;
    data_abertura_sessao: string;
    portal: string;
    exclusivo_me_epp: string;
    permite_consorcio: string;
    registro_de_precos: string;
  };
  /** lote e valor_total chegaram depois: análises antigas não têm. valor_estimado = valor unitário. */
  itens: { numero: string; descricao: string; quantidade: string; unidade: string; valor_estimado: string; valor_total?: string; lote?: string }[];
  /** Lotes/grupos do edital com o total informado (vazio quando o edital não divide em lotes). */
  lotes?: { nome: string; valor_total: string }[];
  habilitacao: {
    juridica: string[];
    fiscal_trabalhista: string[];
    economico_financeira: string[];
    tecnica: string[];
  };
  declaracoes: string[];
  prazos: { evento: string; quando: string }[];
  proposta: { exigencias: string[]; validade_proposta: string; amostras: string; garantia: string };
  execucao: { prazo_entrega: string; local: string; pagamento: string; vigencia: string; penalidades: string[] };
  riscos: { ponto: string; gravidade: "alta" | "media" | "baixa"; recomendacao: string; pagina: string }[];
  pontos_impugnacao: { ponto: string; fundamento: string; pagina: string }[];
  checklist: string[];
};

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;
const obj = (props: Record<string, unknown>) => ({
  type: "object",
  properties: props,
  required: Object.keys(props),
  additionalProperties: false,
});

const SCHEMA = obj({
  resumo: str,
  dados_gerais: obj({
    orgao: str, numero_licitacao: str, numero_processo: str, modalidade: str, objeto: str, criterio_julgamento: str, modo_disputa: str,
    valor_estimado: str, data_abertura_sessao: str, portal: str, exclusivo_me_epp: str, permite_consorcio: str,
    registro_de_precos: str,
  }),
  itens: { type: "array", items: obj({ lote: str, numero: str, descricao: str, quantidade: str, unidade: str, valor_estimado: str, valor_total: str }) },
  lotes: { type: "array", items: obj({ nome: str, valor_total: str }) },
  habilitacao: obj({ juridica: strArr, fiscal_trabalhista: strArr, economico_financeira: strArr, tecnica: strArr }),
  declaracoes: strArr,
  prazos: { type: "array", items: obj({ evento: str, quando: str }) },
  proposta: obj({ exigencias: strArr, validade_proposta: str, amostras: str, garantia: str }),
  execucao: obj({ prazo_entrega: str, local: str, pagamento: str, vigencia: str, penalidades: strArr }),
  riscos: {
    type: "array",
    items: obj({ ponto: str, gravidade: { type: "string", enum: ["alta", "media", "baixa"] }, recomendacao: str, pagina: str }),
  },
  pontos_impugnacao: { type: "array", items: obj({ ponto: str, fundamento: str, pagina: str }) },
  checklist: strArr,
});

const SYSTEM = `Você é um analista sênior de licitações públicas brasileiras (Lei 14.133/2021, LC 123/2006 e normas correlatas) que ajuda um fornecedor a decidir se participa e a se preparar.

Leia o edital e os anexos enviados e preencha o JSON pedido, em português.
- Extraia apenas o que está nos documentos. Quando a informação não existir, use "Não informado" (ou lista vazia). Não invente datas, valores nem exigências.
- Em "pagina", indique a página ou o item/cláusula do edital onde a informação está (ex.: "p. 12, item 8.3"), quando for possível identificar.
- "numero_licitacao": só o número da licitação/pregão/dispensa com o ano, ex.: "15/2026" (não o do processo administrativo).
- "itens": liste TODOS os itens do edital/termo de referência, sem pular nem resumir a lista, com quantidade e unidade.
  - "lote": se o edital divide os itens em lotes ou grupos, o nome do lote como está no edital (ex.: "LOTE 01 - ELETRODOMÉSTICOS"), repetido em cada item do lote; sem lotes, "".
  - "numero": o número do item como aparece no edital (dentro do lote, quando houver).
  - "descricao": o produto e as especificações principais, em até 250 caracteres.
  - "valor_estimado": valor UNITÁRIO estimado (ou mediana) em reais, ex.: "R$ 599,00"; "valor_total": valor total do item (quantidade × unitário), ex.: "R$ 8.985,00". Sem valor no edital: "Não informado".
- "lotes": cada lote/grupo com o "valor_total" informado no edital (ex.: "R$ 448.368,65"); edital sem lotes: lista vazia.
- "habilitacao": cada exigência em uma linha objetiva (ex.: "Índice de Liquidez Geral ≥ 1,0", "Atestado de fornecimento de 30% do quantitativo").
- "riscos": pontos que podem causar inabilitação, desclassificação, prejuízo ou dificuldade na execução (prazos curtos, multas altas, exigências restritivas, amostras, garantia, pagamento demorado). Classifique a gravidade.
- "pontos_impugnacao": cláusulas possivelmente ilegais ou restritivas à competitividade, com o fundamento legal (ex.: "Art. 67 da Lei 14.133 — exigência de atestado acima de 50% do quantitativo"). Seja criterioso: só aponte o que tem base.
- "checklist": passos práticos e ordenados para o fornecedor participar (documentos a separar, declarações, cadastro no portal, envio da proposta).
- "resumo": 3 a 5 frases para o empresário decidir se vale participar.`;

/** Erro com mensagem pronta para o usuário (o mesmo da camada de IA). */
export { IAError as EditalError } from "./iaServidor";
export { claudeConfigurado as iaConfigurada, type IAEscolhida } from "./iaServidor";

export type EntradaEdital = { pdfs: { nome: string; base64: string }[]; texto?: string };

export function analisarEdital(entrada: EntradaEdital, ia: IAEscolhida = { provedor: "claude" }): Promise<ResultadoEdital> {
  return gerarJsonIA<ResultadoEdital>(ia, {
    sistema: SYSTEM,
    schema: SCHEMA,
    pdfs: entrada.pdfs,
    texto: [entrada.texto?.trim() ? `TEXTO DO EDITAL:\n${entrada.texto.trim()}` : "", "Analise o edital acima e preencha o JSON."].filter(Boolean).join("\n\n"),
    esforco: "high",
  });
}
