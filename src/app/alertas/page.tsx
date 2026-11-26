"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, CheckCheck, Trash2 } from "lucide-react";
import { Empty, PageHeader } from "@/components/ui";
import { corEvento, EventoTag } from "@/components/EventoTag";
import { db, useCollection, useEmpresa } from "@/lib/store";
import { alertaCorrespondeConfig, alertasDaEmpresa } from "@/lib/monitor";
import { dataBR } from "@/lib/format";

const PRIO: Record<string, string> = { Alta: "bg-danger/12 text-danger", Média: "bg-warn/15 text-warn", Baixa: "bg-neutral-200 text-neutral-600" };

export default function Alertas() {
  const { items } = useCollection("alerts");
  const { empresa } = useEmpresa();
  const cfg = alertasDaEmpresa(empresa);
  const [filtro, setFiltro] = useState<"todos" | "nao_lidos">("nao_lidos");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");

  // Filtra apenas os alertas que correspondem ao que o usuário escolheu em Alarme
  const alertasConfigurados = items.filter((a) => alertaCorrespondeConfig(a.tipo, cfg.eventos));
  const list = alertasConfigurados
    .filter((a) => (filtro === "todos" ? true : !a.lido))
    .filter((a) => (tipoFiltro === "todos" ? true : a.tipo === tipoFiltro));
  const unread = alertasConfigurados.filter((a) => !a.lido);

  const descricaoFiltro = cfg.eventos.length === 0
    ? "Nenhum alarme ativado"
    : cfg.eventos.length === 1 && cfg.eventos[0] === "Menção"
      ? "Mostrando apenas alertas de palavras-chave / menção"
      : `Mostrando alarmes ativos: ${cfg.eventos.join(", ")}`;

  return (
    <>
      <PageHeader
        title="Alertas"
        subtitle={`${unread.length} não lidos · ${alertasConfigurados.length} no total — ${descricaoFiltro}`}
        actions={
          <>
            <Link href="/monitoramento/alarme" className="btn btn-ghost">
              <BellRing size={14} /> Configurar alarmes
            </Link>
            <button className="btn btn-ghost" onClick={() => setFiltro(filtro === "todos" ? "nao_lidos" : "todos")}>
              {filtro === "todos" ? "Só não lidos" : "Ver todos"}
            </button>
            <select className="btn btn-ghost" value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
              <option value="todos">Todos os tipos</option>
              {cfg.eventos.map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
            <button className="btn btn-ghost" disabled={!unread.length} onClick={() => db.upsertMany("alerts", unread.map((a) => ({ ...a, lido: true })))}>
              <CheckCheck size={14} /> Marcar todos como lidos
            </button>
          </>
        }
      />

      {cfg.eventos.length === 0 ? (
        <Empty
          title="Nenhum evento ativo para alarmes"
          text="Você desmarcou todos os tipos de avisos na página de Alarme. Acesse a configuração para ativar as palavras-chave ou outros eventos que deseja monitorar."
          action={
            <Link href="/monitoramento/alarme" className="btn btn-primary">
              <BellRing size={14} /> Configurar alarmes
            </Link>
          }
        />
      ) : list.length === 0 ? (
        <Empty
          title={alertasConfigurados.length > 0 ? "Tudo em dia!" : "Nada por aqui"}
          text={
            alertasConfigurados.length > 0
              ? `Todos os ${alertasConfigurados.length} alerta(s) dos eventos selecionados já foram marcados como lidos.`
              : cfg.eventos.includes("Menção") && cfg.eventos.length === 1
                ? "Nenhum alerta de palavra-chave encontrado ainda. Os alertas surgirão quando uma de suas palavras-chave ou CNPJ for mencionado no chat."
                : "Nenhum alerta encontrado para os eventos selecionados no momento."
          }
          action={
            alertasConfigurados.length > 0 ? (
              <button className="btn btn-ghost" onClick={() => setFiltro("todos")}>
                Ver todos os alertas
              </button>
            ) : (
              <Link href="/monitoramento/alarme" className="btn btn-ghost">
                <BellRing size={14} /> Ajustar eventos do alarme
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {list.map((a) => (
            <div key={a.id} className={`card p-4 flex gap-3 ${a.lido ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {corEvento(a.tipo) ? <EventoTag evento={a.tipo} /> : <span className={`badge ${PRIO[a.prioridade] ?? ""}`}>{a.tipo}</span>}
                  <span className="font-semibold text-sm">{a.titulo}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{a.mensagem}</p>
                <div className="mt-1 text-[11px] text-muted">{dataBR(a.created_at, true)}</div>
              </div>
              <div className="flex flex-col gap-2">
                {!a.lido && <button className="text-xs text-accent font-semibold" onClick={() => db.update("alerts", a.id, { lido: true })}>Lido</button>}
                <button aria-label="Excluir" className="text-muted hover:text-danger" onClick={() => db.remove("alerts", a.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
