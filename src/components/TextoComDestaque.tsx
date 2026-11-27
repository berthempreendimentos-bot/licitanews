"use client";

import { Fragment, useMemo, type ReactNode } from "react";

/**
 * Texto com as palavras-chave da empresa em destaque.
 * Usado nas mensagens do chat e nos alertas: sempre que um termo vigiado
 * aparece, ele fica marcado para chamar o olho na hora.
 */

/** Normaliza o texto guardando o índice original de cada caractere (para marcar o trecho certo). */
function normalizarComIndices(texto: string): { norm: string; indices: number[] } {
  let norm = "";
  const indices: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const n = texto[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (const c of n) {
      norm += c;
      indices.push(i);
    }
  }
  return { norm, indices };
}

type Trecho = { ini: number; fim: number };

/** Trechos do texto original onde cada termo aparece (sem acento e sem diferenciar maiúsculas). */
function encontrarTrechos(texto: string, termos: string[]): Trecho[] {
  const { norm, indices } = normalizarComIndices(texto);
  const trechos: Trecho[] = [];

  for (const termo of termos) {
    const t = termo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    if (t.length < 2) continue; // evita marcar trechos curtos demais ("a", "de")
    let de = 0;
    for (;;) {
      const i = norm.indexOf(t, de);
      if (i < 0) break;
      const ini = indices[i];
      const fim = indices[i + t.length - 1] + 1;
      if (fim > ini) trechos.push({ ini, fim });
      de = i + t.length;
    }
  }

  // Junta trechos sobrepostos (um termo dentro do outro) para não aninhar marcações.
  trechos.sort((a, b) => a.ini - b.ini);
  const unidos: Trecho[] = [];
  for (const t of trechos) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && t.ini <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, t.fim);
    else unidos.push({ ...t });
  }
  return unidos;
}

export function TextoComDestaque({ texto, termos, className }: { texto: string; termos: string[]; className?: string }) {
  const partes = useMemo<ReactNode[]>(() => {
    if (!texto || !termos.length) return [texto];
    const trechos = encontrarTrechos(texto, termos);
    if (!trechos.length) return [texto];

    const saida: ReactNode[] = [];
    let pos = 0;
    trechos.forEach((t, i) => {
      if (t.ini > pos) saida.push(<Fragment key={`t${i}`}>{texto.slice(pos, t.ini)}</Fragment>);
      saida.push(
        <mark
          key={`m${i}`}
          className="bg-yellow-200 text-text px-1 py-px rounded font-semibold"
          title="Palavra-chave da sua empresa"
        >
          {texto.slice(t.ini, t.fim)}
        </mark>
      );
      pos = t.fim;
    });
    if (pos < texto.length) saida.push(<Fragment key="fim">{texto.slice(pos)}</Fragment>);
    return saida;
  }, [texto, termos]);

  return <span className={className}>{partes}</span>;
}
