import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Sem as variáveis de ambiente o app roda em modo demonstração (dados no navegador). */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
export const isDemo = !supabase;

/** Cliente com service role — só no servidor (rota de ingestão do monitor). */
export function serviceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
