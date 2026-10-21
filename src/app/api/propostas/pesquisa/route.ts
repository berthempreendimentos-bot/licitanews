import { NextResponse } from "next/server";
import { referenciaPncp } from "@/lib/referenciaPncp";
import { IAError, iaDoPedido, pesquisarNaWeb } from "@/lib/iaServidor";

export const runtime = "nodejs";
export const maxDuration = 300;

type ItemPedido = { numero: number; descricao: string; unidade: string };
type MercadoIA = { itens: { numero: number; marcas: { marca: string; modelo?: string; observacao?: string }[]; preco_medio: number | null; observacao: string }[] };

const SISTEMA = `Você pesquisa produtos para fornecedores de licitações públicas no Brasil. Use a busca na web para achar
marcas que existem no mercado brasileiro e atendem à descrição, e preços praticados (atacado/distribuidor quando houver; senão varejo).
Não invente marcas nem preços: se não encontrar, devolva lista vazia e preço null. Responda SOMENTE com o JSON pedido, sem texto antes ou depois.`;

/**
 * POST /api/propostas/pesquisa
 *  { modo: "pncp", item: { descricao, unidade }, excluir? }  → preço de referência em contratações similares (PNCP)
 *  { modo: "mercado", itens: [{ numero, descricao, unidade }] } → marcas e preço médio pesquisados na internet pela IA
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { modo: "pncp"; item: ItemPedido; excluir?: string | null }
    | { modo: "mercado"; itens: ItemPedido[] }
    | null;
  if (!body) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  if (body.modo === "pncp") {
    if (!body.item?.descricao) return NextResponse.json({ error: "Item sem descrição." }, { status: 400 });
    try {
      return NextResponse.json({ ok: true, ref: await referenciaPncp(body.item.descricao, body.item.unidade || "", body.excluir) });
    } catch {
      return NextResponse.json({ error: "O PNCP não respondeu. Tente de novo." }, { status: 502 });
    }
  }

  if (body.modo === "mercado") {
    const escolha = iaDoPedido(req);
    if ("erro" in escolha) return NextResponse.json({ error: escolha.erro }, { status: escolha.status });
    const itens = (body.itens ?? []).slice(0, 15);
    if (!itens.length) return NextResponse.json({ error: "Nenhum item para pesquisar." }, { status: 400 });
    const texto = `Pesquise cada item abaixo (licitação pública no Brasil):
${itens.map((i) => `- Item ${i.numero} (preço por ${i.unidade || "unidade"}): ${i.descricao.slice(0, 500)}`).join("\n")}

Para cada item, devolva até 4 marcas (com modelo/linha quando fizer sentido) vendidas no Brasil que atendam à descrição,
e o preço médio unitário em reais NA MESMA UNIDADE do item (ex.: por kg, por caixa). Responda neste formato JSON:
{"itens":[{"numero":1,"marcas":[{"marca":"...","modelo":"...","observacao":"..."}],"preco_medio":12.34,"observacao":"como o preço foi obtido (ex.: média de 3 lojas, preço por kg)"}]}`;
    try {
      const { dados, fontes, semBusca } = await pesquisarNaWeb<MercadoIA>(escolha.ia, SISTEMA, texto);
      // Sem a busca no Google (cota esgotada): marcas sugeridas pela IA; preço não, que viria da memória dela.
      const itensR = semBusca
        ? (dados.itens ?? []).map((i) => ({ ...i, preco_medio: null, observacao: "Sugestão da IA sem busca na web (cota de busca do Gemini esgotada) — confira a marca e o preço." }))
        : dados.itens ?? [];
      return NextResponse.json({ ok: true, itens: itensR, fontes: fontes.slice(0, 20), semBusca: !!semBusca });
    } catch (e) {
      if (e instanceof IAError) return NextResponse.json({ error: e.message }, { status: 422 });
      return NextResponse.json({ error: "Falha na pesquisa com IA. Tente de novo." }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
}
