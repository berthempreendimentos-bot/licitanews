"use client";

import { useSyncExternalStore } from "react";
import { abrirNoComprasnet, detectarExtensao, escutarCaptura, fecharNoComprasnet, pedirEstadoCaptura, verificarSeHaNovidade } from "./extensao";
import { fetchAdmin } from "./useAdmin";
import { serviceClient } from "./supabase";
import type { CompraAdmin } from "@/app/api/admin/monitoramento/route";
import type { Empresa } from "@/lib/types";

/**
 * Robô do administrador: atualiza no Comprasnet as compras monitoradas por TODOS os usuários
 * (a captura do administrador é gravada para cada usuário que monitora a compra).
 * Fica neste módulo, e não numa página, para continuar rodando enquanto o administrador navega.
 */

/**
 * Cada lote abre JANELAS janelas minimizadas com ABAS_POR_JANELA compras cada.
 * Poucas abas por vez: cada uma passa pelo captcha do portal ao carregar e, com muitas juntas,
 * o Comprasnet recusa o acesso.
 */
export const JANELAS = 2;
export const ABAS_POR_JANELA = 3;
/** Intervalo entre uma abertura e a próxima (espalha os captchas). */
const ESPACO_ABERTURAS_MS = 4000;
export const TAMANHO_LOTE = JANELAS * ABAS_POR_JANELA;
/** Tempo máximo para uma compra importar o chat antes de passar para a próxima. */
export const TEMPO_LIMITE_MS = 5 * 60000;
/** A compra precisa responder (portal carregado e logado) em até este tempo; senão é pulada. */
const TEMPO_RESPOSTA_MS = 60000;
/** Compras do mesmo lote com "acesso não autorizado" no portal a partir das quais o ciclo pausa. */
const RECUSAS_PARA_PAUSAR = 2;
/** De quanto em quanto tempo procura compras novas cadastradas pelos usuários. */
export const VERIFICAR_NOVAS_MS = 20000;
/** Versão mínima da extensão (avisa o fim da captura e reenvia o estado de abas já abertas). */
const VERSAO_MINIMA = "1.0.0";

export type EstadoCiclo = "fila" | "abrindo" | "capturando" | "captcha" | "concluido" | "incompleto" | "encerrado" | "nao_monitorada" | "sem_resposta" | "sem_chat" | "sem_acesso" | "tempo" | "erro" | "parado";
export type Situacao = { estado: EstadoCiclo; synced?: number; detalhe?: string };

/** rodando: robô ligado. ciclo: volta atual pela fila (ao terminar uma, começa a próxima sem pausa). */
export type CicloEstado = {
  compras: CompraAdmin[];
  recentes: string[];
  situacao: Record<string, Situacao>;
  rodando: boolean;
  ciclo: number;
  lote: number;
  carregando: boolean;
  erro: string;
  aviso: string;
  tempos_ciclo: Record<string, number[]>;
};

let estado: CicloEstado = {
  compras: [], recentes: [], situacao: {}, rodando: false, ciclo: 0, lote: 0, carregando: false, erro: "", aviso: "", tempos_ciclo: {},
};
const ouvintes = new Set<() => void>();
function set(parcial: Partial<CicloEstado>) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((f) => f());
}
function marcar(codigo: string, s: Situacao) {
  set({ situacao: { ...estado.situacao, [codigo]: s } });
}

export function useCiclo(): CicloEstado {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => ouvintes.delete(f); },
    () => estado,
    () => estado,
  );
}

// Fila: as compras novas (prioridade) passam na frente das demais.
let parar = false;
let prioridade: string[] = [];
let fila: string[] = [];
let ativas = new Set<string>();
let conhecidas: Set<string> | null = null;
let vigia: ReturnType<typeof setInterval> | null = null;

/** "0.10.0" > "0.5.0" (comparação por partes, não por texto). */
function versaoMinima(versao: string, minima: string) {
  const a = versao.split(".").map(Number), b = minima.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
}

