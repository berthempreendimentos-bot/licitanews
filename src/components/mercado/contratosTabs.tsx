"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Empty, StatCard } from "@/components/ui";
import { brl } from "@/lib/format";
import type { Contrato, Panorama } from "@/lib/mercado";
import { Bars, ContratosTable, fmtCnpj, Status, UfSelect, useApi } from "./shared";

type RaioX = Panorama & { fonte: string; totalNoPncp: number };
type Fornecedor = Panorama & { cnpj: string; nome: string; totalNoPncp: number };
type Row = Contrato & { diasRestantes?: number | null };

// ------------------------------------------------------------------ Raio-X de Mercado
export function RaioXTab({ onPickFornecedor }: { onPickFornecedor: (cnpj: string) => void }) {
  const [q, setQ] = useState("");
  const [uf, setUf] = useState("");
  const { data, loading, error, run } = useApi<RaioX>();
  const go = (term: string, estado: string) => {
    const p = new URLSearchParams();
    if (term.trim()) p.set("q", term.trim());
    if (estado) p.set("uf", estado);
    void run(`/api/mercado/raiox?${p}`);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { go("", ""); }, []);

  return (
    <>
      <form className="card p-4 mb-4 grid gap-3 sm:grid-cols-[1fr_130px_auto]" onSubmit={(e) => { e.preventDefault(); go(q, uf); }}>
        <input className="input" placeholder="Produto, serviço ou órgão (ex.: merenda escolar, locação de veículos)" value={q} onChange={(e) => setQ(e.target.value)} />
        <UfSelect value={uf} onChange={setUf} />
        <button className="btn btn-primary justify-center" disabled={loading}><Search size={14} /> Analisar</button>
      </form>
      <Status loading={loading} error={error} />
      {data && !loading && (
        <>
          <p className="mb-3 text-xs text-muted">
            Base: {data.fonte}{uf ? ` · filtrado para ${uf}` : ""}
            {data.totalNoPncp > data.contratos ? ` · ${data.totalNoPncp.toLocaleString("pt-BR")} no PNCP no total` : ""}
          </p>
          {data.contratos === 0 ? <Empty title="Nenhum contrato encontrado" text="Tente outro termo ou remova o filtro de UF." /> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                <StatCard label="Contratos" value={data.contratos.toLocaleString("pt-BR")} />
                <StatCard label="Valor movimentado" value={brl(data.valorTotal, true)} />
                <StatCard label="Empresas vencedoras" value={data.fornecedores} />
                <StatCard label="Órgãos compradores" value={data.compradores} />
                <StatCard label="Valor médio" value={brl(data.valorMedio, true)} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2 mb-4">
                <Bars title="Maiores fornecedores" data={data.topFornecedores} onPick={(r) => onPickFornecedor(r.chave)} pickHint="Ver contratos deste fornecedor" />
                <Bars title="Maiores compradores" data={data.topCompradores} />
              </div>
              <ContratosTable title="Contratos mais recentes" items={data.recentes} />
            </>
          )}
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------------- Contratos
export function ContratosTab() {
  const [q, setQ] = useState("");
  const [uf, setUf] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const { data, loading, error, run } = useApi<{ items: Contrato[]; totalNoPncp: number; base: string }>();
  const go = () => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (uf) p.set("uf", uf);
    if (min) p.set("valorMin", min);
    if (max) p.set("valorMax", max);
    void run(`/api/mercado/contratos?${p}`);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { go(); }, []);

  return (
    <>
      <form className="card p-4 mb-4 grid gap-3 md:grid-cols-[1fr_120px_140px_140px_auto]" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input className="input" placeholder="Objeto, órgão ou CNPJ (vazio = publicados ontem)" value={q} onChange={(e) => setQ(e.target.value)} />
        <UfSelect value={uf} onChange={setUf} />
        <input className="input" placeholder="Valor mín." inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} />
        <input className="input" placeholder="Valor máx." inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} />
        <button className="btn btn-primary justify-center" disabled={loading}><Search size={14} /> Buscar</button>
      </form>
      <Status loading={loading} error={error} />
      {data && !loading && (
        data.items.length === 0 ? <Empty title="Nenhum contrato encontrado" /> : (
          <>
            <p className="mb-3 text-xs text-muted">Base: {data.base} · {data.totalNoPncp.toLocaleString("pt-BR")} no PNCP · mostrando até 500 mais recentes</p>
            <ContratosTable title="Contratos" items={data.items} />
          </>
        )
      )}
    </>
  );
}

