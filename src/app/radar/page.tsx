"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Plus, Trash2, X } from "lucide-react";
import { Empty, OpportunityCard, PageHeader } from "@/components/ui";
import { db, newId, useCollection } from "@/lib/store";
import { MODALIDADES, UFS } from "@/lib/pncp";
import { nowIso } from "@/lib/format";
import type { Opportunity, RadarProfile } from "@/lib/types";

function ProfileForm({ onClose }: { onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [termos, setTermos] = useState("");
  const [ufs, setUfs] = useState<string[]>([]);
  const [mods, setMods] = useState<number[]>([6, 8]);
  const [vmin, setVmin] = useState("");
  const [vmax, setVmax] = useState("");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="card w-full max-w-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const p: RadarProfile = {
            id: newId(),
            nome: nome.trim(),
            termos: termos.split(",").map((t) => t.trim()).filter(Boolean),
            ufs,
            modalidades: mods.length ? mods : [6],
            valor_min: vmin ? Number(vmin) : null,
            valor_max: vmax ? Number(vmax) : null,
            ativo: true,
            created_at: nowIso(),
          };
          db.upsert("radar_profiles", p);
          onClose();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-brand">Novo perfil do radar</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <input className="input" placeholder="Nome (ex.: Cliente X — material hospitalar)" required value={nome} onChange={(e) => setNome(e.target.value)} />
        <input className="input" placeholder="Termos separados por vírgula" required value={termos} onChange={(e) => setTermos(e.target.value)} />
        <div>
          <div className="text-xs font-semibold text-muted mb-1.5">UFs (vazio = todas; até 3)</div>
          <div className="flex flex-wrap gap-1">
            {UFS.map((u) => {
              const on = ufs.includes(u);
              return (
                <button type="button" key={u} onClick={() => setUfs(on ? ufs.filter((x) => x !== u) : [...ufs, u].slice(-3))}
                  className={`badge border !px-2 ${on ? "bg-accent text-white border-accent" : "border-border text-muted"}`}>{u}</button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted mb-1.5">Modalidades</div>
          <div className="flex flex-wrap gap-1.5">
            {MODALIDADES.map((m) => {
              const on = mods.includes(m.id);
              return (
                <button type="button" key={m.id} onClick={() => setMods(on ? mods.filter((x) => x !== m.id) : [...mods, m.id].slice(-4))}
                  className={`badge border !px-2.5 !py-1 ${on ? "bg-accent text-white border-accent" : "border-border text-muted"}`}>{m.nome}</button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="Valor mínimo" inputMode="numeric" value={vmin} onChange={(e) => setVmin(e.target.value.replace(/\D/g, ""))} />
          <input className="input" placeholder="Valor máximo" inputMode="numeric" value={vmax} onChange={(e) => setVmax(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="flex justify-end"><button className="btn btn-primary">Criar perfil</button></div>
      </form>
    </div>
  );
}

async function runProfile(p: RadarProfile): Promise<Opportunity[]> {
  const ufs = p.ufs.length ? p.ufs : [""];
  const all = await Promise.all(
    ufs.map(async (uf) => {
      const params = new URLSearchParams({ modalidades: p.modalidades.join(","), q: p.termos.join(",") });
      if (uf) params.set("uf", uf);
      if (p.valor_min != null) params.set("valorMin", String(p.valor_min));
      if (p.valor_max != null) params.set("valorMax", String(p.valor_max));
      const r = await fetch(`/api/oportunidades?${params}`);
      const d = await r.json();
      return (d.items ?? []) as Opportunity[];
    }),
  );
  const seen = new Set<string>();
  return all.flat().filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
}

export default function RadarPage() {
  const { items: profiles } = useCollection("radar_profiles");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Opportunity[]>>({});
  const [loading, setLoading] = useState(false);

  const active = profiles.find((p) => p.id === selected) ?? profiles.find((p) => p.ativo) ?? null;

  useEffect(() => {
    if (!active || results[active.id]) return;
    setLoading(true);
    runProfile(active)
      .then((items) => setResults((r) => ({ ...r, [active.id]: items })))
      .finally(() => setLoading(false));
  }, [active, results]);

  const list = active ? results[active.id] : undefined;

  return (
    <>
      <PageHeader
        title="Radar de Oportunidades"
        tag="Filtros"
        subtitle="Perfis de busca por cliente ou nicho: capture apenas o que importa"
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={14} /> Novo perfil</button>}
      />
      {profiles.length === 0 ? (
        <Empty title="Radar inativo" text="Crie um perfil com termos, UFs, modalidades e faixa de valor. O radar varre as licitações abertas no PNCP." action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Criar perfil</button>} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <div className="space-y-2">
            {profiles.map((p) => (
              <div key={p.id} onClick={() => setSelected(p.id)}
                className={`card p-3 cursor-pointer ${active?.id === p.id ? "border-accent ring-2 ring-accent-soft" : ""} ${p.ativo ? "" : "opacity-60"}`}>
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-sm flex-1 truncate">{p.nome}</div>
                  <button aria-label={p.ativo ? "Pausar" : "Ativar"} onClick={(e) => { e.stopPropagation(); db.update("radar_profiles", p.id, { ativo: !p.ativo }); }} className="text-muted hover:text-accent">
                    {p.ativo ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button aria-label="Excluir" onClick={(e) => { e.stopPropagation(); if (confirm(`Excluir o perfil "${p.nome}"?`)) db.remove("radar_profiles", p.id); }} className="text-muted hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-1 text-xs text-muted line-clamp-2">{p.termos.join(", ")}</div>
                <div className="mt-1 text-[11px] text-muted">{p.ufs.length ? p.ufs.join(", ") : "Todas UFs"}{results[p.id] ? ` · ${results[p.id].length} matches` : ""}</div>
              </div>
            ))}
          </div>
          <div>
            {loading && <div className="card p-6 text-sm text-muted">Vasculhando o PNCP…</div>}
            {!loading && list && list.length === 0 && <Empty title="Nenhum match agora" text="Tente termos mais amplos ou mais UFs." />}
            <div className="grid gap-3 xl:grid-cols-2">
              {!loading && list?.map((o) => <OpportunityCard key={o.id} o={o} />)}
            </div>
          </div>
        </div>
      )}
      {creating && <ProfileForm onClose={() => setCreating(false)} />}
    </>
  );
}
