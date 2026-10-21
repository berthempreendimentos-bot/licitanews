"use client";

import { useSyncExternalStore } from "react";
import { abrirNoComprasnet, detectarExtensao, escutarCaptura, fecharNoComprasnet, pedirEstadoCaptura } from "./extensao";
import { fetchAdmin } from "./useAdmin";
import type { CompraAdmin } from "@/app/api/admin/monitoramento/route";

/**
 * Robô do administrador: atualiza no Comprasnet as compras monitoradas por TODOS os usuários
 * (a captura do administrador é gravada para cada usuário que monitora a compra).
 * Fica neste módulo, e não numa página, para continuar rodando enquanto o administrador navega.
 */

/** Cada lote abre JANELAS janelas minimizadas com ABAS_POR_JANELA compras cada. */
export const JANELAS = 3;
export const ABAS_POR_JANELA = 3;
export const TAMANHO_LOTE = JANELAS * ABAS_POR_JANELA;
/** Tempo máximo para uma compra importar o chat antes de passar para a próxima. */
export const TEMPO_LIMITE_MS = 5 * 60000;
/** A compra precisa responder (portal carregado e logado) em até este tempo; senão é pulada. */
const TEMPO_RESPOSTA_MS = 60000;
/** De quanto em quanto tempo procura compras novas cadastradas pelos usuários. */
export const VERIFICAR_NOVAS_MS = 20000;
/** Versão mínima da extensão (avisa o fim da captura e reenvia o estado de abas já abertas). */
const VERSAO_MINIMA = "0.8.0";

export type EstadoCiclo = "fila" | "abrindo" | "capturando" | "captcha" | "concluido" | "incompleto" | "encerrado" | "nao_monitorada" | "sem_resposta" | "tempo" | "erro" | "parado";
export type Situacao = { estado: EstadoCiclo; synced?: number; detalhe?: string };

/**
 * rodando: robô ligado. concluido: a fila do ciclo acabou (não começa outro); o robô segue ligado
 * só para atualizar na hora as compras novas que os usuários cadastrarem.
 */
export type CicloEstado = {
  compras: CompraAdmin[];
  recentes: string[];
  situacao: Record<string, Situacao>;
  rodando: boolean;
  concluido: boolean;
  lote: number;
  carregando: boolean;
  erro: string;
  aviso: string;
};

let estado: CicloEstado = {
  compras: [], recentes: [], situacao: {}, rodando: false, concluido: false, lote: 0, carregando: false, erro: "", aviso: "",
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
    const topo = recentes.map((c) => lista.find((x) => x.codigo_compra === c)).filter((c): c is CompraAdmin => !!c);
    set({ erro: "", recentes, compras: [...topo, ...lista.filter((c) => !recentes.includes(c.codigo_compra))] });
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
  aberturas = r.catch(() => {});
  return r;
}

/** Abre a compra na janela indicada, espera a extensão avisar que importou o chat e fecha a aba (se foi aberta aqui). */
async function atualizar(codigo: string, janela: number) {
  marcar(codigo, { estado: "abrindo" });
  const fim: { s: Situacao | null; respondeu: boolean } = { s: null, respondeu: false };
  // Escuta antes de abrir: o aviso pode chegar logo depois da abertura.
  const pararDeEscutar = escutarCaptura(codigo, (e, synced) => {
    fim.respondeu = true;
    if (e === "captcha") marcar(codigo, { estado: "captcha", synced });
    else if (e !== "registrado") fim.s = { estado: e, synced };
  });
  try {
    const r = await abrirEmOrdem(codigo, janela);
    if (!r.ok) return marcar(codigo, { estado: "erro", detalhe: "a extensão não abriu a compra" });
    // Já estava aberta: os avisos dela já saíram, então pede o estado de novo.
    if (r.jaAberta) pedirEstadoCaptura(codigo);
    if (!fim.s) marcar(codigo, { estado: "capturando" });
    const inicio = Date.now();
    while (!fim.s && !parar && Date.now() - inicio < TEMPO_LIMITE_MS) {
      // Portal não carregou a compra (ex.: deslogado): pula para a próxima.
      if (!fim.respondeu && Date.now() - inicio > TEMPO_RESPOSTA_MS) {
        fim.s = { estado: "sem_resposta", detalhe: "o Comprasnet não carregou a compra (confira se está logado)" };
        break;
      }
      await esperar(1000);
    }
    marcar(codigo, fim.s ?? { estado: parar ? "parado" : "tempo" });
    if (!r.jaAberta) await fecharNoComprasnet(codigo);
  } finally {
    pararDeEscutar();
  }
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
 * Lotes de JANELAS janelas × ABAS_POR_JANELA abas. O próximo lote só abre quando todas as compras
 * do lote atual terminaram (cada aba fecha ao terminar; a janela some com a última aba).
 */
async function rodarFila() {
  while (!parar) {
    const lote: string[] = [];
    for (let c = proxima(); c; c = lote.length < TAMANHO_LOTE ? proxima() : null) lote.push(c);
    if (!lote.length) return;
    set({ lote: estado.lote + 1 });
    await Promise.all(lote.map((c, i) => atualizar(c, Math.floor(i / ABAS_POR_JANELA))));
  }
}

export async function iniciar() {
  if (estado.rodando) return;
  set({ aviso: "" });
  const versao = await detectarExtensao(3000);
  if (!versao) return set({ aviso: "Extensão PEPPACORP Monitor não encontrada neste navegador. Instale-a em Conectar Robô." });
  if (!versaoMinima(versao, VERSAO_MINIMA)) return set({ aviso: `A extensão está na v${versao}. O ciclo precisa da v${VERSAO_MINIMA} ou mais nova: baixe de novo em Conectar Robô.` });
  parar = false;
  prioridade = [];
  set({ rodando: true, concluido: false, lote: 0 });
  try {
    await carregar(true);
    // Mesma ordem da tabela: novas primeiro, depois as mais desatualizadas.
    const ordem = [...estado.recentes.filter((c) => ativas.has(c)), ...[...ativas].filter((c) => !estado.recentes.includes(c))];
    fila = ordem;
    set({ situacao: Object.fromEntries(ordem.map((c) => [c, { estado: "fila" as EstadoCiclo }])) });
    await rodarFila();
    if (parar) return;
    // Fila acabou: não começa outro ciclo. Compra nova cadastrada depois disso é atualizada na hora.
    set({ concluido: true });
    while (!parar) {
      await esperar(Infinity, () => prioridade.length > 0);
      if (prioridade.length) await rodarFila();
    }
  } finally {
    set({ rodando: false });
    void carregar(true);
  }
}

export function pararCiclo() {
  parar = true;
}

/** Ao sair da conta: para o ciclo e a vigia e esquece a lista. */
export function encerrarSessao() {
  parar = true;
  if (vigia) clearInterval(vigia);
  vigia = null;
  conhecidas = null;
  set({ compras: [], recentes: [], situacao: {}, concluido: false, lote: 0, erro: "", aviso: "" });
}

// ===== Início automático (preferência deste navegador) =====
const CHAVE_AUTO = "ciclo-admin-auto";

export function inicioAutomatico(): boolean {
  try { return localStorage.getItem(CHAVE_AUTO) !== "0"; } catch { return true; }
}

export function setInicioAutomatico(ligado: boolean) {
  try { localStorage.setItem(CHAVE_AUTO, ligado ? "1" : "0"); } catch { /* sem acesso ao armazenamento */ }
}
