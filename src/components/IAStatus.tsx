"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEmpresa } from "@/lib/store";
import { iaDaEmpresa } from "@/lib/ia";

/** Robô (antena, cabeça com olhos e sorriso vazados, orelhas e pescoço). Usa a cor do texto. */
export function RoboIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
      <circle cx="32" cy="6.5" r="4" />
      <rect x="30.5" y="9" width="3" height="8" />
      <rect x="25" y="14.5" width="14" height="6" rx="2" />
      <rect x="6" y="28" width="7" height="16" rx="2.5" />
      <rect x="51" y="28" width="7" height="16" rx="2.5" />
      <path fillRule="evenodd" d={[
        "M21 20H43A7 7 0 0 1 50 27V45A7 7 0 0 1 43 52H21A7 7 0 0 1 14 45V27A7 7 0 0 1 21 20Z",
        "M20 33a4 4 0 1 0 8 0a4 4 0 1 0-8 0Z",
        "M36 33a4 4 0 1 0 8 0a4 4 0 1 0-8 0Z",
        "M24 39H40V40.5A8 7 0 0 1 24 40.5Z",
      ].join("")} />
      <rect x="21" y="54" width="22" height="4" rx="2" />
      <rect x="25" y="59.5" width="14" height="3.5" rx="1" />
    </svg>
  );
}

/**
 * Robô da IA no topo: verde = IA ligada (o provedor escolhido em Configurações está pronto),
 * preto = desligada. Clicar leva para Configurações → Inteligência artificial.
 */
export function IAStatus() {
  const { empresa } = useEmpresa();
  const [claudeNoServidor, setClaudeNoServidor] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/ia").then((r) => r.json()).then((d) => setClaudeNoServidor(!!d.claude)).catch(() => setClaudeNoServidor(false));
  }, []);

  const ia = iaDaEmpresa(empresa);
  const ligada = ia.provedor === "gemini" ? !!ia.gemini_key.trim() : !!claudeNoServidor;
  const nome = ia.provedor === "gemini" ? "Google Gemini" : "Claude";
  const dica = ligada ? `IA ligada · ${nome}` : `IA desligada · configure em Configurações`;

  return (
    <Link href="/configuracoes" title={dica} aria-label={dica}
      className={`shrink-0 transition hover:opacity-80 ${ligada ? "text-green-600" : "text-black"}`}>
      <RoboIcon />
    </Link>
  );
}