/** Espera `ms`, ou até parar, ou até `acordar()` responder true. */
function esperar(ms: number, acordar: () => boolean = () => false) {
  return new Promise<void>((resolve) => {
    const fim = Date.now() + ms;
    const t = setInterval(() => { if (parar || acordar() || Date.now() >= fim) { clearInterval(t); resolve(); } }, 500);
  });
}

/**
 * Busca a lista no servidor. Compras que não estavam na lista (cadastradas agora por algum usuário)
 * vão para o topo e, com o ciclo rodando, para a frente da fila, sem interromper o que está aberto.
 */
export async function carregar(silencioso = false): Promise<CompraAdmin[]> {
  if (!silencioso) set({ carregando: true });
  try {
    const { compras: lista } = (await fetchAdmin("/api/admin/monitoramento")) as { compras: CompraAdmin[] };
    const antes = conhecidas;
    const novas = antes ? lista.filter((c) => !antes.has(c.codigo_compra)).map((c) => c.codigo_compra) : [];
    conhecidas = new Set(lista.map((c) => c.codigo_compra));
    ativas = conhecidas;
    let recentes = estado.recentes;
    if (novas.length) {
      recentes = [...novas, ...recentes.filter((c) => !novas.includes(c))];
      if (estado.rodando) {
        for (const c of novas) {
          if (prioridade.includes(c)) continue;
          prioridade.push(c);
          marcar(c, { estado: "fila" });
        }
      }
    }
    // Novas no topo (a mais recente primeiro); depois as demais, as mais desatualizadas primeiro.
    const novasCompras = lista.filter((c) => recentes.includes(c.codigo_compra) || !c.ultima_captura);
    const comCaptura = lista.filter((c) => !novasCompras.some((nc) => nc.codigo_compra === c.codigo_compra));
    comCaptura.sort((a, b) => (a.ultima_captura || "").localeCompare(b.ultima_captura || ""));
    set({ erro: "", recentes, compras: [...novasCompras, ...comCaptura] });
    return lista;
  } catch (e) {
    set({ erro: (e as Error).message });
    return [];
  } finally {
    if (!silencioso) set({ carregando: false });
  }
}

/** Procura compras novas de tempos em tempos (chamado ao entrar como administrador). */
export function vigiar() {
  if (vigia) return;
  void carregar();
  vigia = setInterval(() => void carregar(true), VERIFICAR_NOVAS_MS);
}

// As aberturas saem uma de cada vez: a primeira aba de cada janela é quem cria a janela.
let aberturas: Promise<unknown> = Promise.resolve();
function abrirEmOrdem(codigo: string, janela: number) {
  const r = aberturas.then(() => abrirNoComprasnet(codigo, false, janela));
  aberturas = r.catch(() => {}).then(() => esperar(ESPACO_ABERTURAS_MS));
  return r;
}

/** Próxima compra da fila: primeiro as novas, depois as demais (pula as que saíram do monitoramento). */
function proxima(): string | null {
  while (prioridade.length || fila.length) {
    const codigo = (prioridade.length ? prioridade : fila).shift()!;
    fila = fila.filter((c) => c !== codigo);
    if (ativas.has(codigo)) return codigo;
  }
  return null;
}

/**
 * Lotes de JANELAS janelas × ABAS_POR_JANELA abas. Ao iniciar cada lote,
 * abre todas as páginas do Comprasnet de uma vez (espaçadas de 4s),
 * processa as capturas conforme terminam e fecha cada aba individualmente.
 * Ao parar o ciclo, todas as páginas abertas são fechadas automaticamente.
 */
