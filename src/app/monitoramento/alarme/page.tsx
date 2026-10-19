"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellRing, Volume2, VolumeX, MonitorUp } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { EventoPonto } from "@/components/EventoTag";
import { db, useEmpresa } from "@/lib/store";
import { alertasDaEmpresa, EVENTOS_ALERTA } from "@/lib/monitor";
import { detectarExtensao } from "@/lib/extensao";
import type { AlertasChat, SomAlarme } from "@/lib/types";

const NOMES_EVENTO: Record<string, { nome: string; dica: string }> = {
  "Menção": { nome: "Menção à empresa", dica: "CNPJ, razão social ou palavras-chave citados no chat" },
  "Mensagem do pregoeiro": { nome: "Qualquer mensagem do pregoeiro", dica: "Toda mensagem enviada pelo pregoeiro" },
  "CONVOCAÇÃO": { nome: "Convocação", dica: "Convocação para enviar anexos ou proposta" },
  "PRAZO": { nome: "Prazo", dica: "Mensagens que citam prazo ou horário limite" },
  "HABILITAÇÃO": { nome: "Habilitação", dica: "Habilitação ou inabilitação de fornecedor" },
  "RECURSO": { nome: "Recurso", dica: "Intenção de recurso e fases de recurso" },
  "SUSPENSÃO": { nome: "Suspensão", dica: "Sessão ou item suspenso" },
  "SESSÃO ENCERRADA": { nome: "Sessão encerrada", dica: "Encerramento ou finalização" },
  "REABERTURA": { nome: "Reabertura", dica: "Sessão reaberta ou retomada" },
};

const SONS: { id: SomAlarme; nome: string; dica: string }[] = [
  { id: "sirene", nome: "Sirene", dica: "Sobe e desce, difícil de ignorar" },
  { id: "bipe", nome: "Bipe", dica: "Três bipes curtos" },
  { id: "campainha", nome: "Campainha", dica: "Dois toques suaves" },
];

