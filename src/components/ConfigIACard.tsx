"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, ExternalLink, KeyRound, Loader2, Sparkles } from "lucide-react";
import { useEmpresa } from "@/lib/store";
import { iaDaEmpresa } from "@/lib/ia";
import { isDemo } from "@/lib/supabase";
import type { ConfigIA, ProvedorIA } from "@/lib/types";

type Modelo = { id: string; nome: string };

/** Configurações → Inteligência artificial: Claude (chave do servidor) ou Google Gemini (chave da empresa). */
export function ConfigIACard() {
  const { empresa, save } = useEmpresa();
  const salvo = iaDaEmpresa(empresa);
  const [form, setForm] = useState<ConfigIA>(salvo);
  const [verChave, setVerChave] = useState(false);
  const [claudeNoServidor, setClaudeNoServidor] = useState<boolean | null>(null);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [testando, setTestando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  // Atualiza o formulário quando os dados da empresa terminam de carregar.
  const salvoJson = JSON.stringify(salvo);
  useEffect(() => setForm(JSON.parse(salvoJson) as ConfigIA), [salvoJson]);
  useEffect(() => {
    fetch("/api/ia").then((r) => r.json()).then((d) => setClaudeNoServidor(!!d.claude)).catch(() => setClaudeNoServidor(false));
  }, []);

  const alterado = JSON.stringify(form) !== salvoJson;

  async function testar() {
    setMsg(null);
    setTestando(true);
    try {
      const r = await fetch("/api/ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gemini_key: form.gemini_key }) });
      const d = await r.json();
      if (!d.ok) return setMsg({ ok: false, texto: d.error || "A chave não funcionou." });
      const lista = d.modelos as Modelo[];
      setModelos(lista);
      // Mantém o modelo escolhido se ele existir na conta; senão sugere um "flash" (rápido e barato).
      if (!lista.some((m) => m.id === form.gemini_modelo)) {
        const sugestao = lista.find((m) => /flash/.test(m.id) && !/lite|preview|exp/.test(m.id)) ?? lista[0];
        setForm((f) => ({ ...f, gemini_modelo: sugestao.id }));
      }
      setMsg({ ok: true, texto: `Chave válida. ${lista.length} modelos disponíveis na sua conta.` });
    } catch {
      setMsg({ ok: false, texto: "Falha de conexão ao testar a chave." });
    } finally {
      setTestando(false);
    }
  }

  function salvar() {
    if (form.provedor === "gemini" && !form.gemini_key.trim()) return setMsg({ ok: false, texto: "Cole a chave da API do Gemini antes de salvar." });
    save({ ia: { ...form, gemini_key: form.gemini_key.trim(), gemini_modelo: form.gemini_modelo.trim() } });
    setMsg({ ok: true, texto: "Configuração de IA salva." });
  }

  const opcao = (id: ProvedorIA, titulo: string, detalhe: React.ReactNode) => (
    <button type="button" onClick={() => setForm({ ...form, provedor: id })} aria-pressed={form.provedor === id}
      className={`rounded-lg border p-3 text-left transition ${form.provedor === id ? "border-brand ring-2 ring-brand/15" : "border-border hover:border-brand/40"}`}>
      <div className="text-sm font-semibold">{titulo}</div>
      <div className="mt-0.5 text-[11px] text-muted">{detalhe}</div>
    </button>
  );

  return (
    <div id="ia" className="card p-5 scroll-mt-20">
      <h2 className="font-bold text-brand flex items-center gap-2"><Sparkles size={16} /> Inteligência artificial</h2>
      <p className="text-xs text-muted mt-1">Provedor usado nos recursos de IA, como a análise de edital em Documentos.</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {opcao("claude", "Claude (Anthropic)",
          claudeNoServidor === null ? "Verificando…" : claudeNoServidor ? "Chave configurada no servidor" : "Sem chave no servidor (ANTHROPIC_API_KEY)")}
        {opcao("gemini", "Google Gemini", "Usa a sua chave do Google AI Studio")}
      </div>

      {form.provedor === "gemini" && (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-muted">Chave da API do Gemini
            <div className="mt-1 flex gap-2">
              <div className="relative flex-1">
                <KeyRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input className="input !pl-8 !pr-9 font-mono text-xs" type={verChave ? "text" : "password"} autoComplete="off" spellCheck={false}
                  placeholder="AIza…" value={form.gemini_key} onChange={(e) => { setForm({ ...form, gemini_key: e.target.value }); setModelos([]); }} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-brand" aria-label={verChave ? "Ocultar chave" : "Mostrar chave"}
                  onClick={() => setVerChave(!verChave)}>{verChave ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              </div>
              <button type="button" className="btn btn-ghost shrink-0" disabled={!form.gemini_key.trim() || testando} onClick={() => void testar()}>
                {testando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Testar chave
              </button>
            </div>
          </label>
          <a className="inline-flex items-center gap-1 text-xs font-semibold text-accent" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
            Gerar uma chave no Google AI Studio <ExternalLink size={11} />
          </a>

          <label className="block text-xs font-semibold text-muted">Modelo
            {modelos.length ? (
              <select className="input mt-1" value={form.gemini_modelo} onChange={(e) => setForm({ ...form, gemini_modelo: e.target.value })}>
                {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome} ({m.id})</option>)}
              </select>
            ) : (
              <input className="input mt-1 font-mono text-xs" value={form.gemini_modelo} onChange={(e) => setForm({ ...form, gemini_modelo: e.target.value })} />
            )}
            <span className="mt-1 block font-normal">“Testar chave” lista os modelos da sua conta. Modelos “Flash” são mais rápidos e baratos; “Pro” analisam com mais cuidado.</span>
          </label>

          <p className="rounded-lg bg-bg p-3 text-[11px] text-muted">
            A chave fica salva nos dados da empresa {isDemo ? "(neste navegador, no modo demonstração)" : "(na sua conta)"} e só vai ao servidor do PEPPACORP
            na hora de usar a IA. Com o Gemini, os PDFs do edital podem ter até 14 MB no total.
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={!alterado} onClick={salvar}>Salvar</button>
        {msg && <span className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.texto}</span>}
      </div>
    </div>
  );
}
