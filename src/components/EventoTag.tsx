/**
 * Cores dos eventos do chat (mesmas em todas as telas):
 * vermelho = menção e prazo, azul = convocação, amarelo = recurso, verde = habilitação,
 * laranja = suspensão, roxo = reabertura, cinza = sessão encerrada.
 * Classes escritas por extenso para o Tailwind encontrá-las.
 */
type Cor = { tag: string; borda: string; ponto: string };

const CORES: Record<string, Cor> = {
  "Menção": { tag: "bg-red-600 text-white", borda: "border-l-red-600", ponto: "bg-red-600" },
  "PRAZO": { tag: "bg-red-100 text-red-700 ring-1 ring-red-200", borda: "border-l-red-500", ponto: "bg-red-500" },
  "CONVOCAÇÃO": { tag: "bg-blue-100 text-blue-700 ring-1 ring-blue-200", borda: "border-l-blue-500", ponto: "bg-blue-500" },
  "RECURSO": { tag: "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300", borda: "border-l-yellow-400", ponto: "bg-yellow-400" },
  "HABILITAÇÃO": { tag: "bg-green-100 text-green-700 ring-1 ring-green-200", borda: "border-l-green-500", ponto: "bg-green-500" },
  "SUSPENSÃO": { tag: "bg-orange-100 text-orange-700 ring-1 ring-orange-200", borda: "border-l-orange-500", ponto: "bg-orange-500" },
  "REABERTURA": { tag: "bg-violet-100 text-violet-700 ring-1 ring-violet-200", borda: "border-l-violet-500", ponto: "bg-violet-500" },
  "SESSÃO ENCERRADA": { tag: "bg-neutral-200 text-neutral-700 ring-1 ring-neutral-300", borda: "border-l-neutral-400", ponto: "bg-neutral-400" },
  "Mensagem do pregoeiro": { tag: "bg-sky-100 text-sky-700 ring-1 ring-sky-200", borda: "border-l-sky-500", ponto: "bg-sky-500" },
};

export function corEvento(evento: string | null | undefined): Cor | null {
  return evento ? CORES[evento] ?? null : null;
}

export function EventoTag({ evento, className = "" }: { evento: string; className?: string }) {
  const cor = corEvento(evento);
  return <span className={`badge ${cor ? cor.tag : "bg-neutral-200 text-neutral-700"} ${className}`}>{evento}</span>;
}

/** Bolinha de cor (para listas, ex.: eventos na página do alarme). */
export function EventoPonto({ evento }: { evento: string }) {
  const cor = corEvento(evento);
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cor ? cor.ponto : "bg-neutral-300"}`} />;
}