// ---------------------------------------------------------------- Grandes Contratos
export function GrandesTab() {
  const [dias, setDias] = useState("3");
  const [min, setMin] = useState("5000000");
  const [uf, setUf] = useState("");
  const { data, loading, error, run } = useApi<{ items: Contrato[]; analisados: number; totalNoPeriodo: number; periodo: string }>();
  const go = () => {
    const p = new URLSearchParams({ dias, min: min || "0" });
    if (uf) p.set("uf", uf);
    void run(`/api/mercado/grandes?${p}`);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { go(); }, []);
  const soma = data?.items.reduce((a, c) => a + c.valor, 0) ?? 0;

  return (
    <>
      <form className="card p-4 mb-4 grid gap-3 sm:grid-cols-[160px_200px_130px_auto]" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <select className="input" value={dias} onChange={(e) => setDias(e.target.value)}>
          {["1", "2", "3", "5", "7"].map((d) => <option key={d} value={d}>Últimos {d} dia{d === "1" ? "" : "s"}</option>)}
        </select>
        <select className="input" value={min} onChange={(e) => setMin(e.target.value)}>
          {[["1000000", "Acima de R$ 1 milhão"], ["5000000", "Acima de R$ 5 milhões"], ["10000000", "Acima de R$ 10 milhões"], ["50000000", "Acima de R$ 50 milhões"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <UfSelect value={uf} onChange={setUf} />
        <button className="btn btn-primary justify-center" disabled={loading}><Search size={14} /> Buscar</button>
      </form>
      <Status loading={loading} error={error} msg="Varrendo os contratos publicados no período… (até 1 minuto)" />
      {data && !loading && (
        <>
          <p className="mb-3 text-xs text-muted">
            Período {data.periodo} · {data.analisados.toLocaleString("pt-BR")} contratos analisados
            {data.totalNoPeriodo > data.analisados ? ` de ${data.totalNoPeriodo.toLocaleString("pt-BR")} publicados (limite de 10.000 por consulta)` : ""}
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4 max-w-xl">
            <StatCard label="Grandes contratos" value={data.items.length} />
            <StatCard label="Soma" value={brl(soma, true)} />
          </div>
          {data.items.length === 0 ? <Empty title="Nenhum contrato acima do valor no período" /> :
            <ContratosTable title="Maiores contratos" items={data.items} defaultSort="valor" />}
        </>
      )}
    </>
  );
}

// -------------------------------------------------------------- Radar de Renovação
export function RenovacaoTab() {
  const [q, setQ] = useState("");
  const [uf, setUf] = useState("");
  const [dias, setDias] = useState("90");
  const { data, loading, error, run } = useApi<{ items: Row[]; analisados: number; totalNoPncp: number }>();
  const go = () => {
    if (!q.trim()) return;
    const p = new URLSearchParams({ q: q.trim(), dias });
    if (uf) p.set("uf", uf);
    void run(`/api/mercado/renovacao?${p}`);
  };
  const soma = data?.items.reduce((a, c) => a + c.valor, 0) ?? 0;

  return (
    <>
      <form className="card p-4 mb-4 grid gap-3 sm:grid-cols-[1fr_130px_170px_auto]" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input className="input" placeholder="Seu produto ou serviço (ex.: vigilância, limpeza, locação de veículos)" value={q} onChange={(e) => setQ(e.target.value)} required />
        <UfSelect value={uf} onChange={setUf} />
        <select className="input" value={dias} onChange={(e) => setDias(e.target.value)}>
          {["30", "60", "90", "180", "365"].map((d) => <option key={d} value={d}>Vence em até {d} dias</option>)}
        </select>
        <button className="btn btn-primary justify-center" disabled={loading}><Search size={14} /> Buscar</button>
      </form>
      {!data && !loading && !error && (
        <Empty title="Contratos que vão vencer" text="Encontre contratos do seu ramo com vigência terminando em breve: o órgão vai precisar renovar ou abrir uma nova licitação. É a hora de se apresentar." />
      )}
      <Status loading={loading} error={error} />
      {data && !loading && (
        <>
          <p className="mb-3 text-xs text-muted">{data.analisados} contratos mais recentes analisados ({data.totalNoPncp.toLocaleString("pt-BR")} no PNCP com o termo)</p>
          <div className="grid grid-cols-2 gap-3 mb-4 max-w-xl">
            <StatCard label="Vencendo no período" value={data.items.length} />
            <StatCard label="Valor em renovação" value={brl(soma, true)} />
          </div>
          {data.items.length === 0 ? <Empty title="Nenhum contrato vencendo no período" text="Aumente o prazo ou use um termo mais amplo." /> :
            <ContratosTable title="Contratos a vencer" items={data.items} cols={["objeto", "fornecedor", "comprador", "valor", "vigencia"]} defaultSort="vigencia" />}
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------ Concorrente por CNPJ
export function FornecedorTab({ initial }: { initial: string }) {
  const [cnpj, setCnpj] = useState(initial);
  const { data, loading, error, run } = useApi<Fornecedor>();
  const go = (v: string) => {
    if (v.replace(/\D/g, "").length !== 14) return;
    void run(`/api/mercado/fornecedor?cnpj=${v.replace(/\D/g, "")}`);
  };
  useEffect(() => {
    if (initial) { setCnpj(fmtCnpj(initial)); go(initial); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const periodo = data && data.porAno.length ? `${data.porAno[0].chave}–${data.porAno[data.porAno.length - 1].chave}` : "—";

  return (
    <>
      <form className="card p-4 mb-4 flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); go(cnpj); }}>
        <input className="input" placeholder="CNPJ do concorrente" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        <button className="btn btn-primary shrink-0 justify-center" disabled={loading}><Search size={14} /> Consultar</button>
      </form>
      <Status loading={loading} error={error} msg="Buscando contratos do fornecedor no PNCP…" />
      {!data && !loading && !error && (
        <Empty title="Analise um concorrente" text="Informe o CNPJ para ver contratos, valores, compradores e período de atuação. Você também pode clicar em um fornecedor no Raio-X." />
      )}
      {data && !loading && (
        data.contratos === 0 ? <Empty title="Nenhum contrato encontrado para este CNPJ" text="O PNCP só tem contratos publicados a partir de 2021 (Lei 14.133)." /> : (
          <>
            <div className="mb-3">
              <div className="text-lg font-extrabold text-brand">{data.nome}</div>
              <div className="text-xs text-muted">CNPJ {fmtCnpj(data.cnpj)} · base: até 500 contratos mais recentes no PNCP</div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <StatCard label="Contratos" value={data.contratos} />
              <StatCard label="Valor contratado" value={brl(data.valorTotal, true)} />
              <StatCard label="Compradores distintos" value={data.compradores} />
              <StatCard label="Período" value={periodo} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2 mb-4">
              <Bars title="Principais compradores" data={data.topCompradores} />
              <div className="space-y-4">
                <Bars title="Por ano" data={data.porAno} />
                <Bars title="Por estado" data={data.porUf.slice(0, 8)} />
              </div>
            </div>
            <ContratosTable title="Contratos mais recentes" items={data.recentes} cols={["objeto", "comprador", "valor", "assinatura"]} />
          </>
        )
      )}
    </>
  );
}
