/**
 * Cliente mínimo da API do Google Gemini (REST, sem SDK). Só no servidor.
 * Documentação: https://ai.google.dev/api
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiError extends Error {}

export type ModeloGemini = { id: string; nome: string };

function erroDaApi(status: number, corpo: string): GeminiError {
  let msg = "";
  try { msg = JSON.parse(corpo)?.error?.message ?? ""; } catch { /* corpo não-JSON */ }
  if (status === 400 && /api key/i.test(msg)) return new GeminiError("Chave da API do Gemini inválida. Confira em Configurações.");
  if (status === 401 || status === 403) return new GeminiError("A chave do Gemini não tem permissão para usar a API. Confira no Google AI Studio.");
  if (status === 404) return new GeminiError("Modelo do Gemini não encontrado. Escolha outro em Configurações (use “Testar chave” para ver a lista).");
  if (status === 429) return new GeminiError("Limite de uso do Gemini atingido. Tente de novo em alguns minutos ou confira a cota da sua conta.");
  if (status === 503 || status === 500) return new GeminiError("O Gemini está sobrecarregado no momento (instabilidade do Google). Já tentei de novo algumas vezes; aguarde alguns minutos e rode a pesquisa outra vez — os itens já pesquisados são pulados.");
  return new GeminiError(`Erro da API do Gemini (${status})${msg ? `: ${msg.slice(0, 200)}` : ""}.`);
}

/** Lista os modelos da conta que geram texto (generateContent). Também serve para validar a chave. */
export async function listarModelos(key: string): Promise<ModeloGemini[]> {
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  if (!r.ok) throw erroDaApi(r.status, t);
  const modelos = (JSON.parse(t).models ?? []) as { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
  return modelos
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /gemini/i.test(m.name) && !/embedding|aqa|tts|image|live|audio/i.test(m.name))
    .map((m) => ({ id: m.name.replace(/^models\//, ""), nome: m.displayName || m.name }))
    .sort((a, b) => b.id.localeCompare(a.id));
}

/** Converte o JSON Schema usado com o Claude para o formato de schema aceito pelo Gemini. */
function paraSchemaGemini(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(paraSchemaGemini);
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (k === "additionalProperties") continue; // não suportado
    if (k === "type" && typeof v === "string") { out.type = v.toUpperCase(); continue; } // a API REST usa STRING, OBJECT…
    out[k] = k === "properties" && v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, paraSchemaGemini(pv)]))
      : paraSchemaGemini(v);
  }
  if (Array.isArray(out.enum)) out.format = "enum";
  return out;
}

type Parte = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Modelos mais leves usados quando o escolhido está sobrecarregado (503). */
const RESERVA = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
const TEMPORARIO = new Set([429, 500, 503]);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Chama generateContent tentando de novo em erros temporários (2 s, 5 s, 10 s) e,
 * se o modelo continuar sobrecarregado, passa para um modelo reserva.
 */
async function gerarConteudo(key: string, modelo: string, corpo: unknown, timeoutMs: number): Promise<string> {
  const modelos = [modelo, ...RESERVA.filter((m) => m !== modelo)];
  let ultimo: { status: number; texto: string } | null = null;
  // Prazo total (a rota do servidor tem limite): nova tentativa só se ainda der tempo de responder.
  const fim = Date.now() + timeoutMs;
  const restante = () => fim - Date.now();
  for (const [n, m] of modelos.entries()) {
    const pausas = n === 0 ? [2000, 5000, 10000] : [3000];
    for (let tentativa = 0; tentativa <= pausas.length; tentativa++) {
      if (restante() < 20000) throw ultimo ? erroDaApi(ultimo.status, ultimo.texto) : new GeminiError("O Gemini demorou demais para responder. Tente de novo.");
      const r = await fetch(`${BASE}/models/${encodeURIComponent(m)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal: AbortSignal.timeout(restante()),
        body: JSON.stringify(corpo),
      });
      const t = await r.text();
      if (r.ok) return t;
      ultimo = { status: r.status, texto: t };
      if (n > 0 && r.status === 404) break; // modelo reserva não existe nesta conta: tenta o próximo
      if (!TEMPORARIO.has(r.status)) throw erroDaApi(r.status, t);
      if (tentativa < pausas.length) {
        const ra = Number(r.headers.get("retry-after"));
        await espera(Math.min(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 30000) : pausas[tentativa], Math.max(0, restante() - 20000)));
      }
    }
    if (ultimo && ultimo.status === 429) break; // limite de cota vale para a conta: outro modelo não resolve
  }
  throw erroDaApi(ultimo?.status ?? 503, ultimo?.texto ?? "");
}

/** Gera uma resposta JSON seguindo o schema. Lança GeminiError com mensagem em português. */
export async function gerarJson<T>(opts: { key: string; modelo: string; sistema: string; partes: Parte[]; schema: unknown; prazoMs?: number }): Promise<T> {
  const t = await gerarConteudo(opts.key, opts.modelo, {
    systemInstruction: { parts: [{ text: opts.sistema }] },
    contents: [{ role: "user", parts: opts.partes }],
    generationConfig: { responseMimeType: "application/json", responseSchema: paraSchemaGemini(opts.schema), temperature: 0.2 },
  }, opts.prazoMs ?? 230000);
  const d = JSON.parse(t);
  const c = d.candidates?.[0];
  if (!c) throw new GeminiError(d.promptFeedback?.blockReason ? "O Gemini bloqueou o documento enviado." : "O Gemini não devolveu resultado.");
  if (c.finishReason === "MAX_TOKENS") throw new GeminiError("O edital é longo demais para uma única análise. Envie só o edital, sem os anexos.");
  if (c.finishReason && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(c.finishReason)) {
    throw new GeminiError(`O Gemini interrompeu a análise (${c.finishReason}). Tente outro arquivo ou outro modelo.`);
  }
  const texto = (c.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  if (!texto) throw new GeminiError("O Gemini não devolveu resultado.");
  try { return JSON.parse(texto) as T; } catch { throw new GeminiError("O Gemini devolveu uma resposta fora do formato. Tente de novo."); }
}

/** Resposta em texto com pesquisa no Google (grounding). Devolve o texto e os sites consultados. */
export async function pesquisarComGemini(ia: { key: string; modelo: string }, sistema: string, texto: string) {
  const t = await gerarConteudo(ia.key, ia.modelo, {
    systemInstruction: { parts: [{ text: sistema }] },
    contents: [{ role: "user", parts: [{ text: texto }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2 },
  }, 240000);
  const c = JSON.parse(t).candidates?.[0];
  const saida = (c?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  if (!saida) throw new GeminiError("O Gemini não devolveu resultado na pesquisa.");
  const chunks = (c?.groundingMetadata?.groundingChunks ?? []) as { web?: { uri: string; title?: string } }[];
  const fontes = chunks.filter((x) => x.web?.uri).map((x) => ({ url: x.web!.uri, titulo: x.web!.title || x.web!.uri }));
  return { texto: saida, fontes };
}
