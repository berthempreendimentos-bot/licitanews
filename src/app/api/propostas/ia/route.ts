import { NextResponse } from "next/server";
import { gerarJsonIA, IAError, iaDoPedido } from "@/lib/iaServidor";
import { porExtenso, totais, totalItem } from "@/lib/proposta";
import type { DadosProposta, Proposta, RevisaoProposta } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Acao = "carta" | "descricoes" | "revisar";
type Corpo = {
  acao: Acao;
  proposta: Proposta;
  empresa: { razao_social: string; cnpj: string; dados_proposta?: DadosProposta };
};

const str = { type: "string" } as const;
const MAX_ITENS = 120;

const SISTEMA = `Você é especialista em propostas comerciais para licitações públicas brasileiras (Lei 14.133/2021, LC 123/2006).
Escreva em português formal e objetivo, como um fornecedor experiente. Use somente os dados fornecidos: não invente números,
certificações, características técnicas, prazos ou documentos. Quando faltar um dado essencial, escreva "[preencher: ...]" no lugar.`;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function contexto(p: Proposta, emp: Corpo["empresa"]) {
  const d = emp.dados_proposta;
  const t = totais(p);
  const itens = p.itens.filter((i) => i.participar).slice(0, MAX_ITENS);
  return [
    `EMPRESA: ${emp.razao_social || "[preencher: razão social]"} — CNPJ ${emp.cnpj || "[preencher: CNPJ]"}`,
    d && `Endereço: ${[d.endereco, d.cidade_uf, d.cep && `CEP ${d.cep}`].filter(Boolean).join(", ") || "não informado"} · Telefone: ${d.telefone || "não informado"} · E-mail: ${d.email || "não informado"}`,
    d && `Representante legal: ${d.representante || "não informado"}${d.cargo ? ` (${d.cargo})` : ""}${d.cpf_representante ? `, CPF ${d.cpf_representante}` : ""}`,
    d && (d.banco || d.agencia || d.conta) && `Dados bancários: banco ${d.banco || "-"}, agência ${d.agencia || "-"}, conta ${d.conta || "-"}`,
    "",
    `LICITAÇÃO: ${p.modalidade || "Licitação"} nº ${p.numeroLicitacao || "[preencher]"}${p.processo ? ` — processo ${p.processo}` : ""}`,
    `Órgão: ${p.orgao || "[preencher]"}`,
    `Objeto: ${p.titulo}`,
    "",
    `CONDIÇÕES: validade da proposta ${p.validadeDias} dias · prazo de entrega: ${p.prazoEntrega || "não informado"} · local: ${p.localEntrega || "não informado"}`,
    `Pagamento: ${p.condicoesPagamento || "não informado"} · garantia: ${p.garantia || "não informado"}`,
    p.observacoes && `Observações: ${p.observacoes}`,
    p.exigencias?.length ? `EXIGÊNCIAS DO EDITAL PARA A PROPOSTA:\n${p.exigencias.map((e) => `- ${e}`).join("\n")}` : "",
    "",
    `ITENS OFERTADOS (${t.participando}; total ${brl(t.total)} = ${porExtenso(t.total)}):`,
    ...itens.map((i) => `- Item ${i.numero}: ${i.descricao.slice(0, 400)} | ${i.quantidade} ${i.unidade} | marca ${i.marca || "-"} | modelo ${i.modelo || "-"}`
      + ` | preço unit. ${i.precoUnitario != null ? brl(i.precoUnitario) : "sem preço"} | estimado unit. ${i.valorEstimado != null ? brl(i.valorEstimado) : "-"}`
      + (i.precoUnitario != null ? ` | total ${brl(totalItem(i))}` : "")),
    t.participando > MAX_ITENS ? `(+${t.participando - MAX_ITENS} itens não listados)` : "",
  ].filter((l): l is string => typeof l === "string").join("\n");
}

