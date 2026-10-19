import type { ConfigIA, Empresa } from "./types";

/** Modelo usado se nenhum for escolhido. "Testar chave" em Configurações lista os modelos disponíveis na conta. */
export const GEMINI_MODELO_PADRAO = "gemini-2.5-flash";

export function iaDaEmpresa(empresa: Pick<Empresa, "ia">): ConfigIA {
  return { provedor: "claude", gemini_key: "", gemini_modelo: GEMINI_MODELO_PADRAO, ...(empresa.ia ?? {}) };
}

/** Cabeçalhos que levam o provedor escolhido às rotas de IA do servidor. */
export function cabecalhosIA(empresa: Pick<Empresa, "ia">): Record<string, string> {
  const ia = iaDaEmpresa(empresa);
  if (ia.provedor !== "gemini") return { "x-ia-provedor": "claude" };
  return { "x-ia-provedor": "gemini", "x-gemini-key": ia.gemini_key, "x-gemini-modelo": ia.gemini_modelo || GEMINI_MODELO_PADRAO };
}
