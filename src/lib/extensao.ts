"use client";

import { comprasnetUrl } from "./monitor";

// A extensão PEPPACORP Monitor se anuncia com PEPPA_EXT_HELLO (ao carregar e em resposta a PEPPA_EXT_PING).
let versaoExtensao: string | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("message", (ev) => {
    if (ev.source === window && ev.data?.type === "PEPPA_EXT_HELLO") versaoExtensao = String(ev.data.version || "");
  });
  // O anúncio inicial da extensão sai antes deste código carregar: pede de novo.
  window.postMessage({ type: "PEPPA_EXT_PING" }, window.location.origin);
}

/** Resolve com a versão da extensão, ou null se ela não responder em `ms`. */
export function detectarExtensao(ms = 600): Promise<string | null> {
  if (versaoExtensao) return Promise.resolve(versaoExtensao);
  return new Promise((resolve) => {
    const t = setTimeout(() => { window.removeEventListener("message", on); resolve(versaoExtensao); }, ms);
    function on(ev: MessageEvent) {
      if (ev.source !== window || ev.data?.type !== "PEPPA_EXT_HELLO") return;
      clearTimeout(t);
      window.removeEventListener("message", on);
      resolve(String(ev.data.version || ""));
    }
    window.addEventListener("message", on);
    window.postMessage({ type: "PEPPA_EXT_PING" }, window.location.origin);
  });
}

type Abertura = { ok: boolean; jaAberta?: boolean; viaExtensao: boolean };

/**
 * Abre a página de acompanhamento da compra no Comprasnet.
 * - mostrar = false (ao cadastrar): com a extensão, numa janela minimizada e sem som, para capturar em segundo plano.
 * - mostrar = true (botão "Abrir no Comprasnet"): traz para frente a aba da compra (ou abre uma visível).
 * Sem a extensão: abre numa aba nova — na hora do clique, senão o navegador bloqueia o pop-up.
 */
export function abrirNoComprasnet(codigo: string, mostrar = false, janela?: number): Promise<Abertura> {
  const url = comprasnetUrl(codigo);
  if (!versaoExtensao) {
    window.open(url, "_blank", "noopener");
    return Promise.resolve({ ok: true, viaExtensao: false });
  }
  return new Promise((resolve) => {
    const reqId = `open-${codigo}-${Date.now()}`;
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ ok: false, viaExtensao: true });
    }, 5000);
    function onMessage(ev: MessageEvent) {
      if (ev.source !== window || ev.data?.type !== "PEPPA_EXT_OPEN_RESULT" || ev.data.reqId !== reqId) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve({ ok: !!ev.data.ok, jaAberta: !!ev.data.already_open, viaExtensao: true });
    }
    window.addEventListener("message", onMessage);
    // janela (extensão v0.7.0+): número da janela minimizada onde a aba abre (ciclo do administrador).
    window.postMessage({ type: "PEPPA_EXT_OPEN", reqId, url, show: mostrar, janela }, window.location.origin);
  });
}

/** Fecha no navegador as abas da compra no Comprasnet (pela extensão). */
export function fecharNoComprasnet(codigo: string): Promise<boolean> {
  return new Promise((resolve) => {
    const reqId = `close-${codigo}-${Date.now()}`;
    const timer = setTimeout(() => { window.removeEventListener("message", onMessage); resolve(false); }, 5000);
    function onMessage(ev: MessageEvent) {
      if (ev.source !== window || ev.data?.type !== "PEPPA_EXT_CLOSE_RESULT" || ev.data.reqId !== reqId) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(!!ev.data.ok);
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ type: "PEPPA_EXT_CLOSE", reqId, codigo_compra: codigo }, window.location.origin);
  });
}

export type EstadoCaptura = "registrado" | "captcha" | "concluido" | "incompleto" | "encerrado" | "nao_monitorada";

/** Pede à aba já aberta da compra que avise de novo o estado da captura (extensão v0.6.0+). */
export function pedirEstadoCaptura(codigo: string) {
  window.postMessage({ type: "PEPPA_EXT_CAPTURE_RESET", codigo_compra: codigo }, window.location.origin);
}

/**
 * Escuta o andamento da captura de uma compra (avisado pela extensão a partir da v0.5.0).
 * "registrado" e "captcha" são intermediários; os demais encerram a espera.
 * Devolve a função que para de escutar.
 */
export function escutarCaptura(codigo: string, aoMudar: (estado: EstadoCaptura, synced: number) => void): () => void {
  function onMessage(ev: MessageEvent) {
    if (ev.source !== window || ev.data?.type !== "PEPPA_EXT_CAPTURE" || ev.data.codigo_compra !== codigo) return;
    aoMudar(ev.data.estado as EstadoCaptura, Number(ev.data.synced) || 0);
  }
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
