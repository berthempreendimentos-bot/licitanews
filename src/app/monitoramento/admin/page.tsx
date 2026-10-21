"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2, Play, RefreshCw, ShieldCheck, Square } from "lucide-react";
import { Empty, PageHeader, StatCard } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { abrirNoComprasnet, detectarExtensao, escutarCaptura, fecharNoComprasnet, pedirEstadoCaptura } from "@/lib/extensao";
import { dataBR } from "@/lib/format";
import type { CompraAdmin } from "@/app/api/admin/monitoramento/route";

/** Compras abertas ao mesmo tempo no Comprasnet. */
const TAMANHO_LOTE = 3;
/** Tempo máximo para uma compra importar o chat antes de passar para a próxima. */
const TEMPO_LIMITE_MS = 5 * 60000;
/** A compra precisa responder (portal carregado e logado) em até este tempo; senão é pulada. */
const TEMPO_RESPOSTA_MS = 60000;
/** Pausa entre um ciclo e o próximo (repetição automática). */
const PAUSA_CICLOS_MS = 60000;
/** De quanto em quanto tempo a página procura compras novas cadastradas pelos usuários. */
const VERIFICAR_NOVAS_MS = 20000;

type Estado = "fila" | "abrindo" | "capturando" | "captcha" | "concluido" | "incompleto" | "encerrado" | "nao_monitorada" | "sem_resposta" | "tempo" | "erro" | "parado";
type Situacao = { estado: Estado; synced?: number; detalhe?: string };

const ROTULO: Record<Estado, { texto: string; cor: string }> = {
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

function useAdmin() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    if (!supabase) return setAdmin(false);
    supabase.auth.getUser().then(({ data }) => setAdmin(data.user?.app_metadata?.role === "admin"));
  }, []);
  return admin;
}