const PEDIDOS: Record<Acao, { texto: string; schema: Record<string, unknown>; esforco: "medium" | "high" }> = {
  carta: {
    esforco: "medium",
    schema: { type: "object", properties: { texto: str }, required: ["texto"], additionalProperties: false },
    texto: `Escreva a CARTA-PROPOSTA (texto corrido, sem a tabela de itens, que vai anexa) para o pregoeiro/agente de contratação:
saudação; identificação da empresa e da licitação; declaração de que a proposta atende a todas as condições do edital;
valor global em algarismos e por extenso (use exatamente o total e o extenso informados); validade; prazo e local de entrega;
condições de pagamento e dados bancários (se informados); declarações exigidas para a proposta (se listadas acima);
fechamento com local, data ("[cidade], [data]") e espaço para assinatura do representante legal. Use parágrafos separados por linha em branco.`,
  },
  descricoes: {
    esforco: "medium",
    schema: {
      type: "object",
      properties: { itens: { type: "array", items: { type: "object", properties: { numero: { type: "integer" }, descricao_ofertada: str }, required: ["numero", "descricao_ofertada"], additionalProperties: false } } },
      required: ["itens"], additionalProperties: false,
    },
    texto: `Para cada item ofertado, escreva a DESCRIÇÃO DO PRODUTO/SERVIÇO OFERTADO que vai na proposta: comece com marca e modelo
(se informados) e descreva o item atendendo à descrição do edital, em até 3 frases. Não acrescente características que não estejam
na descrição do edital nem na marca/modelo; quando o edital exigir algo que depende do produto (ex.: certificação, potência),
mantenha a exigência do edital e acrescente "[confirmar no catálogo]". Devolva um elemento por item, com o mesmo número.`,
  },
  revisar: {
    esforco: "high",
    schema: {
      type: "object",
      properties: {
        pontos: {
          type: "array",
          items: { type: "object", properties: { gravidade: { type: "string", enum: ["alta", "media", "baixa"] }, ponto: str, sugestao: str }, required: ["gravidade", "ponto", "sugestao"], additionalProperties: false },
        },
      },
      required: ["pontos"], additionalProperties: false,
    },
    texto: `CONFIRA a proposta antes do envio e liste os problemas que podem causar desclassificação, prejuízo ou retrabalho:
preço acima do estimado (desclassificação provável), preço muito abaixo (risco de inexequibilidade, art. 59 da Lei 14.133),
itens sem preço, sem marca ou sem modelo, validade menor que a exigida, prazo/condições incoerentes com o edital,
exigências do edital para a proposta que não aparecem atendidas, dados da empresa faltando (representante, CNPJ, contato).
Gravidade "alta" para o que desclassifica. Seja objetivo; se estiver tudo certo, devolva uma lista vazia.`,
  },
};

/** POST /api/propostas/ia { acao, proposta, empresa } — carta-proposta, descrições dos itens ou conferência com IA. */
export async function POST(req: Request) {
  const escolha = iaDoPedido(req);
  if ("erro" in escolha) return NextResponse.json({ error: escolha.erro }, { status: escolha.status });
  const body = (await req.json().catch(() => null)) as Corpo | null;
  const pedido = body && PEDIDOS[body.acao];
  if (!body || !pedido || !body.proposta?.itens) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  if (!body.proposta.itens.some((i) => i.participar)) return NextResponse.json({ error: "Marque pelo menos um item para participar." }, { status: 400 });

  try {
    const r = await gerarJsonIA<{ texto?: string; itens?: { numero: number; descricao_ofertada: string }[]; pontos?: RevisaoProposta[] }>(escolha.ia, {
      sistema: SISTEMA,
      schema: pedido.schema,
      esforco: pedido.esforco,
      texto: `${contexto(body.proposta, body.empresa)}\n\nTAREFA:\n${pedido.texto}`,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof IAError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: "Falha ao falar com a IA. Tente de novo." }, { status: 500 });
  }
}
