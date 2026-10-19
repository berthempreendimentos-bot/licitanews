"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Database, LogOut, XCircle } from "lucide-react";
import { isDemo, supabase } from "@/lib/supabase";

type Diagnostico = { configurado: boolean; ok: boolean; itens: { ok: boolean; texto: string }[] };

/** Configurações → Conta: modo de armazenamento, diagnóstico do Supabase, troca de senha e sair. */
export function ContaCard() {
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(false);
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    fetch("/api/supabase").then((r) => r.json()).then(setDiag).catch(() => setDiag(null));
    supabase?.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setAdmin(data.user?.app_metadata?.role === "admin");
    });
  }, []);

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.auth.updateUser({ password: senha });
    setMsg(error ? { ok: false, texto: error.message } : { ok: true, texto: "Senha alterada." });
    if (!error) setSenha("");
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold text-brand flex items-center gap-2"><Database size={16} /> Conta e banco de dados</h2>

      {isDemo ? (
        <>
          <p className="text-sm text-muted mt-1">
            <b className="text-brand">Modo demonstração:</b> os dados ficam só neste navegador e não há login.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-muted">
            <li>Crie um projeto em <a className="font-semibold text-accent" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com</a>.</li>
            <li>No <b>SQL Editor</b>, rode o arquivo <code>supabase/schema.sql</code> do projeto.</li>
            <li>Copie <code>.env.example</code> para <code>.env.local</code> e preencha URL, chave anon e chave de serviço (Project Settings → API).</li>
            <li>Reinicie o servidor. Ao entrar, o sistema oferece importar os dados deste navegador para a sua conta.</li>
          </ol>
        </>
      ) : (
        <>
          <p className="text-sm text-muted mt-1">Conectado como <b className="text-brand">{email || "…"}</b>{admin && <span className="badge ml-1.5 bg-black text-white">Administrador</span>}. Os dados ficam na sua conta do Supabase.</p>
          <form onSubmit={trocarSenha} className="mt-3 flex gap-2">
            <input className="input" type="password" autoComplete="new-password" minLength={6} required placeholder="Nova senha (mín. 6 caracteres)"
              value={senha} onChange={(e) => setSenha(e.target.value)} />
            <button className="btn btn-ghost shrink-0">Trocar senha</button>
          </form>
          {msg && <div className={`mt-1 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.texto}</div>}
          <button className="btn btn-ghost mt-3" onClick={() => supabase?.auth.signOut()}><LogOut size={14} /> Sair</button>
        </>
      )}

      {diag && (diag.configurado || !isDemo) && (
        <div className="mt-4 rounded-lg bg-bg p-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Diagnóstico do Supabase</div>
          <ul className="space-y-1 text-xs">
            {diag.itens.map((x, i) => (
              <li key={i} className="flex items-start gap-1.5">
                {x.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-green-700" /> : <XCircle size={13} className="mt-0.5 shrink-0 text-red-600" />}
                <span>{x.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