async function listarCompras(): Promise<CompraAdmin[]> {
  const { data } = await supabase!.auth.getSession();
  const r = await fetch("/api/admin/monitoramento", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d.compras;
}

/** "0.10.0" > "0.5.0" (comparação por partes, não por texto). */
function versaoMinima(versao: string, minima: string) {
  const a = versao.split(".").map(Number), b = minima.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
}

/** Espera `ms`, ou até `parar` virar true, ou até `acordar()` responder true. */
function esperar(ms: number, parar: { current: boolean }, acordar: () => boolean = () => false) {
  return new Promise<void>((resolve) => {
    const fim = Date.now() + ms;
    const t = setInterval(() => { if (parar.current || acordar() || Date.now() >= fim) { clearInterval(t); resolve(); } }, 500);
  });
}

export default function MonitoramentoAdmin() {
  const admin = useAdmin();
  const [compras, setCompras] = useState<CompraAdmin[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [situacao, setSituacao] = useState<Record<string, Situacao>>({});
  const [rodando, setRodando] = useState(false);
  const [repetir, setRepetir] = useState(true);
  const [ciclo, setCiclo] = useState(0);
  const [aviso, setAviso] = useState("");
  const [recentes, setRecentes] = useState<string[]>([]);
  const parar = useRef(false);
  const rodandoRef = useRef(false);
  const repetirRef = useRef(repetir);
  repetirRef.current = repetir;
  // Fila do ciclo: as compras novas (prioridade) passam na frente das demais.
  const prioridade = useRef<string[]>([]);
  const fila = useRef<string[]>([]);
  const ativas = useRef<Set<string>>(new Set());
  const conhecidas = useRef<Set<string> | null>(null);
  const recentesRef = useRef<string[]>([]);

  const marcar = (codigo: string, s: Situacao) => setSituacao((atual) => ({ ...atual, [codigo]: s }));

  /**
   * Busca a lista no servidor. Compras que não estavam na lista (cadastradas agora por algum usuário)
   * vão para o topo e, com o ciclo rodando, para a frente da fila, sem interromper o que está aberto.
   */
  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const lista = await listarCompras();
      setErro("");
      const antes = conhecidas.current;
      const novas = antes ? lista.filter((c) => !antes.has(c.codigo_compra)).map((c) => c.codigo_compra) : [];
      conhecidas.current = new Set(lista.map((c) => c.codigo_compra));
      ativas.current = conhecidas.current;
      if (novas.length) {
        recentesRef.current = [...novas, ...recentesRef.current.filter((c) => !novas.includes(c))];
        setRecentes(recentesRef.current);
        if (rodandoRef.current) {
          for (const c of novas) {
            if (prioridade.current.includes(c)) continue;
            prioridade.current.push(c);
            marcar(c, { estado: "fila" });
          }
        }
      }
      // Novas no topo (a mais recente primeiro); depois as demais, as mais desatualizadas primeiro.
      const topo = recentesRef.current.map((c) => lista.find((x) => x.codigo_compra === c)).filter((c): c is CompraAdmin => !!c);
      setCompras([...topo, ...lista.filter((c) => !recentesRef.current.includes(c.codigo_compra))]);
      return lista;
    } catch (e) {
      setErro((e as Error).message);
      return [];
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!admin) return;
    void carregar();
    const t = setInterval(() => void carregar(true), VERIFICAR_NOVAS_MS);
    return () => clearInterval(t);
  }, [admin, carregar]);

  /** Abre a compra, espera a extensão avisar que importou o chat e fecha a aba (se foi aberta aqui). */
  async function atualizar(codigo: string) {
    marcar(codigo, { estado: "abrindo" });
    const fim: { s: Situacao | null; respondeu: boolean } = { s: null, respondeu: false };
    // Escuta antes de abrir: o aviso pode chegar logo depois da abertura.
    const pararDeEscutar = escutarCaptura(codigo, (estado, synced) => {
      fim.respondeu = true;
      if (estado === "captcha") marcar(codigo, { estado: "captcha", synced });
      else if (estado !== "registrado") fim.s = { estado, synced };
    });
    try {
      const r = await abrirNoComprasnet(codigo, false);
      if (!r.ok) return marcar(codigo, { estado: "erro", detalhe: "a extensão não abriu a compra" });
      // Já estava aberta: os avisos dela já saíram, então pede o estado de novo.
      if (r.jaAberta) pedirEstadoCaptura(codigo);
      if (!fim.s) marcar(codigo, { estado: "capturando" });
      const inicio = Date.now();
      while (!fim.s && !parar.current && Date.now() - inicio < TEMPO_LIMITE_MS) {
        // Portal não carregou a compra (ex.: deslogado): pula para a próxima.
        if (!fim.respondeu && Date.now() - inicio > TEMPO_RESPOSTA_MS) {
          fim.s = { estado: "sem_resposta", detalhe: "o Comprasnet não carregou a compra (confira se está logado)" };
          break;
        }
        await esperar(1000, parar);
      }
      marcar(codigo, fim.s ?? { estado: parar.current ? "parado" : "tempo" });
      if (!r.jaAberta) await fecharNoComprasnet(codigo);
    } finally {
      pararDeEscutar();
    }
  }

  async function iniciar() {
    setAviso("");
    const versao = await detectarExtensao(3000);
    if (!versao) return setAviso("Extensão PEPPACORP Monitor não encontrada neste navegador. Instale-a em Conectar Robô.");
    if (!versaoMinima(versao, "0.6.0")) return setAviso(`A extensão está na v${versao}. O ciclo precisa da v0.6.0 ou mais nova: baixe de novo em Conectar Robô.`);
    parar.current = false;
    rodandoRef.current = true;
    prioridade.current = [];
    setRodando(true);
    try {
      for (let n = 1; !parar.current; n++) {
        setCiclo(n);
        await carregar(true);
        // Mesma ordem da tabela: novas primeiro, depois as mais desatualizadas.
        const ordem = [...recentesRef.current.filter((c) => ativas.current.has(c)), ...[...ativas.current].filter((c) => !recentesRef.current.includes(c))];
        fila.current = ordem;
        setSituacao(Object.fromEntries(ordem.map((c) => [c, { estado: "fila" as Estado }])));
        await rodarFila();
        if (parar.current || !repetirRef.current) break;
        // Pausa entre ciclos: compra nova cadastrada nesse meio-tempo é atualizada na hora.
        const fimPausa = Date.now() + PAUSA_CICLOS_MS;
        while (!parar.current && Date.now() < fimPausa) {
          await esperar(fimPausa - Date.now(), parar, () => prioridade.current.length > 0);
          if (prioridade.current.length) await rodarFila();
        }
      }
    } finally {
      rodandoRef.current = false;
      setRodando(false);
      void carregar(true);
    }
  }

  /** Próxima compra da fila: primeiro as novas, depois as demais (pula as que saíram do monitoramento). */
  function proxima(): string | null {
    while (prioridade.current.length || fila.current.length) {
      const codigo = (prioridade.current.length ? prioridade.current : fila.current).shift()!;
      fila.current = fila.current.filter((c) => c !== codigo);
      if (ativas.current.has(codigo)) return codigo;
    }
    return null;
  }

  /** Até TAMANHO_LOTE compras abertas ao mesmo tempo; cada vaga liberada pega a próxima da fila. */
  async function rodarFila() {
    async function vaga() {
      for (let c = proxima(); c && !parar.current; c = proxima()) await atualizar(c);
    }
    await Promise.all(Array.from({ length: TAMANHO_LOTE }, vaga));
  }

  if (admin === null) return <div className="p-10 text-sm text-muted">Carregando…</div>;
  if (!admin) {
    return (
      <Empty title="Acesso restrito" text="Esta página é só para administradores do PEPPACORP." />
    );
  }

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
              <button className="btn btn-primary" onClick={() => { parar.current = true; }}><Square size={14} /> Parar</button>
            ) : (
              <button className="btn btn-primary" onClick={() => void iniciar()} disabled={carregando || !compras.length}><Play size={14} /> Iniciar ciclo</button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Compras monitoradas" value={compras.length} />
        <StatCard label="Ciclo" value={rodando ? `${ciclo}º · ${feitos}/${valores.length}` : ciclo ? `${ciclo}º concluído` : "—"} />
        <StatCard label="Abertas agora" value={emAndamento} hint={`máximo ${TAMANHO_LOTE}`} />
        <StatCard label="Mensagens novas" value={novas} accent={novas > 0} />
      </div>

      <div className="card p-4 mb-4 flex flex-wrap items-center gap-3 text-sm">
        <ShieldCheck size={16} className="text-brand" />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} />
          Repetir o ciclo automaticamente ({PAUSA_CICLOS_MS / 60000} min de pausa entre ciclos)
        </label>
        <span className="text-xs text-muted">
          Compras novas cadastradas pelos usuários entram sozinhas na frente da fila (verificação a cada {VERIFICAR_NOVAS_MS / 1000}s).
          Deixe esta página e o Comprasnet (logado) abertos neste navegador. Cada compra tem até {TEMPO_LIMITE_MS / 60000} min para importar o chat.
        </span>
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
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th className="p-3">Compra</th>
                <th className="p-3">Órgão</th>
                <th className="p-3 text-center">Usuários</th>
                <th className="p-3">Última mensagem</th>
                <th className="p-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => {
                const s = situacao[c.codigo_compra];
                const r = s ? ROTULO[s.estado] : null;
                return (
                  <tr key={c.codigo_compra} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <div className="font-semibold">
                        {c.titulo}
                        {recentes.includes(c.codigo_compra) && <span className="badge ml-2 bg-accent-soft text-accent">Nova</span>}
                      </div>
                      <div className="text-xs text-muted font-mono">{c.codigo_compra}</div>
                    </td>
                    <td className="p-3 text-xs text-muted">
                      {c.orgao || "—"}
                      {c.municipio && <div>{c.municipio}{c.uf ? `/${c.uf}` : ""}</div>}
                    </td>
                    <td className="p-3 text-center">{c.usuarios}</td>
                    <td className="p-3 text-xs text-muted">{c.ultima_captura ? dataBR(c.ultima_captura, true) : "Nunca"}</td>
                    <td className="p-3">
                      {r ? (
                        <span className={`badge ${r.cor}`}>
                          {(s!.estado === "abrindo" || s!.estado === "capturando") && <Loader2 size={11} className="animate-spin" />}
                          {r.texto}
                          {s!.estado === "concluido" && (s!.synced ? ` · ${s!.synced} nova(s)` : " · sem novidades")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                      {s?.detalhe && <div className="mt-1 text-xs text-danger">{s.detalhe}</div>}
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
