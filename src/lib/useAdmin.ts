"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * O usuário logado é administrador (app_metadata.role = "admin")? null enquanto confere.
 * Sem Supabase (modo demonstração, só em desenvolvimento) não há login: tudo liberado.
 */
export function useAdmin(): boolean | null {
  const [admin, setAdmin] = useState<boolean | null>(supabase ? null : true);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setAdmin(data.session?.user.app_metadata?.role === "admin"));
  }, []);
  return admin;
}

/** fetch com o token do usuário logado (as rotas conferem quem é; as /api/admin, se é administrador). */
export async function fetchComLogin(url: string, init: RequestInit = {}) {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session?.access_token ?? ""}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const r = await fetch(url, { ...init, headers });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

export const fetchAdmin = fetchComLogin;
