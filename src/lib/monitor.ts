import type { Alert, AlertasChat, ChatMessage, Disparo } from "./types";

/** Extrai o código da compra (≥10 dígitos) de um link do Comprasnet. Links do PNCP não servem (o número ali é o CNPJ). */
export function codigoCompraFromLink(link: string): string | null {
  if (pncpFromLink(link)) return null;
  try {
    const u = new URL(link.trim());
    for (const k of ["compra", "chaveCompra", "idCompra", "chave"]) {
      const v = u.searchParams.get(k);
      if (v && /^\d{10,}$/.test(v)) return v;
    }
    const m = u.pathname.match(/compras\/(\d{10,})/);
    if (m) return m[1];
  } catch {
    /* não é URL */
  }
  // Código digitado sozinho: UASG (6) + modalidade (2) + número (5) + ano (4).
  const raw = link.trim().match(/^(\d{17})$/);
  return raw ? raw[1] : null;
}

/** Link de edital do PNCP: pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}. */
export function pncpFromLink(link: string): { cnpj: string; ano: number; seq: number } | null {
  const m = link.match(/pncp\.gov\.br\/.*editais\/(\d{14})\/(\d{4})\/(\d+)/);
  return m ? { cnpj: m[1], ano: Number(m[2]), seq: Number(m[3]) } : null;
}

const MODALIDADES: Record<string, string> = {
  "01": "Convite", "02": "Tomada de Preços", "03": "Concorrência", "05": "Pregão", "06": "Dispensa", "07": "Inexigibilidade",
};

/** Código da compra no Comprasnet: UASG (6) + modalidade (2) + número (5) + ano (4). */
export function parseCodigoCompra(codigo: string) {
  const m = codigo.match(/^(\d{6})(\d{2})(\d{5})(\d{4})$/);
  if (!m) return null;
  return { uasg: m[1], modalidade: MODALIDADES[m[2]] ?? "Compra", numero: `${Number(m[3])}/${m[4]}` };
}

/** "UASG 155010 — Pregão 30/2026" (ou o título salvo, se o código não seguir o padrão). */
export function tituloPregao(p: { codigo_compra: string; titulo: string }) {
  const c = parseCodigoCompra(p.codigo_compra);
  return c ? `UASG ${c.uasg} — ${c.modalidade} ${c.numero}` : p.titulo;
}

/** "ÓRGÃO — CIDADE/UF" */
export function orgaoPregao(p: { orgao?: string; municipio?: string; uf?: string }) {
  const local = [p.municipio, p.uf].filter(Boolean).join("/");
  return [p.orgao, local].filter(Boolean).join(" — ");
}

/** Página pública de acompanhamento da compra no Comprasnet (onde fica o chat). */
export function comprasnetUrl(codigo: string) {
  return `https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=${codigo}`;
}

const EVENTS: { evento: string; re: RegExp; prioridade: Alert["prioridade"] }[] = [
  { evento: "CONVOCAÇÃO", re: /convocad[oa]|convoca[çc][ãa]o/i, prioridade: "Alta" },
  { evento: "PRAZO", re: /prazo|horas?\b.*(para|até)|at[ée] as \d{1,2}[:h]/i, prioridade: "Alta" },
  { evento: "HABILITAÇÃO", re: /habilita[çc][ãa]o|inabilitad|habilitad/i, prioridade: "Média" },
  { evento: "RECURSO", re: /recurso|inten[çc][ãa]o de recorrer/i, prioridade: "Média" },
  { evento: "SUSPENSÃO", re: /suspens[ao]|suspend/i, prioridade: "Média" },
  { evento: "SESSÃO ENCERRADA", re: /encerrad[ao]|finalizad[ao]/i, prioridade: "Baixa" },
  { evento: "REABERTURA", re: /reabert|retomad/i, prioridade: "Média" },
];

/** Opções de evento na configuração de alertas (na ordem da tela). */
export const EVENTOS_ALERTA = ["Menção", "Mensagem do pregoeiro", ...EVENTS.map((e) => e.evento)];

export const ALERTAS_PADRAO: AlertasChat = {
  popup: true,
  som: true,
  tipo_som: "sirene",
  volume: 0.8,
  repetir: true,
  eventos: ["Menção", "CONVOCAÇÃO", "PRAZO"],
};

