"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, Radar, MessageSquareText, KanbanSquare } from "lucide-react";
import { PageHeader, StatCard, OpportunityCard } from "@/components/ui";
import { useCollection, useEmpresa } from "@/lib/store";
import { brl, dataBR, diasAte } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

type Stats = { abertas: number; novasHoje: number; serie: { dia: string; total: number }[] };

function Chart({ serie }: { serie: Stats["serie"] }) {
  const max = Math.max(1, ...serie.map((s) => s.total));
  return (
    <div className="flex h-36 items-end gap-1.5">
      {serie.map((s) => (
        <div key={s.dia} className="group flex h-full flex-1 flex-col items-center gap-1" title={`${s.total} licitações`}>
          <div className="text-[10px] text-muted opacity-0 group-hover:opacity-100">{s.total}</div>
          <div className="flex w-full flex-1 items-end">
            <div className="w-full rounded-t-md bg-accent/80 group-hover:bg-accent" style={{ height: `${(s.total / max) * 100}%`, minHeight: 2 }} />
          </div>
          <div className="text-[9px] text-muted">{s.dia.slice(8, 10)}/{s.dia.slice(5, 7)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { empresa } = useEmpresa();
  const { items: cards } = useCollection("crm_cards");
  const { items: alerts } = useCollection("alerts");
  const { items: profiles } = useCollection("radar_profiles");
  const { items: pregoes } = useCollection("pregoes");
  const [stats, setStats] = useState<Stats | null>(null);
  const [ultimas, setUltimas] = useState<Opportunity[] | null>(null);

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then((d) => !d.error && setStats(d)).catch(() => {});
    fetch("/api/oportunidades?modalidades=6,8").then((r) => r.json()).then((d) => setUltimas((d.items ?? []).slice(0, 5))).catch(() => setUltimas([]));
  }, []);

  const ativos = cards.filter((c) => !["Ganhou", "Perdeu", "Arquivado"].includes(c.status));
  const pipeline = ativos.reduce((a, c) => a + (c.valor ?? 0), 0);
  const unread = alerts.filter((a) => !a.lido);
  const prazos = useMemo(
    () => ativos.filter((c) => { const d = diasAte(c.prazo); return d != null && d >= 0 && d <= 7; }),
    [ativos],
  );
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <PageHeader
        title={`Olá${empresa.razao_social ? `, ${empresa.razao_social.split(" ")[0]}` : ""} 👋`}
        subtitle={hoje.charAt(0).toUpperCase() + hoje.slice(1)}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Radar" value={profiles.filter((p) => p.ativo).length} hint="perfis ativos" />
        <StatCard label="Alertas" value={unread.length > 99 ? "99+" : unread.length} hint="não lidos" accent={unread.length > 0} />
        <StatCard label="Pregões monitorados" value={pregoes.filter((p) => p.status !== "Encerrado").length} hint="chat do pregoeiro" />
        <StatCard label="CRM ativo" value={ativos.length} hint={`${brl(pipeline, true)} em pipeline`} />
      </div>

      <div className="mt-5 card overflow-hidden">
        <div className="bg-brand px-5 py-4 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Mercado em tempo real · PNCP</div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-extrabold">{stats ? stats.abertas.toLocaleString("pt-BR") : "…"}</div>
              <div className="text-xs text-white/60">com propostas abertas</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold">{stats ? stats.novasHoje.toLocaleString("pt-BR") : "…"}</div>
              <div className="text-xs text-white/60">publicadas hoje</div>
            </div>
            <div className="hidden sm:block">
              <div className="text-2xl font-extrabold">3</div>
              <div className="text-xs text-white/60">modalidades acompanhadas</div>
            </div>
          </div>
        </div>
        <div className="p-5">
          <div className="text-sm font-semibold text-brand mb-3">Novas licitações por dia · últimos 14 dias</div>
          {stats ? <Chart serie={stats.serie} /> : <div className="h-36 grid place-items-center text-sm text-muted">Consultando o PNCP…</div>}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-brand">Encerrando em breve</h2>
            <Link href="/oportunidades" className="text-sm text-accent font-semibold">Ver todas</Link>
          </div>
          {ultimas === null && <div className="card p-6 text-sm text-muted">Consultando o PNCP… (o portal às vezes demora)</div>}
          {ultimas?.length === 0 && <div className="card p-6 text-sm text-muted">O PNCP não respondeu agora. Tente em Oportunidades.</div>}
          {ultimas?.map((o) => <OpportunityCard key={o.id} o={o} />)}
        </div>
        <div className="space-y-5">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-brand">Alertas recentes</h2>
              <Link href="/alertas" className="text-sm text-accent font-semibold">Ver todos</Link>
            </div>
            {alerts.length === 0 && <p className="text-sm text-muted">Nenhum alerta ainda.</p>}
            <ul className="space-y-2.5">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="text-sm">
                  <div className="font-semibold text-[13px]">{a.titulo}</div>
                  <div className="text-xs text-muted line-clamp-2">{a.mensagem}</div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4">
            <h2 className="font-bold text-brand mb-2">Prazos do CRM (7 dias)</h2>
            {prazos.length === 0 && <p className="text-sm text-muted">Nenhum prazo próximo.</p>}
            <ul className="space-y-2">
              {prazos.map((c) => (
                <li key={c.id} className="text-sm flex justify-between gap-2">
                  <span className="truncate">{c.titulo}</span>
                  <span className="text-xs text-muted shrink-0">{dataBR(c.prazo)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4">
            <h2 className="font-bold text-brand mb-3">Ações rápidas</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/oportunidades", label: "Buscar licitação", icon: Search },
                { href: "/radar", label: "Configurar radar", icon: Radar },
                { href: "/monitoramento", label: "Monitorar pregão", icon: MessageSquareText },
                { href: "/crm", label: "Abrir CRM", icon: KanbanSquare },
              ].map((a) => (
                <Link key={a.href} href={a.href} className="btn btn-ghost justify-center flex-col !py-3 text-center">
                  <a.icon size={18} className="text-accent" />
                  <span className="text-xs">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
