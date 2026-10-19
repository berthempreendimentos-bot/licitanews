"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { Empty, OpportunityCard, StatCard } from "@/components/ui";
import { brl, dataBR } from "@/lib/format";
import type { AtaVencendo, Contrato, Panorama } from "@/lib/mercado";
import type { CapagMunicipio } from "@/lib/capag";
import type { PesquisaPreco } from "@/lib/precos";
import type { Opportunity } from "@/lib/types";
import { Bars, ContratosTable, fmtCnpj, Status, UfSelect, useApi } from "./shared";

// ------------------------------------------------------------------ CAPAG Municípios
type CapagResp = {
  fonte: string; atualizadoEm: string; url: string; totalMunicipios: number;
  distribuicao: { nota: string; total: number }[]; encontrados: number; municipios: CapagMunicipio[];
};
const NOTA_STYLE: Record<string, string> = {
  "A+": "bg-black text-white", A: "bg-black text-white", "B+": "bg-neutral-700 text-white", B: "bg-neutral-600 text-white",
  C: "bg-neutral-300 text-black", D: "bg-white text-black border border-black",
};
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export function CapagTab() {
  const [uf, setUf] = useState("");
  const [q, setQ] = useState("");
  const [nota, setNota] = useState("");
  const { data, loading, error, run } = useApi<CapagResp>();
  const go = (n = nota) => {
    const p = new URLSearchParams();
    if (uf) p.set("uf", uf);
    if (q.trim()) p.set("q", q.trim());
    if (n) p.set("nota", n);
    void run(`/api/mercado/capag?${p}`);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { go(); }, []);
  const total = data?.distribuicao.reduce((a, d) => a + d.total, 0) || 1;

  return (
    <>
      <div className="card p-4 mb-4 text-sm text-muted">
        A <b className="text-black">CAPAG</b> é a nota do Tesouro Nacional para a capacidade de pagamento do município.
        Notas <b className="text-black">A e B</b> indicam contas mais saudáveis (menor risco de atraso no pagamento ao fornecedor);
        <b className="text-black"> C e D</b>, mais risco. Indicadores: endividamento, poupança corrente e liquidez.
      </div>
      <form className="card p-4 mb-4 grid gap-3 sm:grid-cols-[1fr_130px_auto]" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input className="input" placeholder="Nome do município" value={q} onChange={(e) => setQ(e.target.value)} />
        <UfSelect value={uf} onChange={setUf} />
        <button className="btn btn-primary justify-center" disabled={loading}><Search size={14} /> Buscar</button>
      </form>
      <Status loading={loading} error={error} msg="Carregando a planilha CAPAG do Tesouro Nacional… (a primeira vez leva até 1 minuto)" />
      {data && !loading && (
        <>
          <p className="mb-3 text-xs text-muted">
            Fonte: Tesouro Transparente — {data.fonte} ·{" "}
            <a className="underline" href={data.url} target="_blank" rel="noreferrer">baixar planilha oficial</a>
          </p>
          <div className="card p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-brand">Distribuição das notas {uf ? `— ${uf}` : "— Brasil"}</h3>
              <span className="text-xs text-muted">{data.totalMunicipios.toLocaleString("pt-BR")} municípios</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {data.distribuicao.map((d) => (
                <button key={d.nota} onClick={() => { const n = nota === d.nota ? "" : d.nota; setNota(n); go(n); }}
                  className={`rounded-lg border p-2 text-center transition ${nota === d.nota ? "border-black ring-2 ring-black/10" : "border-border hover:border-black/40"}`}>
                  <div className={`badge mx-auto ${NOTA_STYLE[d.nota] ?? "bg-neutral-100 text-neutral-500"}`}>{d.nota}</div>
                  <div className="mt-1 text-lg font-extrabold">{d.total}</div>
                  <div className="text-[10px] text-muted">{((d.total / total) * 100).toFixed(0)}%</div>
                </button>
              ))}
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="font-bold text-brand">Municípios{nota ? ` com nota ${nota}` : ""}</div>
              <div className="text-xs text-muted">{data.encontrados} encontrados{data.encontrados > 300 ? " · mostrando 300" : ""}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="px-4 py-2">Município</th><th className="px-4 py-2">CAPAG</th>
                    <th className="px-4 py-2 text-right">Endividamento</th><th className="px-4 py-2 text-right">Poupança corrente</th>
                    <th className="px-4 py-2 text-right">Liquidez</th>
                  </tr>
                </thead>
                <tbody>
                  {data.municipios.map((m) => (
                    <tr key={m.ibge} className="border-b border-border last:border-0">
                      <td className="px-4 py-2"><div className="font-medium">{m.municipio}</div><div className="text-[11px] text-muted">{m.uf} · IBGE {m.ibge}</div></td>
                      <td className="px-4 py-2"><span className={`badge ${NOTA_STYLE[m.capag] ?? "bg-neutral-100 text-neutral-500"}`}>{m.capag}</span></td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">{pct(m.ind1)} <span className="text-[11px] text-muted">({m.nota1 || "—"})</span></td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">{pct(m.ind2)} <span className="text-[11px] text-muted">({m.nota2 || "—"})</span></td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">{pct(m.ind3)} <span className="text-[11px] text-muted">({m.nota3 || "—"})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Consultar Preços
export function PrecosTab() {
  const [codigo, setCodigo] = useState("");
  const [uf, setUf] = useState("");
  const [meses, setMeses] = useState("12");
  const { data, loading, error, run } = useApi<PesquisaPreco>();
  const go = () => {
    if (!codigo.replace(/\D/g, "")) return;
    const p = new URLSearchParams({ codigo: codigo.replace(/\D/g, ""), meses });
    if (uf) p.set("uf", uf);
    void run(`/api/mercado/precos?${p}`);
  };
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v < 10 ? 4 : 2 });

  return (
    <>
      <form className="card p-4 mb-4 grid gap-3 sm:grid-cols-[1fr_130px_150px_auto]" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input className="input" placeholder="Código CATMAT (material) ou CATSER (serviço), ex.: 461944" inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
        <UfSelect value={uf} onChange={setUf} />
        <select className="input" value={meses} onChange={(e) => setMeses(e.target.value)}>
          {["3", "6", "12", "24"].map((m) => <option key={m} value={m}>Últimos {m} meses</option>)}
        </select>
        <button className="btn btn-primary justify-center" disabled={loading}><Search size={14} /> Pesquisar</button>
      </form>
      {!data && !loading && !error && (
        <Empty title="Pesquisa de preços praticados"
          text="Informe o código do item no catálogo do governo para ver os preços homologados em compras públicas: mínimo, mediana, média e máximo, por estado e por fornecedor."
          action={<a className="btn btn-ghost" href="https://catalogo.compras.gov.br/cnbs-web/busca" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Descobrir o código no Catálogo de Compras</a>} />
      )}
      <Status loading={loading} error={error} msg="Consultando preços no Compras.gov.br…" />
      {data && !loading && (
        data.registros === 0 ? <Empty title="Nenhum preço encontrado" text="Confira o código ou amplie o período e a UF." /> : (
          <>
            <div className="mb-3">
              <div className="text-xs text-muted">{data.tipo === "material" ? "CATMAT" : "CATSER"} {data.codigo} · {data.registros} compras no período{data.totalNaFonte > data.registros ? ` (de ${data.totalNaFonte.toLocaleString("pt-BR")})` : ""}</div>
              <div className="mt-1 text-sm font-semibold line-clamp-2">{data.descricao}</div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <StatCard label="Menor preço" value={fmt(data.min)} />
              <StatCard label="Mediana" value={fmt(data.mediana)} accent />
              <StatCard label="Média" value={fmt(data.media)} />
              <StatCard label="Maior preço" value={fmt(data.max)} />
            </div>
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <div className="card p-4 h-fit">
                <h3 className="font-bold text-brand mb-2">Mediana por estado</h3>
                <ul className="space-y-1.5 text-sm">
                  {data.porUf.map((u) => (
                    <li key={u.uf} className="flex justify-between"><span>{u.uf || "—"} <span className="text-[11px] text-muted">({u.registros})</span></span><span className="font-semibold">{fmt(u.mediana)}</span></li>
                  ))}
                </ul>
              </div>
              <div className="card overflow-hidden">
                <div className="px-4 pt-4 pb-2 font-bold text-brand">Compras recentes</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                        <th className="px-4 py-2">Data</th><th className="px-4 py-2 text-right">Preço unit.</th><th className="px-4 py-2 text-right">Qtd.</th>
                        <th className="px-4 py-2">Fornecedor / marca</th><th className="px-4 py-2">Comprador</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.itens.slice(0, 100).map((x) => (
                        <tr key={x.id} className="border-b border-border last:border-0 align-top">
                          <td className="px-4 py-2 whitespace-nowrap text-muted">{dataBR(x.data)}</td>
                          <td className="px-4 py-2 text-right font-semibold whitespace-nowrap">{fmt(x.precoUnitario)}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">{x.quantidade.toLocaleString("pt-BR")} {x.unidade}</td>
                          <td className="px-4 py-2 max-w-[220px]"><div className="truncate">{x.fornecedor || "—"}</div>{x.marca && <div className="text-[11px] text-muted truncate">{x.marca}</div>}</td>
                          <td className="px-4 py-2 max-w-[240px]"><div className="truncate">{x.comprador}</div><div className="text-[11px] text-muted">{x.municipio}/{x.uf}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )
      )}
    </>
  );
}

// ------------------------------------------------------------ Inteligência por Órgão
type OrgaoResp = Panorama & { cnpj: string; nome: string; periodo: "12m" | "todos"; totalContratos12m: number; licitacoesAbertas: Opportunity[]; lista: Contrato[] };
type OrgaoBusca = { orgaos: { cnpj: string; nome: string; uf: string; municipio: string }[] };

export function OrgaoTab() {
  const [entrada, setEntrada] = useState("");
  const busca = useApi<OrgaoBusca>();
  const perfil = useApi<OrgaoResp>();
  const go = () => {
    const v = entrada.trim();
    if (!v) return;
    const digits = v.replace(/\D/g, "");
    if (digits.length === 14) void perfil.run(`/api/mercado/orgao?cnpj=${digits}`);
    else { perfil.reset(); void busca.run(`/api/mercado/orgao?nome=${encodeURIComponent(v)}`); }
  };
  const d = perfil.data;
  const [filtro, setFiltro] = useState<{ ni: string; nome: string } | null>(null);
  useEffect(() => setFiltro(null), [d]);
  useEffect(() => {
    if (filtro) document.getElementById("contratos-orgao")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [filtro]);

  return (
    <>
      <form className="card p-4 mb-4 flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input className="input" placeholder="Nome do órgão (ex.: prefeitura de campinas) ou CNPJ" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
        <button className="btn btn-primary shrink-0 justify-center" disabled={busca.loading || perfil.loading}><Search size={14} /> Buscar</button>
      </form>
      <Status loading={busca.loading} error={busca.error} msg="Procurando órgãos…" />
      {busca.data && !perfil.data && (
        <div className="card p-2 mb-4">
          {busca.data.orgaos.length === 0 && <div className="p-3 text-sm text-muted">Nenhum órgão encontrado. Tente outro nome ou o CNPJ.</div>}
          {busca.data.orgaos.map((o) => (
            <button key={o.cnpj} className="w-full text-left rounded-lg px-3 py-2 hover:bg-bg" onClick={() => { setEntrada(fmtCnpj(o.cnpj)); void perfil.run(`/api/mercado/orgao?cnpj=${o.cnpj}&nomeOrgao=${encodeURIComponent(o.nome)}`); }}>
              <div className="text-sm font-semibold">{o.nome}</div>
              <div className="text-[11px] text-muted">{fmtCnpj(o.cnpj)} · {o.municipio}/{o.uf}</div>
            </button>
          ))}
        </div>
      )}
      <Status loading={perfil.loading} error={perfil.error} msg="Montando o perfil de compras do órgão… (contratos dos últimos 12 meses)" />
      {!busca.data && !d && !perfil.loading && !busca.loading && (
        <Empty title="Perfil de compras de um órgão" text="Veja quanto o órgão contratou nos últimos 12 meses, de quem compra, o que compra e as licitações abertas agora." />
      )}
      {d && !perfil.loading && (
        <>
          <div className="mb-3">
            <div className="text-lg font-extrabold text-brand">{d.nome || fmtCnpj(d.cnpj)}</div>
            <div className="text-xs text-muted">CNPJ {fmtCnpj(d.cnpj)} · {d.periodo === "todos" ? "nenhum contrato publicado no PNCP nos últimos 12 meses — mostrando os contratos anteriores encontrados" : "contratos dos últimos 12 meses"}{d.periodo === "12m" && d.totalContratos12m > d.contratos ? ` (${d.contratos.toLocaleString("pt-BR")} mais recentes de ${d.totalContratos12m.toLocaleString("pt-BR")})` : ""}</div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label={d.periodo === "todos" ? "Contratos (anteriores)" : "Contratos (12 meses)"} value={(d.periodo === "todos" ? d.contratos : d.totalContratos12m).toLocaleString("pt-BR")} />
            <StatCard label="Valor analisado" value={brl(d.valorTotal, true)} />
            <StatCard label="Fornecedores" value={d.fornecedores} />
            <StatCard label="Licitações abertas" value={d.licitacoesAbertas.length} accent={d.licitacoesAbertas.length > 0} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <Bars title="De quem o órgão mais compra" data={d.topFornecedores} onPick={(r) => setFiltro({ ni: r.chave, nome: r.nome })} pickHint="Ver os contratos deste fornecedor" />
            <div className="card p-4">
              <h3 className="font-bold text-brand mb-3">Licitações abertas agora</h3>
              {d.licitacoesAbertas.length === 0 && <p className="text-sm text-muted">Nenhuma licitação com propostas abertas.</p>}
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {d.licitacoesAbertas.slice(0, 30).map((o) => <OpportunityCard key={o.id} o={o} />)}
              </div>
            </div>
          </div>
          <div id="contratos-orgao" className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Clique em um contrato para ver os detalhes e abrir os documentos.</span>
            {filtro && (
              <span className="badge bg-black text-white !py-1">
                Fornecedor: {filtro.nome}
                <button aria-label="Limpar filtro" onClick={() => setFiltro(null)} className="ml-1"><X size={12} /></button>
              </span>
            )}
          </div>
          <ContratosTable
            key={filtro?.ni ?? "todos"}
            title={filtro ? `Contratos com ${filtro.nome}` : d.periodo === "todos" ? "Contratos anteriores" : "Contratos dos últimos 12 meses"}
            items={filtro ? d.lista.filter((c) => c.fornecedorNi === filtro.ni) : d.lista}
            cols={["objeto", "fornecedor", "valor", "assinatura"]}
          />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Atas Esgotando
export function AtasTab() {
  const [q, setQ] = useState("");
  const [dias, setDias] = useState("60");
  const [adesao, setAdesao] = useState(false);
  const { data, loading, error, run } = useApi<{ items: AtaVencendo[]; encontradas: number; analisadas: number }>();
  const go = () => {
    const p = new URLSearchParams({ dias });
    if (q.trim()) p.set("q", q.trim());
    if (adesao) p.set("adesao", "1");
    void run(`/api/mercado/atas?${p}`);
  };
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [data]);
  const view = useMemo(() => data?.items.slice(page * 25, page * 25 + 25) ?? [], [data, page]);
  const pages = data ? Math.max(1, Math.ceil(data.items.length / 25)) : 1;

  return (
    <>
      <form className="card p-4 mb-4 grid gap-3 sm:grid-cols-[1fr_170px_auto_auto] items-center" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input className="input" placeholder="Produto ou serviço (opcional, ex.: medicamentos, pneus)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={dias} onChange={(e) => setDias(e.target.value)}>
          {["15", "30", "60", "90", "180"].map((d) => <option key={d} value={d}>Vence em até {d} dias</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <input type="checkbox" checked={adesao} onChange={(e) => setAdesao(e.target.checked)} className="accent-black" /> Só com adesão
        </label>
        <button className="btn btn-primary justify-center" disabled={loading}><Search size={14} /> Buscar</button>
      </form>
      {!data && !loading && !error && (
        <Empty title="Atas de registro de preço perto do fim"
          text="Ata vencendo significa nova licitação em breve. Enquanto vigente e com adesão permitida, outros órgãos ainda podem aderir (carona) — oportunidade para o fornecedor registrado." />
      )}
      <Status loading={loading} error={error} msg="Varrendo atas vigentes no PNCP… (até 30 segundos)" />
      {data && !loading && (
        <>
          <p className="mb-3 text-xs text-muted">{data.encontradas} atas vencendo · {data.analisadas.toLocaleString("pt-BR")} atas vigentes analisadas</p>
          {data.items.length === 0 ? <Empty title="Nenhuma ata vencendo com esses filtros" /> : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                      <th className="px-4 py-2">Objeto</th><th className="px-4 py-2">Órgão</th><th className="px-4 py-2">Vigência</th>
                      <th className="px-4 py-2">Adesão</th><th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {view.map((a) => (
                      <tr key={a.id} className="border-b border-border last:border-0 align-top">
                        <td className="px-4 py-2.5 max-w-[380px]"><div className="text-[11px] text-muted">{a.titulo}</div><div className="line-clamp-2">{a.objeto || "—"}</div></td>
                        <td className="px-4 py-2.5 max-w-[240px]"><div className="truncate">{a.orgao}</div><div className="text-[11px] text-muted truncate">{a.municipio}</div></td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div>{dataBR(a.vigenciaFim)}</div>
                          <span className={`badge mt-0.5 ${a.diasRestantes <= 15 ? "bg-black text-white" : "bg-neutral-200 text-neutral-700"}`}>{a.diasRestantes === 0 ? "vence hoje" : `em ${a.diasRestantes}d`}</span>
                        </td>
                        <td className="px-4 py-2.5">{a.adesao ? <span className="badge bg-neutral-200 text-black">Permite</span> : <span className="text-xs text-muted">Não</span>}</td>
                        <td className="px-2 py-2.5"><a href={a.link} target="_blank" rel="noreferrer" aria-label="Abrir no PNCP" className="text-muted hover:text-black"><ExternalLink size={14} /></a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
                  <button className="btn btn-ghost !py-1" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
                  <span className="text-xs text-muted">Página {page + 1} de {pages}</span>
                  <button className="btn btn-ghost !py-1" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
