import Anthropic from "@anthropic-ai/sdk";
import { GeminiError, gerarJson as gerarJsonGemini, pesquisarComGemini } from "./gemini";
import { GEMINI_MODELO_PADRAO } from "./ia";

/**
 * IA no servidor: gera um JSON que segue o schema, com o provedor escolhido em Configurações.
 * - Claude: chave do servidor (ANTHROPIC_API_KEY), claude-opus-5-5 com fallback do servidor em caso de recusa.
 * - Gemini: chave da empresa, enviada pelo navegador a cada pedido.
 */

export class IAError extends Error {}

export type IAEscolhida = { provedor: "claude" } | { provedor: "gemini"; key: string; modelo: string };

export const claudeConfigurado = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/** Lê o provedor dos cabeçalhos (x-ia-provedor, x-gemini-key, x-gemini-modelo). Devolve a mensagem de erro se não der para usar. */
export function iaDoPedido(req: Request): { ia: IAEscolhida } | { erro: string; status: number } {
  if (req.headers.get("x-ia-provedor") === "gemini") {
    const key = req.headers.get("x-gemini-key")?.trim() || "";
    if (!key) return { erro: "Gemini escolhido, mas sem chave: cole a chave da API em Configurações → Inteligência artificial.", status: 400 };
    return { ia: { provedor: "gemini", key, modelo: req.headers.get("x-gemini-modelo")?.trim() || GEMINI_MODELO_PADRAO } };
  }
  if (!claudeConfigurado()) {
    return { erro: "IA não configurada: escolha o Google Gemini em Configurações → Inteligência artificial, ou defina ANTHROPIC_API_KEY no .env.local do servidor e reinicie.", status: 503 };
  }
  return { ia: { provedor: "claude" } };
}

export type PedidoIA = {
  sistema: string;
  /** Texto do pedido (instruções + dados). */
  texto: string;
  /** PDFs em base64 (ex.: edital), enviados antes do texto. */
  pdfs?: { nome: string; base64: string }[];
  schema: Record<string, unknown>;
  /** Profundidade do raciocínio do Claude. */
  esforco?: "low" | "medium" | "high";
};

async function comClaude<T>(p: PedidoIA): Promise<T> {
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(p.pdfs ?? []).map<Anthropic.Beta.BetaContentBlockParam>((d) => ({
      type: "document",
      title: d.nome,
      source: { type: "base64", media_type: "application/pdf", data: d.base64 },
    })),
    { type: "text", text: p.texto },
  ];
  try {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // se o modelo recusar por engano, o próprio servidor tenta outro modelo
      system: p.sistema,
      output_config: { effort: p.esforco ?? "high", format: { type: "json_schema", schema: p.schema } },
      messages: [{ role: "user", content }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new IAError("A IA não conseguiu processar este pedido. Tente de novo ajustando o conteúdo.");
    if (msg.stop_reason === "max_tokens") throw new IAError("O conteúdo é longo demais para uma única resposta da IA.");
    const text = msg.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
    if (!text) throw new IAError("A IA não devolveu resultado.");
    return JSON.parse(text) as T;
  } catch (e) {
    if (e instanceof IAError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new IAError("Chave da API da Anthropic inválida (ANTHROPIC_API_KEY).");
    if (e instanceof Anthropic.RateLimitError) throw new IAError("Limite de uso da IA atingido. Tente de novo em alguns minutos.");
    if (e instanceof Anthropic.BadRequestError) throw new IAError(`A IA recusou o pedido: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new IAError(`Erro da API da Anthropic (${e.status}). Tente de novo.`);
    throw e;
  }
}

async function comGemini<T>(p: PedidoIA, ia: { key: string; modelo: string }): Promise<T> {
  try {
    return await gerarJsonGemini<T>({
      key: ia.key,
      modelo: ia.modelo,
      sistema: p.sistema,
      schema: p.schema,
      partes: [
        ...(p.pdfs ?? []).flatMap((d) => [{ text: `DOCUMENTO: ${d.nome}` }, { inline_data: { mime_type: "application/pdf", data: d.base64 } }]),
        { text: p.texto },
      ],
    });
  } catch (e) {
    if (e instanceof GeminiError) throw new IAError(e.message);
    if (e instanceof Error && e.name === "TimeoutError") throw new IAError("O Gemini demorou demais para responder. Tente de novo ou use um modelo mais rápido.");
    throw e;
  }
}

export function gerarJsonIA<T>(ia: IAEscolhida, pedido: PedidoIA): Promise<T> {
  return ia.provedor === "gemini" ? comGemini<T>(pedido, ia) : comClaude<T>(pedido);
}

// ===== Pesquisa na internet (Claude com web search / Gemini com Google Search) =====

export type Fonte = { url: string; titulo: string };

/** Extrai o JSON da resposta em texto (a busca na web não combina com o formato JSON garantido). */
function jsonDoTexto<T>(texto: string): T {
  const cerca = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const bruto = cerca ? cerca[1] : texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1);
  try { return JSON.parse(bruto) as T; } catch { throw new IAError("A IA devolveu a pesquisa fora do formato esperado. Tente de novo."); }
}

async function pesquisarComClaude<T>(sistema: string, texto: string): Promise<{ dados: T; fontes: Fonte[] }> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: texto }];
  const fontes = new Map<string, string>();
  try {
    // A busca roda no servidor da Anthropic; se ela pausar (pause_turn), reenvia o turno para continuar.
    for (let volta = 0; volta < 5; volta++) {
      const stream = client.beta.messages.stream({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: sistema,
        output_config: { effort: "medium" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8, user_location: { type: "approximate", country: "BR" } }],
        messages,
      });
      const msg = await stream.finalMessage();
      for (const b of msg.content) {
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
          for (const r of b.content) if (r.type === "web_search_result") fontes.set(r.url, r.title);
        }
      }
      if (msg.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: msg.content }); continue; }
      if (msg.stop_reason === "refusal") throw new IAError("A IA não conseguiu fazer esta pesquisa.");
      const final = msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
      return { dados: jsonDoTexto<T>(final), fontes: [...fontes].map(([url, titulo]) => ({ url, titulo })) };
    }
    throw new IAError("A pesquisa na internet demorou demais. Tente com menos itens.");
  } catch (e) {
    if (e instanceof IAError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new IAError("Chave da API da Anthropic inválida (ANTHROPIC_API_KEY).");
    if (e instanceof Anthropic.RateLimitError) throw new IAError("Limite de uso da IA atingido. Tente de novo em alguns minutos.");
    if (e instanceof Anthropic.APIError) throw new IAError(`Erro da API da Anthropic (${e.status}). Tente de novo.`);
    throw e;
  }
}

export async function pesquisarNaWeb<T>(ia: IAEscolhida, sistema: string, texto: string): Promise<{ dados: T; fontes: Fonte[] }> {
  if (ia.provedor === "claude") return pesquisarComClaude<T>(sistema, texto);
  try {
    const r = await pesquisarComGemini(ia, sistema, texto);
    return { dados: jsonDoTexto<T>(r.texto), fontes: r.fontes };
  } catch (e) {
    if (e instanceof GeminiError) throw new IAError(e.message);
    if (e instanceof Error && e.name === "TimeoutError") throw new IAError("O Gemini demorou demais na pesquisa. Tente com menos itens.");
    throw e;
  }
}