export function alertasDaEmpresa(empresa: { alertas_chat?: AlertasChat }): AlertasChat {
  return { ...ALERTAS_PADRAO, ...(empresa.alertas_chat ?? {}) };
}

/**
 * A mensagem é recente o bastante para tocar alarme? (o histórico importado na primeira captura não toca).
 * O portal manda "2026-10-16 11:07:01.800" no horário de Brasília, sem fuso.
 */
export function recente(dataHora: string | null, agora = Date.now(), janelaMs = 2 * 60 * 60 * 1000) {
  if (!dataHora) return true;
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(dataHora) ? dataHora : `${dataHora.replace(" ", "T")}-03:00`;
  const t = Date.parse(iso);
  return Number.isNaN(t) || agora - t <= janelaMs;
}

/** Decide quais mensagens novas viram pop-up/alarme, conforme a configuração da empresa. */
export function disparosPara(cfg: AlertasChat, msg: { texto: string; remetente: string; codigo_compra: string }, termo: string | null, evento: string | null): Disparo | null {
  const quer = new Set(cfg.eventos);
  const titulo = (o: string) => `${o} — compra ${msg.codigo_compra}`;
  if (termo && quer.has("Menção")) return { tipo: "Menção", titulo: titulo(`Menção a "${termo}"`), mensagem: msg.texto.slice(0, 200) };
  if (evento && quer.has(evento)) return { tipo: evento, titulo: titulo(evento), mensagem: msg.texto.slice(0, 200) };
  if (msg.remetente === "Pregoeiro" && quer.has("Mensagem do pregoeiro")) return { tipo: "Pregoeiro", titulo: titulo("Mensagem do pregoeiro"), mensagem: msg.texto.slice(0, 200) };
  return null;
}

