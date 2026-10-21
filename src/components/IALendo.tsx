"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { RoboIcon } from "./IAStatus";

/** Etapas mostradas enquanto a IA lê o edital (avançam pelo tempo; a última fica até a resposta chegar). */
function etapas(origem: "pncp" | "arquivo" | "texto") {
  return [
    { ate: 10, texto: origem === "pncp" ? "Baixando o edital e os anexos no PNCP" : origem === "arquivo" ? "Enviando o PDF para a IA" : "Enviando o texto para a IA" },
    { ate: 30, texto: "Lendo o edital página por página" },
    { ate: 55, texto: "Encontrando prazos, habilitação e declarações" },
    { ate: 80, texto: "Avaliando riscos e pontos de impugnação" },
    { ate: Infinity, texto: "Montando o relatório e o checklist" },
  ];
}

/** Animação de "IA lendo o edital": robô, documento sendo escaneado, etapas e cronômetro. */
export function IALendo({ origem, provedor }: { origem: "pncp" | "arquivo" | "texto"; provedor: string }) {
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    const inicio = Date.now();
    const t = setInterval(() => setSeg(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const lista = etapas(origem);
  const atual = lista.findIndex((e) => seg < e.ate);
  const relogio = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;

  return (
    <div role="status" aria-live="polite" className="overflow-hidden rounded-xl border border-green-600/20 bg-gradient-to-br from-green-50 via-white to-white p-5">
      <div className="flex items-center gap-5">
        {/* Robô + documento sendo escaneado */}
        <div className="relative h-24 w-24 shrink-0">
          <div className="ia-doc absolute right-0 top-2 h-20 w-16 overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="mx-2 mt-2 h-1 rounded-full bg-neutral-200" style={{ width: `${[80, 65, 90, 55, 75, 85, 50][i]}%` }} />
            ))}
            <div className="ia-scan absolute inset-x-0 h-5 bg-gradient-to-b from-transparent via-green-400/40 to-transparent" />
          </div>
          <div className="ia-robo absolute -left-1 bottom-0 grid h-14 w-14 place-items-center rounded-full bg-green-600 text-white shadow-lg ring-4 ring-green-100">
            <RoboIcon size={30} />
          </div>
          <span className="ia-faisca absolute left-11 top-0 text-green-500">✦</span>
          <span className="ia-faisca ia-faisca-2 absolute left-2 top-5 text-[10px] text-green-400">✦</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-brand">A IA está lendo o edital</span>
            <span className="ia-pontos text-green-600" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
            <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-muted ring-1 ring-border">{relogio}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">{provedor} · editais longos levam de 1 a 3 minutos. Pode continuar usando o PEPPACORP em outra aba.</div>
          <ol className="mt-3 space-y-1.5">
            {lista.map((e, i) => {
              const feito = i < atual;
              const agora = i === atual;
              return (
                <li key={e.texto} className={`flex items-center gap-2 text-sm transition ${feito ? "text-green-700" : agora ? "font-semibold text-brand" : "text-muted/60"}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${feito ? "bg-green-600 text-white" : agora ? "bg-green-100 text-green-700" : "bg-bg"}`}>
                    {feito ? <Check size={12} strokeWidth={3} /> : agora ? <Loader2 size={12} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />}
                  </span>
                  {e.texto}
                </li>
              );
            })}
          </ol>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-green-100">
            <div className="ia-barra h-full w-1/3 rounded-full bg-green-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
