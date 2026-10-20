"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { assinarTempoReal, db, descartarDadosLocais } from "@/lib/store";

/** Sem Supabase: modo demonstração liberado (só em desenvolvimento). Com Supabase: exige login por e-mail e senha. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s);
      // Renovação de token não troca de usuário: não precisa recarregar os dados.
      if (evento !== "TOKEN_REFRESHED") db.reset();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Tempo real enquanto houver sessão: o que a extensão grava aparece na tela.
  const uid = session?.user.id;
  useEffect(() => (uid ? assinarTempoReal(uid) : undefined), [uid]);

  // Com login, dados do modo demonstração guardados no navegador não são usados: apaga.
  useEffect(() => {
    if (uid) descartarDadosLocais();
  }, [uid]);

  if (!supabase) return process.env.NODE_ENV === "production" ? <SemConfiguracao /> : <>{children}</>;
  if (session === undefined) return <div className="p-10 text-muted text-sm">Carregando…</div>;
  if (!session) return <LoginForm />;
  return <>{children}</>;
}

/** Em produção, sem Supabase configurado, não libera o painel sem login. */
function SemConfiguracao() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f8fc] px-6">
      <div className="max-w-md text-center">
        <Lock size={28} className="mx-auto text-slate-500" />
        <h1 className="mt-4 text-xl font-bold text-slate-900">Login indisponível</h1>
        <p className="mt-2 text-sm text-slate-500">
          O servidor de login não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e
          NEXT_PUBLIC_SUPABASE_ANON_KEY nas variáveis de ambiente e publique novamente.
        </p>
      </div>
    </div>
  );
}

/** Mensagens do Supabase Auth em português. */
function traduz(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme o seu e-mail pelo link que enviamos antes de entrar.";
  if (m.includes("user already registered")) return "Este e-mail já tem conta. Use “Já tenho conta”.";
  if (m.includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (m.includes("unable to validate email") || m.includes("invalid email")) return "E-mail inválido.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Sem conexão com o servidor de login. Confira a internet e a URL do Supabase.";
  return msg;
}

const NAVY = "#0b1a33";

function Campo({ rotulo, icone: Icone, children }: { rotulo: string; icone: React.ElementType; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{rotulo}</span>
      <span className="relative block">
        <Icone size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        {children}
      </span>
    </label>
  );
}

const inputLogin =
  "w-full rounded-lg border border-[#d6e2f5] bg-[#eef4ff] py-3 pl-11 pr-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0b1a33] focus:bg-white focus:ring-4 focus:ring-[#0b1a33]/10";

function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/configuracoes` });
      setBusy(false);
      setMsg(error ? { ok: false, texto: traduz(error.message) } : { ok: true, texto: "Se o e-mail tiver conta, enviamos um link para criar uma nova senha." });
      return;
    }
    const fn = mode === "login" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password });
    setBusy(false);
    if (error) setMsg({ ok: false, texto: traduz(error.message) });
    else if (mode === "signup" && !data.session) setMsg({ ok: true, texto: "Conta criada. Abra o link de confirmação que enviamos para o seu e-mail e depois entre." });
  }

  const textos = {
    login: { titulo: "Acesso", sub: "Entre com suas credenciais para acessar o painel.", botao: "Entrar" },
    signup: { titulo: "Criar conta", sub: "Cadastre-se para monitorar pregões e montar propostas.", botao: "Criar conta" },
    reset: { titulo: "Recuperar senha", sub: "Informe seu e-mail e enviaremos um link para criar uma nova senha.", botao: "Enviar link" },
  }[mode];
  const trocar = (m: typeof mode) => { setMsg(null); setMode(m); };

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f8fc] lg:flex-row">
      {/* Painel da marca */}
      <aside className="relative flex shrink-0 flex-col justify-between overflow-hidden px-8 py-8 text-white lg:w-[46%] lg:px-12 lg:py-10"
        style={{ background: `radial-gradient(ellipse 70% 55% at 18% 12%, rgba(190, 40, 80, 0.55), transparent 70%), linear-gradient(160deg, #1b1430 0%, ${NAVY} 55%, #0a1730 100%)` }}>
        <div>
          <div className="text-2xl font-extrabold tracking-tight">PEPPACORP LICITA</div>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#ff8fa3]">Monitoramento de licitações</div>
        </div>
        <div className="mt-10 max-w-lg lg:mt-0">
          <h1 className="text-3xl font-extrabold leading-[1.15] tracking-tight sm:text-4xl lg:text-[44px]">
            Acompanhe pregões eletrônicos com <span className="text-[#ff7a90]">inteligência e precisão.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/75">
            Busca, monitoramento e alertas de palavras-chave em tempo real para licitações do Compras.gov.br / ComprasNet.
          </p>
        </div>
        <div className="mt-10 hidden text-[11px] font-bold uppercase tracking-[0.18em] text-white/45 lg:block lg:mt-0">© {new Date().getFullYear()} Peppacorp Licita</div>
      </aside>

      {/* Formulário */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-[380px]">
          <h2 className="text-[26px] font-bold tracking-tight" style={{ color: NAVY }}>{textos.titulo}</h2>
          <p className="mt-2 text-sm text-slate-500">{textos.sub}</p>

          <div className="mt-8 space-y-5">
            <Campo rotulo="E-mail" icone={Mail}>
              <input className={inputLogin} type="email" placeholder="seu@email.com" autoComplete="email" autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Campo>
            {mode !== "reset" && (
              <Campo rotulo="Senha" icone={Lock}>
                <input className={`${inputLogin} !pr-11`} type={verSenha ? "text" : "password"} placeholder="••••••••" minLength={6} required
                  autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setVerSenha(!verSenha)} aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-900">
                  {verSenha ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </Campo>
            )}
            {mode === "login" && (
              <div className="-mt-2 text-right">
                <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-900" onClick={() => trocar("reset")}>Esqueci a senha</button>
              </div>
            )}
          </div>

          {msg && (
            <div role="alert" className={`mt-5 rounded-lg px-3.5 py-2.5 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.texto}</div>
          )}

          <button disabled={busy} style={{ background: NAVY }}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-sm transition hover:brightness-125 disabled:opacity-60">
            {busy ? <><Loader2 size={17} className="animate-spin" /> Aguarde…</> : <>{textos.botao} <ArrowRight size={17} /></>}
          </button>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === "login" ? (
              <>Não tem conta? <button type="button" className="font-semibold text-slate-900 underline-offset-2 hover:underline" onClick={() => trocar("signup")}>Criar agora</button></>
            ) : (
              <>Já tem conta? <button type="button" className="font-semibold text-slate-900 underline-offset-2 hover:underline" onClick={() => trocar("login")}>Entrar</button></>
            )}
          </p>
        </form>
      </main>
    </div>
  );
}
