import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./supabase";
import { ehAdmin } from "./adminServidor";
import type { Empresa } from "./types";

/**
 * API de dados (/api/v1): expõe para fora do app o que o ciclo de monitoramento captura no Comprasnet.
 * Autenticação: header x-api-key com a chave da empresa (a mesma "chave de ingestão" de Configurações).
 * Chave de administrador enxerga as compras de todos os usuários; a dos demais, só as próprias.
 */

export type Acesso = { sb: SupabaseClient; userId: string; empresa: Empresa; admin: boolean };

// Leitura por qualquer origem (scripts, planilhas, agentes): a proteção é a chave, não o domínio.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, x-ingest-key, content-type",
};

export function resposta(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Acesso pela chave do header, ou a resposta de erro pronta. */
export async function acessoDaRequisicao(req: Request): Promise<Acesso | Response> {
  const sb = serviceClient();
  if (!sb) return resposta({ error: "Supabase não configurado no servidor" }, 503);
  const key = req.headers.get("x-api-key") || req.headers.get("x-ingest-key") || "";
  if (key.length < 16) return resposta({ error: "envie a chave da empresa no header x-api-key" }, 401);
  const { data: emp } = await sb
    .from("records")
    .select("user_id, data")
    .eq("collection", "empresa")
    .eq("data->>ingest_key", key)
    .maybeSingle();
  if (!emp) return resposta({ error: "chave inválida" }, 401);
  const userId = emp.user_id as string;
  return { sb, userId, empresa: emp.data as Empresa, admin: await ehAdmin(sb, userId) };
}

/** Número do parâmetro `nome` entre 1 e `max` (padrão `padrao`). */
export function limite(url: URL, padrao: number, max: number, nome = "limite") {
  const n = Number(url.searchParams.get(nome));
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), max) : padrao;
}

/** Parâmetro `desde` como data ISO válida, ou null. */
export function desde(url: URL) {
  const d = url.searchParams.get("desde");
  return d && !isNaN(Date.parse(d)) ? new Date(d).toISOString() : null;
}
