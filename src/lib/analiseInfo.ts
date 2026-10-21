import type { AnaliseEdital } from "./types";

const vazio = (v?: string) => !v || /^n[ãa]o informado/i.test(v.trim());
const UFS = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO";

function titulo(s: string) {
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());
}

/** Cidade e UF: do órgão ("Prefeitura Municipal de Maraú - BA") ou do objeto ("…NO MUNICÍPIO DE AURELINO LEAL-BA"). */
function cidadeUf(textos: string[]): { cidade: string; uf: string } {
  const re = new RegExp(`(?:munic[íi]pio|prefeitura(?: municipal)?|c[âa]mara municipal|fundo municipal[^,]*?)\\s+(?:de|do|da)\\s+([A-Za-zÀ-ÿ'’ .]+?)\\s*(?:[-–/,(]\\s*(${UFS})\\b|$|[-–(,])`, "i");
  for (const t of textos) {
    const m = t.match(re);
    if (m && m[1].trim().length > 1) return { cidade: titulo(m[1].trim()), uf: (m[2] ?? "").toUpperCase() };
  }
  const uf = textos.join(" ").match(new RegExp(`[-–/]\\s*(${UFS})\\b`));
  return { cidade: "", uf: uf ? uf[1] : "" };
}

/**
 * Nº da licitação: o número junto da palavra Pregão/Dispensa/Edital (nunca o de uma lei, como "14.133/2021",
 * nem o do processo administrativo). Também lê nomes de arquivo como "EDITAL_PE_15" e "PESRP_007_2026".
 */
function numeroLicitacao(textos: string[]): string {
  const [campo, ...resto] = textos;
  const proprio = campo.match(/^\s*(\d{1,6})\s*[/.\-_ ]\s*(20\d{2})\b/);
  if (proprio) return `${Number(proprio[1])}/${proprio[2]}`;
  const comAno = /(preg[aã]o|dispensa|concorr[eê]ncia|tomada de pre[çc]os|leil[aã]o|edital|contrata[çc][aã]o direta|credenciamento|inexigibilidade)[^0-9]{0,40}?(\d{1,6})\s*[/.\-_ ]\s*(20\d{2})\b/i;
  for (const t of resto) {
    const m = t.match(comAno);
    if (m) return `${Number(m[2])}/${m[3]}`;
  }
  for (const t of resto) {
    const m = t.match(/(?:^|[^A-Za-z])PE(?:SRP)?[\s_-]?(\d{1,5})(?:[\s_-](20\d{2}))?(?!\d)/i);
    if (m) return m[2] ? `${Number(m[1])}/${m[2]}` : String(Number(m[1]));
  }
  return "";
}

/** "Processo Administrativo nº 106/2026 (Pregão…)" → "106/2026"; formatos sem "nº/ano" ficam como estão. */
function processoCurto(v?: string) {
  if (vazio(v)) return "";
  const t = v!.trim();
  const m = t.match(/processo[^0-9]{0,30}(\d{1,7}\s*\/\s*\d{4})/i) ?? t.match(/^(\d{1,7}\s*\/\s*\d{4})/);
  return (m ? m[1].replace(/\s/g, "") : t).slice(0, 40);
}

export type ResumoAnalise = {
  tipo: string;      // "Pregão Eletrônico", "Dispensa"…
  numero: string;    // "15/2026"
  processo: string;  // "106/2026"
  cidade: string;
  uf: string;
  orgao: string;
  objeto: string;
};

/** Dados para o card da análise salva: modalidade e nº, cidade/UF e órgão. */
export function resumoAnalise(a: AnaliseEdital): ResumoAnalise {
  const g = a.resultado.dados_gerais;
  const modalidade = vazio(g.modalidade) ? "" : g.modalidade;
  let numero = numeroLicitacao([g.numero_licitacao ?? "", modalidade, g.numero_processo ?? "", a.titulo, a.fonte]);
  // Só o número (ex.: do nome do arquivo "EDITAL_PE_15"): o ano vem do processo.
  const ano = processoCurto(g.numero_processo).match(/\/(20\d{2})$/);
  if (numero && !numero.includes("/") && ano) numero = `${numero}/${ano[1]}`;
  const tipo = (modalidade.match(/^\s*([A-Za-zÀ-ÿ ]+?)(?:\s+n[º°o.]|\s+\d|\s*[-–(]|$)/i)?.[1] ?? "").trim();
  const orgao = vazio(g.orgao) ? "" : g.orgao.trim();
  const { cidade, uf } = cidadeUf([orgao, g.objeto ?? "", a.titulo, g.portal ?? ""]);
  return {
    tipo: tipo ? titulo(tipo) : "Licitação",
    numero,
    processo: processoCurto(g.numero_processo),
    cidade,
    uf,
    orgao,
    objeto: vazio(g.objeto) ? a.titulo : g.objeto,
  };
}
