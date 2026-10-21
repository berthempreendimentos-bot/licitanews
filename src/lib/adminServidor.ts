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

/** Id do usuário logado (header Authorization: Bearer <token do Supabase>) se for administrador; senão null. */
export async function adminDaRequisicao(sb: SupabaseClient, req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await sb.auth.getUser(token);
  const user = data.user;
  return user && user.app_metadata?.role === "admin" ? user.id : null;
}
