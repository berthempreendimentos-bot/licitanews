"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, CheckCheck, Trash2, Search, X, Tag, ExternalLink, Filter, CheckCircle2 } from "lucide-react";
import { Empty, PageHeader } from "@/components/ui";
import { corEvento, EventoTag } from "@/components/EventoTag";
import { db, useCollection, useEmpresa } from "@/lib/store";
import { comprasnetUrl } from "@/lib/monitor";
import { dataBR } from "@/lib/format";
import type { Alert } from "@/lib/types";

const PRIO: Record<string, string> = {
  Alta: "bg-danger/12 text-danger",
  Média: "bg-warn/15 text-warn",
  Baixa: "bg-neutral-200 text-neutral-600",
};

/** Extrai o termo mencionado do título do alerta (ex.: Menção a "00.937.319/0001-48") */
function extrairMencao(a: Alert): string | null {
  const m = a.titulo.match(/Menção a "([^"]+)"/i);
  return m ? m[1].trim() : null;
}

export default function Alertas() {
  const { items } = useCollection("alerts");
  const { empresa } = useEmpresa();

  const [statusFiltro, setStatusFiltro] = useState<"todos" | "nao_lidos" | "lidos">("nao_lidos");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [mencaoFiltro, setMencaoFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState<string>("");
  const [limite, setLimite] = useState<number>(50);

  // 1. Mapeia todos os tipos de alarme presentes nos alertas com contagem
  const tiposAlarme = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const a of items) {
      const t = a.tipo || "Outros";
      mapa.set(t, (mapa.get(t) ?? 0) + 1);
    }
    return Array.from(mapa.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  // 2. Mapeia todos os nomes das menções presentes com contagem
  const nomesMencoes = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const a of items) {
      const m = extrairMencao(a);
      if (m) {
        mapa.set(m, (mapa.get(m) ?? 0) + 1);
      }
    }
    // Inclui termos vigiados da empresa se aparecerem no texto
    const vigiados = [empresa.cnpj, empresa.razao_social, ...(empresa.palavras_chave || [])].filter(Boolean);
    for (const v of vigiados) {
      if (!mapa.has(v)) {
        let count = 0;
        const vLower = v.toLowerCase();
        for (const a of items) {
          if (a.titulo.toLowerCase().includes(vLower) || a.mensagem.toLowerCase().includes(vLower)) {
            count++;
          }
        }
        if (count > 0) mapa.set(v, count);
      }
    }
    return Array.from(mapa.entries()).sort((a, b) => b[1] - a[1]);
  }, [items, empresa]);

  // 3. Aplica todos os filtros combinados
  const listaFiltrada = useMemo(() => {
    const buscaLimpa = busca.trim().toLowerCase();

    return items.filter((a) => {
      // Filtro de Leitura
      if (statusFiltro === "nao_lidos" && a.lido) return false;
      if (statusFiltro === "lidos" && !a.lido) return false;

      // Filtro de Tipo de Alarme
      if (tipoFiltro !== "todos" && a.tipo !== tipoFiltro) return false;

      // Filtro de Nome da Menção
      if (mencaoFiltro !== "todos") {
        const m = extrairMencao(a);
        if (m) {
          if (m.toLowerCase() !== mencaoFiltro.toLowerCase()) return false;
        } else {
          const vLower = mencaoFiltro.toLowerCase();
          if (!a.titulo.toLowerCase().includes(vLower) && !a.mensagem.toLowerCase().includes(vLower)) {
            return false;
          }
        }
      }

      // Filtro de Busca Livre
      if (buscaLimpa) {
        const textoCompleto = `${a.titulo} ${a.mensagem} ${a.ref || ""}`.toLowerCase();
        if (!textoCompleto.includes(buscaLimpa)) return false;
      }

      return true;
    });
  }, [items, statusFiltro, tipoFiltro, mencaoFiltro, busca]);

  const totalNaoLidos = useMemo(() => items.filter((a) => !a.lido).length, [items]);
  const naoLidosFiltrados = useMemo(() => listaFiltrada.filter((a) => !a.lido), [listaFiltrada]);

  const temFiltroAtivo = statusFiltro !== "nao_lidos" || tipoFiltro !== "todos" || mencaoFiltro !== "todos" || busca.trim().length > 0;

  function limparFiltros() {
    setStatusFiltro("nao_lidos");
    setTipoFiltro("todos");
    setMencaoFiltro("todos");
    setBusca("");
    setLimite(50);
  }

  const visiveis = listaFiltrada.slice(0, limite);

  return (
    <>
      <PageHeader
        title="Alertas"
        subtitle={`${totalNaoLidos} não lidos · ${items.length} no total`}
        actions={
          <>
            <Link href="/monitoramento/alarme" className="btn btn-ghost">
              <BellRing size={14} /> Configurar alarmes
            </Link>
            <button
              className="btn btn-ghost"
              disabled={!naoLidosFiltrados.length}
              onClick={() => db.upsertMany("alerts", naoLidosFiltrados.map((a) => ({ ...a, lido: true })))}
              title="Marcar alertas visíveis como lidos"
            >
              <CheckCheck size={14} /> Marcar {naoLidosFiltrados.length > 0 ? `${naoLidosFiltrados.length} ` : ""}como lidos
            </button>
          </>
        }
      />

      {/* Barra de Filtros de Mensagem e Alarme */}
      <div className="card p-4 mb-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <Filter size={14} className="text-accent" />
          <span>Filtros de Alertas e Mensagens</span>
          {temFiltroAtivo && (
            <button onClick={limparFiltros} className="ml-auto text-accent hover:underline lowercase font-normal flex items-center gap-1">
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* 1. Busca por texto da mensagem */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input !pl-8 !text-xs"
              placeholder="Buscar na mensagem, termo ou pregão..."
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setLimite(50); }}
            />
            {busca && (
              <button
                onClick={() => setBusca("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-brand"
                aria-label="Limpar busca"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 2. Filtro por Tipo de Alarme */}
          <div>
            <select
              className="input !text-xs font-medium cursor-pointer"
              value={tipoFiltro}
              onChange={(e) => { setTipoFiltro(e.target.value); setLimite(50); }}
              aria-label="Filtrar por tipo de alarme"
            >
              <option value="todos">Todos os tipos de alarme ({items.length})</option>
              {tiposAlarme.map(([tipo, qtd]) => (
                <option key={tipo} value={tipo}>
                  {tipo} ({qtd})
                </option>
              ))}
            </select>
          </div>

          {/* 3. Filtro por Nome da Menção */}
          <div>
            <select
              className="input !text-xs font-medium cursor-pointer"
              value={mencaoFiltro}
              onChange={(e) => { setMencaoFiltro(e.target.value); setLimite(50); }}
              aria-label="Filtrar por nome da menção"
            >
              <option value="todos">
                {nomesMencoes.length > 0 ? `Todas as menções (${nomesMencoes.reduce((s, [, q]) => s + q, 0)})` : "Todas as menções"}
              </option>
              {nomesMencoes.map(([nome, qtd]) => (
                <option key={nome} value={nome}>
                  @{nome} ({qtd})
                </option>
              ))}
            </select>
          </div>

          {/* 4. Filtro por Status de Leitura */}
          <div>
            <select
              className="input !text-xs font-medium cursor-pointer"
              value={statusFiltro}
              onChange={(e) => { setStatusFiltro(e.target.value as "nao_lidos" | "lidos" | "todos"); setLimite(50); }}
              aria-label="Filtrar por status de leitura"
            >
              <option value="nao_lidos">Apenas não lidos ({totalNaoLidos})</option>
              <option value="lidos">Apenas lidos ({items.length - totalNaoLidos})</option>
              <option value="todos">Ver todos ({items.length})</option>
            </select>
          </div>
        </div>

        {/* Resumo da filtragem ativa */}
        <div className="flex flex-wrap items-center justify-between text-xs text-muted pt-1 border-t border-border/60">
          <div>
            Mostrando <b>{Math.min(visiveis.length, listaFiltrada.length)}</b> de <b>{listaFiltrada.length}</b> alertas encontrados
            {mencaoFiltro !== "todos" && <span className="ml-1 text-accent font-semibold">• Menção: &ldquo;{mencaoFiltro}&rdquo;</span>}
            {tipoFiltro !== "todos" && <span className="ml-1 text-accent font-semibold">• Alarme: &ldquo;{tipoFiltro}&rdquo;</span>}
          </div>
          {listaFiltrada.length > 0 && (
            <div className="text-[11px]">
              {naoLidosFiltrados.length} não lido(s) nesta seleção
            </div>
          )}
        </div>
      </div>

      {/* Lista de Alertas */}
      {items.length === 0 ? (
        <Empty
          title="Nenhum alerta registrado"
          text="Os alertas aparecerão aqui automaticamente quando o chat do pregoeiro for capturado ou quando uma das suas palavras-chave for mencionada."
          action={
            <Link href="/monitoramento" className="btn btn-primary">
              Ir para Monitoramento
            </Link>
          }
        />
      ) : listaFiltrada.length === 0 ? (
        <Empty
          title="Nenhum alerta com estes filtros"
          text="Tente selecionar outro tipo de alarme, outra menção ou limpar a busca para ver mais resultados."
          action={
            <button className="btn btn-ghost" onClick={limparFiltros}>
              Limpar filtros
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {visiveis.map((a) => {
            const mencao = extrairMencao(a);
            return (
              <div
                key={a.id}
                className={`card p-4 flex flex-col sm:flex-row gap-3 transition hover:border-accent/40 ${a.lido ? "opacity-60 bg-surface/50" : "border-l-4 border-l-brand"}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {corEvento(a.tipo) ? (
                      <EventoTag evento={a.tipo} />
                    ) : (
                      <span className={`badge ${PRIO[a.prioridade] ?? "bg-accent-soft text-accent"}`}>{a.tipo}</span>
                    )}

                    {mencao && (
                      <span className="badge bg-accent-soft text-brand font-semibold gap-1 text-[11px]" title={`Menção ao termo ${mencao}`}>
                        <Tag size={10} /> {mencao}
                      </span>
                    )}

                    <span className="font-semibold text-sm text-brand">{a.titulo}</span>
                  </div>

                  <p className="mt-1.5 text-sm leading-relaxed text-main whitespace-pre-line">{a.mensagem}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span>{dataBR(a.created_at, true)}</span>
                    {a.ref && (
                      <span className="font-mono text-[11px]">Pregão: {a.ref}</span>
                    )}
                    {a.ref && (
                      <a
                        href={comprasnetUrl(a.ref)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        <ExternalLink size={11} /> Abrir no Comprasnet
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
                  {!a.lido ? (
                    <button
                      className="btn btn-ghost !py-1 !px-2.5 !text-xs text-accent font-semibold"
                      onClick={() => db.update("alerts", a.id, { lido: true })}
                      title="Marcar como lido"
                    >
                      <CheckCircle2 size={13} /> Marcar lido
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted">Lido</span>
                  )}
                  <button
                    aria-label="Excluir alerta"
                    title="Excluir este alerta"
                    className="text-muted hover:text-danger p-1 rounded transition"
                    onClick={() => db.remove("alerts", a.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Paginação / Carregar mais */}
          {listaFiltrada.length > limite && (
            <div className="pt-3 pb-6 text-center space-y-2">
              <div className="text-xs text-muted">
                Exibindo <b>{limite}</b> de <b>{listaFiltrada.length}</b> alertas
              </div>
              <div className="flex justify-center gap-2">
                <button
                  className="btn btn-ghost text-xs"
                  onClick={() => setLimite((prev) => prev + 50)}
                >
                  Carregar mais 50 alertas
                </button>
                <button
                  className="btn btn-ghost text-xs"
                  onClick={() => setLimite(listaFiltrada.length)}
                >
                  Carregar todos ({listaFiltrada.length})
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
