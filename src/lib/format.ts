export function brl(v: number | null | undefined, compact = false) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (compact && Math.abs(v) >= 1000) {
    const units: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
    for (const [n, s] of units) if (Math.abs(v) >= n) return `R$ ${(v / n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${s}`;
  }
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v >= 1000 ? 0 : 2 });
}

export function dataBR(iso: string | null | undefined, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return withTime
    ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR");
}

/** Dias inteiros até a data (negativo = passou). */
export function diasAte(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.ceil((d - Date.now()) / 86400000);
}

export function nowIso() {
  return new Date().toISOString();
}
