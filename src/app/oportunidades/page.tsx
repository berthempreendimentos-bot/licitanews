"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Empty, OpportunityCard, PageHeader } from "@/components/ui";
import { MODALIDADES, UFS } from "@/lib/pncp";
import type { Opportunity } from "@/lib/types";

export default function Oportunidades() {
  const [q, setQ] = useState("");
  const [uf, setUf] = useState("");
  const [mods, setMods] = useState<number[]>([6, 8]);
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
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
      if (valorMin) params.set("valorMin", valorMin);
      if (valorMax) params.set("valorMax", valorMax);
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
    [q, uf, mods, valorMin, valorMax],
  );

  useEffect(() => {
    void buscar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = q.trim() || valorMin || valorMax;

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
        className="card p-4 mb-5 grid gap-3 md:grid-cols-[1fr_120px_140px_140px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar(1);
        }}
      >
        <input className="input" placeholder="Termos separados por vírgula (ex.: merenda, gêneros alimentícios)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={uf} onChange={(e) => setUf(e.target.value)}>
          <option value="">Todas UFs</option>
          {UFS.map((u) => <option key={u}>{u}</option>)}
        </select>
        <input className="input" placeholder="Valor mín." inputMode="numeric" value={valorMin} onChange={(e) => setValorMin(e.target.value.replace(/\D/g, ""))} />
        <input className="input" placeholder="Valor máx." inputMode="numeric" value={valorMax} onChange={(e) => setValorMax(e.target.value.replace(/\D/g, ""))} />
        <button className="btn btn-primary justify-center" disabled={loading}>
          <Search size={14} /> Buscar
        </button>
        <div className="md:col-span-5 flex flex-wrap gap-2">
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
        <Empty title="Nenhuma licitação encontrada" text="Ajuste os termos, a UF ou as modalidades. A busca por termo varre as 300 primeiras licitações abertas de cada modalidade." />
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
