import type { SupabaseClient } from "@supabase/supabase-js";

// Administrador = usuário com app_metadata.role = "admin" no Supabase Auth (só o painel do Supabase altera).
const cache = new Map<string, { admin: boolean; ate: number }>();

/** O usuário é administrador? Guarda a resposta por 5 minutos (a ingestão consulta a cada lote). */
export async function ehAdmin(sb: SupabaseClient, userId: string): Promise<boolean> {
  const c = cache.get(userId);
  if (c && c.ate > Date.now()) return c.admin;
  const { data } = await sb.auth.admin.getUserById(userId);
  const admin = data.user?.app_metadata?.role === "admin";
  cache.set(userId, { admin, ate: Date.now() + 5 * 60000 });
  return admin;
}

/** Usuário logado (header Authorization: Bearer <token do Supabase>), ou null. */
export async function usuarioDaRequisicao(sb: SupabaseClient, req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await sb.auth.getUser(token);
  return data.user ?? null;
}

/** Id do usuário logado se for administrador; senão null. */
export async function adminDaRequisicao(sb: SupabaseClient, req: Request): Promise<string | null> {
  const user = await usuarioDaRequisicao(sb, req);
  return user && user.app_metadata?.role === "admin" ? user.id : null;
}
