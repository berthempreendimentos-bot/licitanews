"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Empty, OpportunityCard, PageHeader } from "@/components/ui";
import { MODALIDADES, UFS } from "@/lib/pncp";
import type { Opportunity } from "@/lib/types";

export default function Oportunidades() {
  const [q, setQ] = useState("");
  const [uf, setUf] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [cidades, setCidades] = useState<{ id: number; nome: string }[]>([]);
  const [mods, setMods] = useState<number[]>([6, 8]);
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [pagina, setPagina] = useState(1);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const buscar = useCallback(
    async (p = 1) => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ modalidades: mods.join(","), pagina: String(p) });
      if (q.trim()) params.set("q", q);
      if (uf) params.set("uf", uf);
      if (uf && municipio) params.set("municipio", municipio);
      if (valorMin) params.set("valorMin", valorMin);
      if (valorMax) params.set("valorMax", valorMax);
      if (dataInicio) params.set("dataInicio", dataInicio);
      if (dataFim) params.set("dataFim", dataFim);
      try {
        const r = await fetch(`/api/oportunidades?${params}`);
        const d = await r.json();
        if (d.error) setError(d.error);
        setItems(d.items ?? []);
        setTotal(d.total ?? 0);
        setPagina(p);
      } catch {
        setError("Falha ao consultar o PNCP.");
      } finally {
        setLoading(false);
      }
    },
    [q, uf, municipio, mods, valorMin, valorMax, dataInicio, dataFim],
  );

  // Lista de municípios da UF (IBGE) para o filtro por cidade
  useEffect(() => {
    setMunicipio("");
    setCidades([]);
    if (!uf) return;
    let ativo = true;
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
      .then((r) => r.json())
      .then((d: { id: number; nome: string }[]) => {
        if (ativo) setCidades(d.map((c) => ({ id: c.id, nome: c.nome })));
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [uf]);

  useEffect(() => {
    void buscar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = q.trim() || valorMin || valorMax || dataInicio || dataFim;

  return (
    <>
      <PageHeader
        title="Oportunidades"
        subtitle={loading ? "Consultando o PNCP…" : `${items.length} resultados${filtered ? " filtrados" : ""} · ${total.toLocaleString("pt-BR")} com propostas abertas nas modalidades escolhidas`}
        actions={
          <button className="btn btn-ghost" onClick={() => buscar(pagina)} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
        }
      />

      <form
        className="card p-4 mb-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar(1);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[1fr_130px_220px]">
          <div className="sm:col-span-2 md:col-span-1">
            <input
              className="input"
              placeholder="Termos separados por vírgula (ex.: merenda, gêneros alimentícios)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="input" value={uf} onChange={(e) => setUf(e.target.value)}>
            <option value="">Todas UFs</option>
            {UFS.map((u) => <option key={u}>{u}</option>)}
          </select>
          <select
            className="input"
            value={municipio}
            onChange={(e) => setMunicipio(e.target.value)}
            disabled={!uf}
            title={uf ? "Filtrar por cidade" : "Escolha uma UF para filtrar por cidade"}
          >
            <option value="">{uf ? (cidades.length ? "Todas as cidades" : "Carregando cidades…") : "Cidade (escolha a UF)"}</option>
            {cidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-2 md:grid-cols-[130px_130px_1fr_1fr_auto] items-end">
          <div>
            <label className="block text-[11px] font-semibold text-muted mb-1">Valor mín.</label>
            <input
              className="input"
              placeholder="R$ 0,00"
              inputMode="numeric"
              value={valorMin}
              onChange={(e) => setValorMin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted mb-1">Valor máx.</label>
            <input
              className="input"
              placeholder="Sem limite"
              inputMode="numeric"
              value={valorMax}
              onChange={(e) => setValorMax(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted mb-1">Abertura de (data inicial)</label>
            <input
              type="date"
              className="input text-xs"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted mb-1">Abertura até (data final)</label>
            <input
              type="date"
              className="input text-xs"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>
          <div className="col-span-2 sm:col-span-2 md:col-span-1 flex gap-2">
            <button className="btn btn-primary justify-center flex-1 md:flex-none h-[38px] px-5" disabled={loading}>
              <Search size={14} /> Buscar
            </button>
            {filtered && (
              <button
                type="button"
                className="btn btn-ghost h-[38px] px-3 text-xs"
                title="Limpar filtros"
                onClick={() => {
                  setQ("");
                  setValorMin("");
                  setValorMax("");
                  setDataInicio("");
                  setDataFim("");
                }}
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-border flex flex-wrap gap-2">
          {MODALIDADES.map((m) => {
            const on = mods.includes(m.id);
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => setMods(on ? mods.filter((x) => x !== m.id) : [...mods, m.id].slice(-4))}
                className={`badge !text-xs !px-3 !py-1 border ${on ? "bg-accent text-white border-accent" : "border-border text-muted"}`}
              >
                {m.nome}
              </button>
            );
          })}
        </div>
      </form>

      {error && <div className="card p-4 mb-4 text-sm text-danger">{error}</div>}
      {!loading && items.length === 0 && !error && (
        <Empty title="Nenhuma licitação encontrada" text="Ajuste os termos, a UF, a cidade ou as modalidades. A busca por termo varre as 300 primeiras licitações abertas de cada modalidade." />
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((o) => <OpportunityCard key={o.id} o={o} />)}
      </div>
      {!filtered && items.length > 0 && (
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn btn-ghost" disabled={pagina <= 1 || loading} onClick={() => buscar(pagina - 1)}>Anterior</button>
          <span className="btn">Página {pagina}</span>
          <button className="btn btn-ghost" disabled={loading} onClick={() => buscar(pagina + 1)}>Próxima</button>
        </div>
      )}
    </>
  );
}
