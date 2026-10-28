"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import type { CollectionName, Collections, Empresa } from "./types";

/**
 * Armazenamento genérico por coleção.
 * - Modo demonstração: localStorage do navegador.
 * - Com Supabase: tabela `records` (user_id, collection, id, data jsonb), protegida por RLS.
 */

type Rec = { id: string };
const cache = new Map<CollectionName, Rec[]>();
const loaded = new Set<CollectionName>();
const listeners = new Map<CollectionName, Set<() => void>>();
const EMPTY: Rec[] = [];
const LS_PREFIX = "peppacorp:";

function emit(name: CollectionName) {
  listeners.get(name)?.forEach((l) => l());
}

function readLocal(name: CollectionName): Rec[] {
  try {
    const raw = localStorage.getItem(LS_PREFIX + name);
    return raw ? (JSON.parse(raw) as Rec[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(name: CollectionName, items: Rec[]) {
  try {
    localStorage.setItem(LS_PREFIX + name, JSON.stringify(items));
  } catch {
    /* armazenamento indisponível: mantém só em memória */
  }
}

async function userId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function load(name: CollectionName) {
  if (loaded.has(name)) return;
  loaded.add(name);
  if (!supabase) {
    cache.set(name, readLocal(name));
    emit(name);
    return;
  }
  // O Supabase devolve no máximo 1.000 linhas por consulta: lê em páginas até acabar.
  const PAGINA = 1000;
  const todos: Rec[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from("records")
      .select("data")
      .eq("collection", name)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) { console.error("[store] load", name, error.message); break; }
    todos.push(...(data ?? []).map((r) => r.data as Rec));
    if (!data || data.length < PAGINA) break;
  }
  cache.set(name, todos);
  emit(name);
}

async function persistUpsert(name: CollectionName, recs: Rec[]) {
  if (!supabase) {
    writeLocal(name, cache.get(name) ?? []);
    return;
  }
  const uid = await userId();
  if (!uid) return;
  // Em lotes, para importações e coleções grandes não estourarem o tamanho do pedido.
  for (let i = 0; i < recs.length; i += 500) {
    const { error } = await supabase
      .from("records")
      .upsert(recs.slice(i, i + 500).map((r) => ({ user_id: uid, collection: name, id: r.id, data: r })));
    if (error) console.error("[store] upsert", name, error.message);
  }
}

async function persistDelete(name: CollectionName, id: string) {
  if (!supabase) {
    writeLocal(name, cache.get(name) ?? []);
    return;
  }
  const { error } = await supabase.from("records").delete().eq("collection", name).eq("id", id);
  if (error) console.error("[store] delete", name, error.message);
}

const COLECOES: CollectionName[] = [
  "empresa", "pregoes", "chat_messages", "alerts", "propostas", "analises",
  "favoritos", "crm_cards", "radar_profiles", "agenda_events", "documentos", "pastas",
];

/**
 * Tempo real (Supabase): linhas gravadas por outro lugar — a extensão, pela rota de ingestão,
 * ou outra aba/dispositivo — entram no cache e na tela sem recarregar. Devolve a função para cancelar.
 */
export function assinarTempoReal(uid: string): () => void {
  if (!supabase) return () => {};
  const sb = supabase;
  const canal = sb
    .channel(`records-${uid}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "records", filter: `user_id=eq.${uid}` }, (ev) => {
      const linha = (ev.eventType === "DELETE" ? ev.old : ev.new) as { collection?: CollectionName; id?: string; data?: Rec };
      const nome = linha.collection;
      if (!nome || !loaded.has(nome)) return; // coleção ainda não aberta: carrega fresca quando for usada
      const atual = cache.get(nome) ?? [];
      if (ev.eventType === "DELETE") {
        cache.set(nome, atual.filter((r) => r.id !== linha.id));
      } else if (linha.data) {
        const existe = atual.some((r) => r.id === linha.data!.id);
        cache.set(nome, existe ? atual.map((r) => (r.id === linha.data!.id ? linha.data! : r)) : [linha.data, ...atual]);
      }
      emit(nome);
    })
    .subscribe();
  return () => { void sb.removeChannel(canal); };
}

/** Apaga os dados do modo demonstração guardados neste navegador. */
export function descartarDadosLocais() {
  for (const c of COLECOES) {
    try { localStorage.removeItem(LS_PREFIX + c); } catch { /* sem acesso ao armazenamento */ }
  }
}

export function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const db = {
  get<N extends CollectionName>(name: N): Collections[N][] {
    return (cache.get(name) ?? []) as Collections[N][];
  },
  /** Insere ou substitui vários registros (dedupe por id). */
  upsertMany<N extends CollectionName>(name: N, recs: Collections[N][]) {
    if (!recs.length) return;
    const current = cache.get(name) ?? [];
    const byId = new Map(current.map((r) => [r.id, r]));
    const fresh: Rec[] = [];
    for (const r of recs) {
      if (!byId.has(r.id)) fresh.push(r);
      byId.set(r.id, r);
    }
    const kept = current.map((r) => byId.get(r.id)!);
    cache.set(name, [...fresh.reverse(), ...kept]);
    emit(name);
    void persistUpsert(name, recs);
  },
  upsert<N extends CollectionName>(name: N, rec: Collections[N]) {
    db.upsertMany(name, [rec]);
  },
  update<N extends CollectionName>(name: N, id: string, patch: Partial<Collections[N]>) {
    const current = (cache.get(name) ?? []) as Collections[N][];
    const found = current.find((r) => r.id === id);
    if (!found) return;
    db.upsert(name, { ...found, ...patch });
  },
  remove(name: CollectionName, id: string) {
    cache.set(name, (cache.get(name) ?? []).filter((r) => r.id !== id));
    emit(name);
    void persistDelete(name, id);
  },
  /** Recarrega tudo (após login/logout). */
  reset() {
    loaded.clear();
    cache.clear();
    listeners.forEach((_, name) => {
      void load(name);
    });
  },
};

export function useCollection<N extends CollectionName>(name: N) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(cb);
      return () => listeners.get(name)!.delete(cb);
    },
    [name],
  );
  const items = useSyncExternalStore(
    subscribe,
    () => (cache.get(name) ?? EMPTY) as Collections[N][],
    () => EMPTY as Collections[N][],
  );
  useEffect(() => {
    void load(name);
  }, [name]);
  return { items, ready: loaded.has(name) && cache.has(name) };
}

const EMPRESA_ID = "principal";

export function defaultEmpresa(): Empresa {
  return {
    id: EMPRESA_ID,
    razao_social: "",
    cnpj: "",
    ufs: [],
    produtos: "",
    palavras_chave: [],
    ingest_key: newId().replace(/-/g, ""),
    created_at: new Date().toISOString(),
  };
}

const FALLBACK_EMPRESA: Empresa = { ...defaultEmpresa(), ingest_key: "" };

/** Perfil único da empresa (razão social, CNPJ, UFs, palavras-chave de alerta). */
export function useEmpresa() {
  const { items, ready } = useCollection("empresa");
  const empresa = items[0] ?? FALLBACK_EMPRESA;
  useEffect(() => {
    // Primeiro acesso: grava o perfil padrão para fixar a chave de ingestão.
    if (ready && db.get("empresa").length === 0) db.upsert("empresa", defaultEmpresa());
  }, [ready, items.length]);
  const save = useCallback(
    // Parte do valor já salvo (não do render): duas mudanças seguidas não se sobrescrevem.
    (patch: Partial<Empresa>) => db.upsert("empresa", { ...(db.get("empresa")[0] ?? empresa), ...patch, id: EMPRESA_ID }),
    [empresa],
  );
  return { empresa, save, ready };
}
