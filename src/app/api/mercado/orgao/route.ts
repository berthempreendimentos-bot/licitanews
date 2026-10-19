import { NextResponse } from "next/server";
import { buscarContratos, contratosPeriodo, panorama, soDigitos } from "@/lib/mercado";
import { fetchAbertas } from "@/lib/pncp";
import type { Opportunity } from "@/lib/types";

export const maxDuration = 60;

/**
 * GET /api/mercado/orgao?cnpj=07954480000179 — perfil de compras de um órgão:
 * contratos dos últimos 12 meses (até 1.500) + licitações abertas agora.
 * GET /api/mercado/orgao?nome=prefeitura de campinas — encontra órgãos pelo nome.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const nome = (sp.get("nome") || "").trim();
  const cnpj = soDigitos(sp.get("cnpj") || "");
  const nomeBusca = (sp.get("nomeOrgao") || "").trim();

  try {
    if (nome) {
      const r = await buscarContratos(nome, 1);
      const m = new Map<string, { cnpj: string; nome: string; uf: string; municipio: string }>();
      for (const c of r.items) if (c.orgaoCnpj && !m.has(c.orgaoCnpj)) m.set(c.orgaoCnpj, { cnpj: c.orgaoCnpj, nome: c.orgao, uf: c.uf, municipio: c.municipio });
      return NextResponse.json({ orgaos: [...m.values()].slice(0, 15) });
    }
    if (cnpj.length !== 14) return NextResponse.json({ error: "Informe o CNPJ do órgão (14 dígitos)." }, { status: 400 });

    const fim = new Date();
    const inicio = new Date(fim.getTime() - 365 * 86400000);
    const [contratos, ...abertas] = await Promise.all([
      contratosPeriodo(inicio, fim, { cnpjOrgao: cnpj, maxPaginas: 3 }),
      ...[6, 8, 4].map((m) => fetchAbertas({ modalidade: m, cnpj, tamanho: 50 }).catch(() => null)),
    ]);
    if (contratos.falhou) throw new Error("O PNCP não respondeu. Tente de novo em instantes.");
    const licitacoes: Opportunity[] = abertas.flatMap((a) => a?.items ?? [])
      .sort((a, b) => (a.encerramento ?? "9").localeCompare(b.encerramento ?? "9"));
    // Sem contratos nos últimos 12 meses: procura os mais antigos do órgão na busca do PNCP.
    let itens = contratos.items;
    let periodo: "12m" | "todos" = "12m";
    if (itens.length === 0) {
      const antigos = await buscarContratos(cnpj, 3);
      itens = antigos.items.filter((c) => c.orgaoCnpj === cnpj);
      periodo = "todos";
    }
    const nomeOrgao = itens[0]?.orgao || licitacoes[0]?.orgao || nomeBusca || "";
    return NextResponse.json({
      cnpj,
      nome: nomeOrgao,
      periodo,
      totalContratos12m: contratos.total,
      licitacoesAbertas: licitacoes,
      lista: [...itens].sort((a, b) => (b.assinatura ?? "").localeCompare(a.assinatura ?? "")),
      ...panorama(itens),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