export function classifyMessage(texto: string): { evento: string; prioridade: Alert["prioridade"] } | null {
  for (const e of EVENTS) if (e.re.test(texto)) return { evento: e.evento, prioridade: e.prioridade };
  return null;
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Termos vigiados: palavras-chave + CNPJ (com e sem máscara) + razão social. */
export function watchTerms(empresa: { cnpj: string; razao_social: string; palavras_chave: string[] }) {
  const terms = [...empresa.palavras_chave];
  const digits = empresa.cnpj.replace(/\D/g, "");
  if (digits.length === 14) {
    terms.push(digits, digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"));
  }
  if (empresa.razao_social.trim().length >= 4) terms.push(empresa.razao_social.trim());
  return terms.filter(Boolean);
}

export function findMention(texto: string, terms: string[]): string | null {
  const t = norm(texto);
  for (const term of terms) if (term && t.includes(norm(term))) return term;
  return null;
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

/** Primeiro campo (sem diferenciar maiúsculas) com um dos nomes, olhando também 1 nível de objetos aninhados. */
function pickDeep(raw: Raw, keys: string[]): unknown {
  for (const k of Object.keys(raw)) if (keys.includes(k.toLowerCase()) && raw[k] != null && raw[k] !== "") return raw[k];
  for (const v of Object.values(raw)) {
    if (!isObj(v)) continue;
    for (const k of Object.keys(v)) if (keys.includes(k.toLowerCase()) && v[k] != null && v[k] !== "") return v[k];
  }
  return undefined;
}

/** Texto de um valor que pode vir como código, texto ou objeto ({ descricao, nome, tipo… }). */
function valorTexto(v: unknown): string {
  if (v == null) return "";
  if (isObj(v)) return valorTexto(v.descricao ?? v.nome ?? v.tipo ?? v.codigo ?? v.valor ?? "");
  return String(v).trim();
}

// Códigos de remetente do chat do Comprasnet (conferidos em mensagens reais capturadas):
// 0 = mensagens automáticas do sistema, 1 = fornecedor/participante, 3 = pregoeiro.
const CODIGOS_REMETENTE: Record<string, string> = { "0": "Sistema", "1": "Fornecedor", "3": "Pregoeiro" };

/** Normaliza quem enviou: Pregoeiro, Sistema, Fornecedor… */
export function rotuloRemetente(v: string): string {
  const t = v.trim();
  if (!t) return "Sistema";
  if (CODIGOS_REMETENTE[t]) return CODIGOS_REMETENTE[t];
  if (/^\d+$/.test(t)) return `Remetente ${t}`; // código ainda não identificado
  if (/pregoeir|agente\s+de\s+contrata|condutor|presidente|leiloeir/i.test(t) || /^p$/i.test(t)) return "Pregoeiro";
  if (/comiss/i.test(t)) return "Comissão";
  if (/fornecedor|licitante|participante/i.test(t) || /^f$/i.test(t)) return "Fornecedor";
  if (/sistema/i.test(t) || /^s$/i.test(t)) return "Sistema";
  if (/autoridade|homolog/i.test(t)) return "Autoridade competente";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Item citado no texto ("o item 3…", "item nº 2"); "Mensagem geral:" = sem item. */
export function itemDoTexto(texto: string): string | null {
  if (/^\s*mensagem geral\s*:/i.test(texto)) return null;
  const m = texto.match(/\bitem\s*(?:n[º°o.]*\s*)?(\d{1,4})\b/i);
  return m ? String(Number(m[1])) : null;
}

/** Número do item: campo estruturado da mensagem ou, na falta dele, citado no texto. */
function itemDaMensagem(raw: Raw, texto: string): string | null {
  let v = pickDeep(raw, ["numeroitem", "numerodoitem", "identificadoritem", "itemnumero", "numeroitemcompra", "item", "nritem"]);
  if (isObj(v)) v = v.numero ?? v.numeroItem ?? v.identificador ?? v.id;
  const d = v == null ? "" : String(v).replace(/\D/g, "");
  if (d && Number(d) > 0 && d.length <= 5) return String(Number(d));
  return itemDoTexto(texto);
}

/** Guarda só os campos simples da mensagem original (sem textos enormes), para reprocessamento. */
function reduzRaw(raw: Raw): Raw {
  const out: Raw = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.length > 200 ? `${v.slice(0, 200)}…` : v;
    else if (isObj(v)) out[k] = reduzRaw(Object.fromEntries(Object.entries(v).filter(([, x]) => !isObj(x) && !Array.isArray(x))));
  }
  return out;
}

/** Converte uma mensagem crua do chat do Comprasnet (ou genérica) para o formato interno. */
export function normalizeRawMessage(codigo: string, raw: Raw): Omit<ChatMessage, "evento"> | null {
  const chaveKey = ["chavemensagemnaorigem", "idmensagem", "id", "codigo"]
    .map((n) => Object.keys(raw).find((k) => k.toLowerCase() === n && raw[k] != null))
    .find(Boolean);
  const chave = chaveKey ? raw[chaveKey] : undefined;
  const textoRaw = pickDeep(raw, ["mensagem", "texto", "conteudo", "textomensagem", "mensagemtexto", "recado", "corpo"]);
  if (chave == null || textoRaw == null || isObj(chave)) return null;
  const texto = valorTexto(textoRaw).slice(0, 2000);
  const quem = valorTexto(pickDeep(raw, [
    "tiporemetente", "perfilremetente", "remetente", "tipousuario", "perfil", "origem", "tipoorigem",
    "autor", "enviadopor", "nomeremetente", "quem", "usuario", "nomeparticipante",
  ]));
  const data = pickDeep(raw, ["datahoraenvio", "datahoramensagem", "datahora", "dataenvio", "datahorainclusao", "data", "timestamp"]);
  return {
    id: `${codigo}:${String(chave)}`,
    codigo_compra: codigo,
    remetente: rotuloRemetente(quem),
    texto,
    data_hora: data != null ? String(data) : null,
    created_at: new Date().toISOString(),
    item: itemDaMensagem(raw, texto),
    raw: reduzRaw(raw),
  };
}

/** Mensagem já salva que agora veio com mais dados (remetente/item/campos originais). */
export function enriquecer(old: ChatMessage, novo: Omit<ChatMessage, "evento">): ChatMessage | null {
  const precisa = !old.raw || (old.item == null && novo.item != null) || (old.remetente !== novo.remetente && novo.remetente !== "Sistema");
  if (!precisa) return null;
  return { ...old, remetente: novo.remetente, item: novo.item ?? old.item ?? null, raw: novo.raw, data_hora: old.data_hora ?? novo.data_hora };
}
