"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2, Play, RefreshCw, ShieldCheck, Square } from "lucide-react";
import { Empty, PageHeader, StatCard } from "@/components/ui";
import { SomenteAdmin } from "@/components/SomenteAdmin";
import {
  ABAS_POR_JANELA, carregar, iniciar, inicioAutomatico, JANELAS, pararCiclo, setInicioAutomatico,
  TAMANHO_LOTE, TEMPO_LIMITE_MS, useCiclo, VERIFICAR_NOVAS_MS, type EstadoCiclo,
} from "@/lib/cicloAdmin";
import { dataBR } from "@/lib/format";

const ROTULO: Record<EstadoCiclo, { texto: string; cor: string }> = {
  fila: { texto: "Na fila", cor: "bg-bg text-muted" },
  abrindo: { texto: "Abrindo…", cor: "bg-warn/15 text-warn" },
  capturando: { texto: "Capturando…", cor: "bg-accent-soft text-accent" },
  captcha: { texto: "Captcha no portal", cor: "bg-warn/15 text-warn" },
  concluido: { texto: "Atualizado", cor: "bg-ok/12 text-ok" },
  incompleto: { texto: "Parcial — pulado", cor: "bg-warn/15 text-warn" },
  sem_resposta: { texto: "Sem resposta — pulado", cor: "bg-danger/10 text-danger" },
  encerrado: { texto: "Encerrado", cor: "bg-bg text-muted" },
  nao_monitorada: { texto: "Não monitorada", cor: "bg-bg text-muted" },
  tempo: { texto: "Tempo esgotado", cor: "bg-danger/10 text-danger" },
  erro: { texto: "Erro", cor: "bg-danger/10 text-danger" },
  parado: { texto: "Interrompido", cor: "bg-bg text-muted" },
};

export default function Page() {
  return (
    <SomenteAdmin>
      <MonitoramentoAdmin />
    </SomenteAdmin>
  );
}

function MonitoramentoAdmin() {
  // O ciclo roda em segundo plano (src/lib/cicloAdmin.ts): esta página só mostra e controla.
  const { compras, recentes, situacao, rodando, ciclo, lote, carregando, erro, aviso } = useCiclo();
  const [auto, setAuto] = useState(inicioAutomatico);

  const valores = Object.values(situacao);
  const feitos = valores.filter((s) => !["fila", "abrindo", "capturando", "captcha"].includes(s.estado)).length;
  const emAndamento = valores.filter((s) => ["abrindo", "capturando", "captcha"].includes(s.estado)).length;
  const novas = valores.reduce((t, s) => t + (s.synced ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Ciclo de monitoramento"
        tag="Administrador"
        subtitle={`Atualiza no Comprasnet todas as compras monitoradas por todos os usuários, ${TAMANHO_LOTE} de cada vez`}
        actions={
          <>
            <Link href="/monitoramento" className="btn btn-ghost"><ArrowLeft size={14} /> Monitoramento</Link>
            <button className="btn btn-ghost" onClick={() => void carregar()} disabled={carregando}>
              <RefreshCw size={14} className={carregando ? "animate-spin" : ""} /> Atualizar lista
            </button>
            {rodando ? (
              <button className="btn btn-primary" onClick={pararCiclo}><Square size={14} /> Parar</button>
            ) : (
              <button className="btn btn-primary" onClick={() => void iniciar()} disabled={carregando || !compras.length}><Play size={14} /> Iniciar ciclo</button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Compras monitoradas" value={compras.length} />
        <StatCard label="Ciclo" value={rodando ? `${ciclo}º · ${feitos}/${valores.length}` : ciclo ? "Parado" : "—"} hint={rodando && lote ? `lote ${lote} · recomeça sozinho ao terminar` : undefined} />
        <StatCard label="Abertas agora" value={emAndamento} hint={`máximo ${TAMANHO_LOTE} (${JANELAS} janelas × ${ABAS_POR_JANELA} abas)`} />
        <StatCard label="Mensagens novas" value={novas} accent={novas > 0} />
      </div>

      <div className="card p-4 mb-4 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <ShieldCheck size={16} className="text-brand" />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); setInicioAutomatico(e.target.checked); }} />
            Iniciar sozinho ao entrar no PEPPACORP
          </label>
        </div>
        <p className="text-xs text-muted">
          Todas as licitações que os usuários adicionarem no Monitoramento são capturadas por este robô, e as mensagens vão para cada usuário.
          Cada lote abre {JANELAS} janelas com {ABAS_POR_JANELA} abas; o próximo lote só abre quando o atual termina.
          Ao terminar a fila, um novo ciclo começa sozinho, sem pausa, até você clicar em Parar.
          Compras novas entram sozinhas na frente da fila (verificação a cada {VERIFICAR_NOVAS_MS / 1000}s).
          O ciclo continua rodando enquanto você navega pelo PEPPACORP; deixe uma aba do PEPPACORP e o Comprasnet (logado) abertos neste navegador.
          Cada compra tem até {TEMPO_LIMITE_MS / 60000} min para importar o chat.
        </p>
      </div>

      {aviso && (
        <div className="card p-3 mb-4 flex gap-2 text-sm text-warn"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {aviso}</div>
      )}
      {erro && <div className="card p-3 mb-4 text-sm text-danger">{erro}</div>}

      {!carregando && !compras.length && !erro && (
        <Empty title="Nenhuma compra em monitoramento" text="Quando os usuários cadastrarem compras no Monitoramento, elas aparecem aqui." />
      )}

      {compras.length > 0 && (
        <div className="card overflow-x-auto">
          {/* Uma linha por compra: órgão, código e detalhes do erro ficam na dica (passar o mouse). */}
          <table className="w-full table-fixed text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-2">Pregão</th>
                <th className="px-3 py-2 w-36">Última captura</th>
                <th className="px-3 py-2 w-56">Situação</th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => {
                const s = situacao[c.codigo_compra];
                const r = s ? ROTULO[s.estado] : null;
                const local = [c.municipio, c.uf].filter(Boolean).join("/");
                return (
                  <tr key={c.codigo_compra} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 truncate font-medium" title={[c.orgao, local, c.codigo_compra].filter(Boolean).join(" · ")}>
                      {recentes.includes(c.codigo_compra) && <span className="badge mr-1.5 bg-accent-soft text-accent">Nova</span>}
                      {c.titulo}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-muted">{c.ultima_captura ? dataBR(c.ultima_captura, true) : "Nunca"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {r ? (
                        <span className={`badge ${r.cor}`} title={s!.detalhe}>
                          {(s!.estado === "abrindo" || s!.estado === "capturando") && <Loader2 size={11} className="animate-spin" />}
                          {r.texto}
                          {s!.estado === "concluido" && (s!.synced ? ` · ${s!.synced} nova(s)` : " · sem novidades")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