async function rodarFila() {
  let processadasNoCiclo = 0;
  let cicloAtual = 1;

  while (!parar) {
    if (!prioridade.length && !fila.length) {
      await esperar(VERIFICAR_NOVAS_MS, () => prioridade.length > 0 || fila.length > 0);
      continue;
    }

    const lote: string[] = [];
    for (let c = proxima(); c; c = lote.length < TAMANHO_LOTE ? proxima() : null) lote.push(c);
    if (!lote.length) {
      await esperar(1000);
      continue;
    }

    set({ lote: estado.lote + 1 });

    // Abre todas as páginas do lote de uma vez (espaçadas por abrirEmOrdem).
    for (let i = 0; i < lote.length; i++) {
      const codigo = lote[i];
      const janela = Math.floor(i / ABAS_POR_JANELA);
      const capturePromise = abrirCaptura(codigo, janela);
      capturesAtivas.set(codigo, capturePromise);
    }

    // Aguarda todas as capturas do lote completarem.
    await Promise.all(lote.map((c) => capturesAtivas.get(c)!));

    // Atualiza o horário de captura das compras processadas
    const agoraIso = new Date().toISOString();
    for (const codigo of lote) {
      const sit = estado.situacao[codigo];
      if (sit?.estado === "concluido") {
        const item = estado.compras.find((x) => x.codigo_compra === codigo);
        if (item) item.ultima_captura = agoraIso;
      }
    }

    // 1. As compras que acabaram de ser atualizadas vão para o FINAL DA FILA (fazendo o loop contínuo)
    for (const codigo of lote) {
      if (ativas.has(codigo)) {
        fila.push(codigo);
      }
    }

    // 2. Move os itens do lote para o final da lista exibida na tabela
    const loteSet = new Set(lote);
    const naoProcessadas = estado.compras.filter((c) => !loteSet.has(c.codigo_compra));
    const processadas = lote.map((cod) => estado.compras.find((c) => c.codigo_compra === cod)).filter(Boolean) as CompraAdmin[];
    set({ compras: [...naoProcessadas, ...processadas] });

    // 3. Incrementa o ciclo quando uma rodada completa de compras ativas for concluída
    processadasNoCiclo += lote.length;
    if (ativas.size > 0 && processadasNoCiclo >= ativas.size) {
      cicloAtual++;
      processadasNoCiclo = 0;
      set({ ciclo: cicloAtual });
    }

    // Várias recusas no mesmo lote = sessão do gov.br expirada: abrir mais abas só piora.
    const recusadas = lote.filter((c) => estado.situacao[c]?.estado === "sem_acesso").length;
    if (recusadas >= RECUSAS_PARA_PAUSAR) {
      parar = true;
      set({ aviso: "O Comprasnet recusou o acesso (sessão expirada ou verificação). Entre de novo no Comprasnet neste navegador e clique em Iniciar ciclo." });
    }
  }
}

/**
 * Mapa de capturas ativas do lote atual. Usado para fechar todas as páginas
 * do Comprasnet quando o ciclo é parado.
 */
const capturesAtivas = new Map<string, Promise<void>>();

/**
 * Abre a página da compra e aguarda a extensão avisar que a captura terminou.
 * Registra a promise no mapa de capturas ativas.
 */