function Interruptor({ ligado, onChange, rotulo }: { ligado: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} onClick={() => onChange(!ligado)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${ligado ? "bg-brand" : "bg-neutral-300"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${ligado ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export default function Alarme() {
  const { empresa, save } = useEmpresa();
  const cfg = alertasDaEmpresa(empresa);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  // Lê o valor salvo na hora (não o da última renderização): cliques rápidos não se sobrescrevem.
  const atual = () => alertasDaEmpresa(db.get("empresa")[0] ?? empresa);
  const set = (patch: Partial<AlertasChat>) => save({ alertas_chat: { ...atual(), ...patch } });
  const alterna = (ev: string) => {
    const eventos = atual().eventos;
    set({ eventos: eventos.includes(ev) ? eventos.filter((e) => e !== ev) : [...eventos, ev] });
  };

  async function testar() {
    if (!(await detectarExtensao())) {
      return setAviso({ ok: false, texto: "Instale e conecte a extensão em Conectar Robô para testar o alarme." });
    }
    if (!cfg.popup && !cfg.som) return setAviso({ ok: false, texto: "Pop-up e alarme sonoro estão desligados: não há o que testar." });
    setAviso({ ok: true, texto: cfg.som ? "Tocando o alarme de teste. Silencie pelo pop-up, pela faixa vermelha no topo ou pelo ícone da extensão." : "Pop-up de teste enviado." });
    window.postMessage({ type: "PEPPA_EXT_TEST_ALARM", alertas: cfg }, window.location.origin);
  }

  return (
    <>
      <Link href="/monitoramento" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-brand">
        <ArrowLeft size={13} /> Monitoramento
      </Link>
      <PageHeader title="Alarme" subtitle="Como e quando avisar quando chegar mensagem importante no chat do pregão"
        actions={<button className="btn btn-primary" onClick={() => void testar()}><Volume2 size={14} /> Testar alarme</button>} />
      {aviso && <div className={`-mt-3 mb-4 text-sm ${aviso.ok ? "text-ok" : "text-danger"}`}>{aviso.texto}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold text-brand">Como avisar</h2>
          <div className="mt-3 divide-y divide-border">
            <div className="flex items-center gap-3 py-3">
              <MonitorUp size={18} className="text-muted shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold">Pop-up do Windows</div>
                <div className="text-xs text-muted">Aviso no canto da tela, mesmo com o navegador minimizado.</div>
              </div>
              <Interruptor rotulo="Pop-up do Windows" ligado={cfg.popup} onChange={(v) => set({ popup: v })} />
            </div>
            <div className="flex items-center gap-3 py-3">
              <BellRing size={18} className="text-muted shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold">Alarme sonoro</div>
                <div className="text-xs text-muted">Toca pela extensão, mesmo com o PEPPACORP fechado.</div>
              </div>
              <Interruptor rotulo="Alarme sonoro" ligado={cfg.som} onChange={(v) => set({ som: v })} />
            </div>

            {cfg.som && (
              <div className="space-y-4 py-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted">Som</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {SONS.map((s) => (
                      <button key={s.id} type="button" onClick={() => set({ tipo_som: s.id })}
                        className={`rounded-lg border p-3 text-left transition ${cfg.tipo_som === s.id ? "border-brand ring-2 ring-brand/15" : "border-border hover:border-brand/40"}`}>
                        <div className="text-sm font-semibold">{s.nome}</div>
                        <div className="text-[11px] text-muted">{s.dica}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
                    <span>Volume</span><span className="tabular-nums">{Math.round(cfg.volume * 100)}%</span>
                  </div>
                  <input type="range" min={10} max={100} step={10} className="mt-2 w-full accent-black" value={Math.round(cfg.volume * 100)}
                    onChange={(e) => set({ volume: Number(e.target.value) / 100 })} />
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-semibold">Repetir até silenciar</div>
                    <div className="text-xs text-muted">Para sozinho depois de 3 minutos. Desligado, toca uma vez só.</div>
                  </div>
                  <Interruptor rotulo="Repetir até silenciar" ligado={cfg.repetir} onChange={(v) => set({ repetir: v })} />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-brand flex-1">Quando avisar</h2>
            <button className="text-xs font-semibold text-accent" onClick={() => set({ eventos: [...EVENTOS_ALERTA] })}>Marcar todos</button>
            <span className="text-muted">·</span>
            <button className="text-xs font-semibold text-muted hover:text-brand" onClick={() => set({ eventos: [] })}>Limpar</button>
          </div>
          <div className="mt-3 divide-y divide-border">
            {EVENTOS_ALERTA.map((ev) => (
              <label key={ev} className="flex cursor-pointer items-center gap-3 py-2.5">
                <input type="checkbox" className="h-4 w-4 accent-black" checked={cfg.eventos.includes(ev)} onChange={() => alterna(ev)} />
                <EventoPonto evento={ev} />
                <div>
                  <div className="text-sm font-semibold">{NOMES_EVENTO[ev]?.nome ?? ev}</div>
                  <div className="text-xs text-muted">{NOMES_EVENTO[ev]?.dica}</div>
                </div>
              </label>
            ))}
          </div>
          <p className="mt-3 rounded-lg bg-bg p-3 text-xs text-muted">
            Só mensagens das últimas 2 horas disparam aviso. O histórico importado na primeira captura vira alerta na lista, sem som.
          </p>
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <VolumeX size={18} className="text-brand" />
            <h2 className="font-bold text-brand">Como silenciar</h2>
          </div>
          <ul className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-3">
            <li className="rounded-lg bg-bg p-3">Botão <b className="text-brand">“Silenciar alarme”</b> no pop-up do Windows, ou clique no pop-up (abre o PEPPACORP).</li>
            <li className="rounded-lg bg-bg p-3">Botão <b className="text-brand">Silenciar</b> na faixa vermelha que aparece no topo do PEPPACORP.</li>
            <li className="rounded-lg bg-bg p-3">Ícone da extensão (fica com <b className="text-red-600">!</b> vermelho) → <b className="text-brand">Silenciar alarme</b>.</li>
          </ul>
        </section>
      </div>
    </>
  );
}
