import { preflight, resposta } from "@/lib/apiDados";

export const OPTIONS = preflight;

/**
 * GET /api/v1 — descrição OpenAPI 3.1 da API de dados (pública, sem chave).
 * Serve para importar no Postman/Insomnia ou registrar como ferramenta de um agente de IA.
 */
export function GET(req: Request) {
  const origem = new URL(req.url).origin;
  const filtroCodigo = { name: "codigo_compra", in: "query", schema: { type: "string", pattern: "^\\d{10,}$" }, description: "Código da compra no Comprasnet" };
  const filtroLimite = (padrao: number) => ({ name: "limite", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: padrao } });
  const filtroDesde = { name: "desde", in: "query", schema: { type: "string", format: "date-time" }, description: "Só registros gravados depois desta data" };
  const erros = {
    "401": { description: "Chave ausente ou inválida" },
    "503": { description: "Supabase não configurado no servidor" },
  };

  return resposta({
    openapi: "3.1.0",
    info: {
      title: "PEPPACORP LICITA — dados do monitoramento",
      version: "1.0.0",
      description:
        "Compras do Comprasnet (Compras.gov.br) em monitoramento, chat do pregoeiro capturado pelo robô e alertas. " +
        "Envie a chave da empresa (Configurações → chave de ingestão) no header x-api-key. " +
        "Chave de administrador lê as compras e mensagens de todos os usuários.",
    },
    servers: [{ url: `${origem}/api/v1` }],
    security: [{ chave: [] }],
    components: {
      securitySchemes: { chave: { type: "apiKey", in: "header", name: "x-api-key" } },
      schemas: {
        Compra: {
          type: "object",
          properties: {
            codigo_compra: { type: "string" }, titulo: { type: "string" }, link: { type: "string" },
            status: { type: "string", enum: ["Aguardando captura", "Capturando", "Encerrado"] },
            orgao: { type: "string" }, municipio: { type: "string" }, uf: { type: "string" }, objeto: { type: "string" },
            mensagens: { type: "integer" }, ultima_captura: { type: ["string", "null"], format: "date-time" },
            usuarios: { type: "integer", description: "Só para chave de administrador" },
          },
        },
        Mensagem: {
          type: "object",
          properties: {
            id: { type: "string" }, codigo_compra: { type: "string" }, remetente: { type: "string" }, texto: { type: "string" },
            data_hora: { type: ["string", "null"], description: "Data/hora informada pelo portal" },
            evento: { type: ["string", "null"], description: "Evento detectado (convocação, prazo, etc.)" },
            item: { type: ["string", "null"] }, gravada_em: { type: "string", format: "date-time" },
          },
        },
        Alerta: {
          type: "object",
          properties: {
            id: { type: "string" }, tipo: { type: "string" }, titulo: { type: "string" }, mensagem: { type: "string" },
            prioridade: { type: "string", enum: ["Alta", "Média", "Baixa"] }, lido: { type: "boolean" },
            ref: { type: ["string", "null"], description: "Código da compra" }, created_at: { type: "string", format: "date-time" },
          },
        },
      },
    },
    paths: {
      "/compras": {
        get: {
          operationId: "listarCompras",
          summary: "Compras em monitoramento no Comprasnet (capturadas mais recentemente primeiro)",
          parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["Aguardando captura", "Capturando", "Encerrado"] } }],
          responses: {
            "200": {
              description: "Lista de compras",
              content: { "application/json": { schema: { type: "object", properties: { total: { type: "integer" }, compras: { type: "array", items: { $ref: "#/components/schemas/Compra" } } } } } },
            },
            ...erros,
          },
        },
      },
      "/mensagens": {
        get: {
          operationId: "listarMensagens",
          summary: "Chat do pregoeiro capturado (gravação mais antiga primeiro). Pagine com proximo_cursor.",
          parameters: [
            filtroCodigo, filtroDesde,
            { name: "cursor", in: "query", schema: { type: "string" }, description: "proximo_cursor da resposta anterior" },
            filtroLimite(200),
          ],
          responses: {
            "200": {
              description: "Mensagens",
              content: { "application/json": { schema: { type: "object", properties: { total: { type: "integer" }, proximo_cursor: { type: ["string", "null"] }, mensagens: { type: "array", items: { $ref: "#/components/schemas/Mensagem" } } } } } },
            },
            "400": { description: "codigo_compra ou cursor inválido" },
            ...erros,
          },
        },
      },
      "/alertas": {
        get: {
          operationId: "listarAlertas",
          summary: "Alertas do chat do dono da chave (mais novos primeiro)",
          parameters: [filtroCodigo, filtroDesde, filtroLimite(100)],
          responses: {
            "200": {
              description: "Alertas",
              content: { "application/json": { schema: { type: "object", properties: { total: { type: "integer" }, alertas: { type: "array", items: { $ref: "#/components/schemas/Alerta" } } } } } },
            },
            ...erros,
          },
        },
      },
    },
  });
}