async function abrirCaptura(codigo: string, janela: number): Promise<void> {
  marcar(codigo, { estado: "abrindo" });

  // Sync incremental: verifica se há mensagens novas ANTES de abrir o browser.
  const pregaoAtual = estado.compras.find((c) => c.codigo_compra === codigo);
  const since = pregaoAtual?.ultima_captura ? String(pregaoAtual.ultima_captura) : null;

  if (since) {
    try {
      const sb = serviceClient();
      if (!sb) throw new Error("no_supabase");
      const { data: session } = await sb.auth.getSession();
      const uid = session?.session?.user?.id;
      if (uid) {
        const { data: empRow } = await sb
          .from("records")
          .select("data")
          .eq("user_id", uid)
          .eq("collection", "empresa")
          .maybeSingle();
        const ingestKey = empRow?.data?.ingest_key as string | undefined;
        if (ingestKey) {
          const temNovidade = await verificarSeHaNovidade(codigo, since, ingestKey);
          if (!temNovidade) {
            console.log(`[ciclo] SKIP sync-incremental compra=${codigo} since=${since} → sem novidades`);
            const tempo = Date.now();
            const historico = estado.tempos_ciclo?.[codigo] || [];
            set({ tempos_ciclo: { ...estado.tempos_ciclo, [codigo]: [...historico.slice(-4), 0] } });
            marcar(codigo, { estado: "concluido", synced: 0, detalhe: "sem novidades" });
            return;
          }
          console.log(`[ciclo] SYNC-INCREMENTAL: há novidade compra=${codigo} since=${since} → abre browser`);
        } else {
          console.log(`[ciclo] SEM INGEST-KEY user=${uid} → abre browser sem verificação`);
        }
      }
    } catch (e) {
      console.log(`[ciclo] FALHA sync check compra=${codigo}: ${(e as Error).message} → abre browser`);
    }
  } else {
    console.log(`[ciclo] compra=${codigo} sem captura anterior (primeira vez) → abre browser`);
  }

  const inicioProcessamento = Date.now();
  const fim: { s: Situacao | null; respondeu: boolean } = { s: null, respondeu: false };

  const pararDeEscutar = escutarCaptura(codigo, (e, synced) => {
    fim.respondeu = true;
    if (e === "captcha") marcar(codigo, { estado: "captcha", synced });
    else if (e !== "registrado") fim.s = { estado: e, synced };
  });

  try {
    const r = await abrirEmOrdem(codigo, janela);
    if (!r.ok) {
      const tempo = Date.now() - inicioProcessamento;
      const historico = estado.tempos_ciclo?.[codigo] || [];
      set({ tempos_ciclo: { ...estado.tempos_ciclo, [codigo]: [...historico.slice(-4), tempo] } });
      marcar(codigo, { estado: "erro", detalhe: "a extensão não abriu a compra" });
      return;
    }
    if (r.jaAberta) pedirEstadoCaptura(codigo);
    if (!fim.s) marcar(codigo, { estado: "capturando" });

    const inicio = Date.now();
    while (!fim.s && !parar && Date.now() - inicio < TEMPO_LIMITE_MS) {
      if (!fim.respondeu && Date.now() - inicio > TEMPO_RESPOSTA_MS) {
        fim.s = { estado: "sem_resposta", detalhe: "o Comprasnet não carregou a compra (confira se está logado)" };
        break;
      }
      await esperar(1000);
    }
    marcar(codigo, fim.s ?? { estado: parar ? "parado" : "tempo" });
    const tempo = Date.now() - inicioProcessamento;
    const historico = estado.tempos_ciclo?.[codigo] || [];
    set({ tempos_ciclo: { ...estado.tempos_ciclo, [codigo]: [...historico.slice(-4), tempo] } });
    if (!r.jaAberta) await fecharNoComprasnet(codigo);
  } finally {
    pararDeEscutar();
  }
}

/**
 * Fecha todas as páginas do Comprasnet abertas no lote atual.
 * Chamado quando o ciclo é parado.
 */
async function closeLoteAtual() {
  const closes = [...capturesAtivas.entries()].map(async ([codigo, promise]) => {
    try {
      // Aguarda até 3s pela captura terminar naturalmente; senão, força fechamento.
      await Promise.race([promise, esperar(3000)]);
    } catch {
      // Timeout ou erro: força fechar a aba.
    }
    try {
      await fecharNoComprasnet(codigo);
    } catch {
      // Ignora erro de fechamento (aba pode já estar fechada).
    }
  });
  capturesAtivas.clear();
  await Promise.allSettled(closes);
}

/**
 * Constrói a fila contínua de monitoramento:
 * 1. NOVAS compras (em `recentes` ou nunca capturadas) → FRENTE da fila
 * 2. FAVORITAS → logo após as novas (prioridade no ciclo)
 * 3. DEMAIS → ordenadas das mais antigas (meio) para as mais recentemente atualizadas (FIM da fila)
 * Isso cria um loop contínuo onde quem acabou de atualizar aguarda o fim da fila para rodar de novo.
 */
function construirFila(): string[] {
  const capturaMap = new Map<string, string | null>();
  const favoritaMap = new Map<string, boolean>();
  for (const c of estado.compras) {
    capturaMap.set(c.codigo_compra, c.ultima_captura);
    favoritaMap.set(c.codigo_compra, !!c.favorita);
  }

  const ativasList = [...ativas];

  // 1. NOVAS: em estado.recentes ou que nunca tiveram nenhuma captura (ultima_captura nula)
  const novas = ativasList.filter((c) => estado.recentes.includes(c) || !capturaMap.get(c));

  // 2. FAVORITAS (já capturadas) + 3. DEMAIS
  const comCaptura = ativasList.filter((c) => !novas.includes(c));
  const favoritas = comCaptura.filter((c) => favoritaMap.get(c));
  const demais = comCaptura.filter((c) => !favoritaMap.get(c));

  // Ordena demais: as que têm a última captura mais antiga vêm primeiro,
  // e as atualizadas mais recentemente vão para o FINAL DA FILA.
  demais.sort((a, b) => {
    const ta = capturaMap.get(a) || "";
    const tb = capturaMap.get(b) || "";
    return ta.localeCompare(tb);
  });

  // Fila: [NOVAS na frente] -> [FAVORITAS em seguida] -> [Demais (mais antigas primeiro)]
  return [...novas, ...favoritas, ...demais];
}

export async function iniciar() {
  if (estado.rodando) return;
  try {
    localStorage.setItem("peppa_ciclo_ativo", "1");
  } catch {}
  set({ aviso: "" });
  const versao = await detectarExtensao(3000);
  if (!versao) {
    try { localStorage.removeItem("peppa_ciclo_ativo"); } catch {}
    return set({ aviso: "Extensão PEPPACORP Monitor não encontrada neste navegador. Instale-a em Conectar Robô." });
  }
  if (!versaoMinima(versao, VERSAO_MINIMA)) {
    try { localStorage.removeItem("peppa_ciclo_ativo"); } catch {}
    return set({ aviso: `A extensão está na v${versao}. O ciclo precisa da v${VERSAO_MINIMA} ou mais nova: baixe de novo em Conectar Robô.` });
  }
  parar = false;
  prioridade = [];
  set({ rodando: true, ciclo: 1, lote: 0 });
  try {
    await carregar(true);
    fila = construirFila();
    const mapCompras = new Map(estado.compras.map((c) => [c.codigo_compra, c]));
    const comprasOrdenadas = fila.map((cod) => mapCompras.get(cod)).filter(Boolean) as CompraAdmin[];
    set({
      compras: comprasOrdenadas.length ? comprasOrdenadas : estado.compras,
      situacao: Object.fromEntries(fila.map((c) => [c, { estado: "fila" as EstadoCiclo }])),
    });
    await rodarFila();
  } finally {
    set({ rodando: false });
    void carregar(true);
  }
}

export function pararCiclo() {
  parar = true;

  // Fecha todas as páginas do Comprasnet abertas pelo ciclo.
  closeLoteAtual();

  try {
    localStorage.removeItem("peppa_ciclo_ativo");
  } catch {}
  set({ rodando: false });
}

/** Ao sair da conta: para o ciclo e a vigia e esquece a lista. */
export function encerrarSessao() {
  parar = true;
  try {
    localStorage.removeItem("peppa_ciclo_ativo");
  } catch {}
  if (vigia) clearInterval(vigia);
  vigia = null;
  conhecidas = null;
  set({ compras: [], recentes: [], situacao: {}, ciclo: 0, lote: 0, erro: "", aviso: "", tempos_ciclo: {} });
}
