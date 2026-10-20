"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Download, PlugZap, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { useEmpresa } from "@/lib/store";
import { isDemo } from "@/lib/supabase";

type ExtInfo = { version: string; server: string | null; keyTail: string | null };

function useExtensao() {
  const [info, setInfo] = useState<ExtInfo | null>(null);
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== window || ev.data?.type !== "PEPPA_EXT_HELLO") return;
      setInfo({ version: ev.data.version, server: ev.data.server, keyTail: ev.data.keyTail });
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ type: "PEPPA_EXT_PING" }, window.location.origin);
    const t = setInterval(() => window.postMessage({ type: "PEPPA_EXT_PING" }, window.location.origin), 3000);
    return () => { window.removeEventListener("message", onMessage); clearInterval(t); };
  }, []);
  return info;
}

function Field({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 flex gap-2">
        <code className="input !bg-bg truncate text-xs">{value || "—"}</code>
        <button className="btn btn-ghost shrink-0" aria-label={`Copiar ${label}`} disabled={!value}
          onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          <Copy size={14} /> {copied ? "Copiado" : ""}
        </button>
      </div>
    </div>
  );
}

export default function ConectarRobo() {
  const { empresa } = useEmpresa();
  const ext = useExtensao();
  const [origin, setOrigin] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== window || ev.data?.type !== "PEPPA_EXT_CONNECT_RESULT") return;
      setMsg(ev.data.ok ? { ok: true, text: "Extensão conectada a este PEPPACORP." } : { ok: false, text: ev.data.error || "Falha ao conectar." });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const connected = !!ext && ext.server === origin && !!empresa.ingest_key && ext.keyTail === empresa.ingest_key.slice(-6);

  return (
    <>
      <PageHeader title="Conectar Robô" subtitle="Extensão do navegador que captura o chat do pregoeiro no Comprasnet" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="card p-5">
          <h2 className="font-bold text-brand">Instalar a extensão (Chrome ou Edge)</h2>
          <ol className="mt-3 space-y-3 text-sm list-decimal pl-5">
            <li>
              <a className="btn btn-primary !inline-flex" href="/api/extensao"><Download size={14} /> Baixar PEPPACORP Monitor</a>
              <div className="text-xs text-muted mt-1">Descompacte o arquivo. Vai aparecer a pasta <code>peppacorp-monitor</code>.</div>
            </li>
            <li>Abra <code className="rounded bg-bg px-1">chrome://extensions</code> (no Edge, <code className="rounded bg-bg px-1">edge://extensions</code>) e ligue o <b>Modo do desenvolvedor</b>.</li>
            <li>Clique em <b>Carregar sem compactação</b> e escolha a pasta <code>peppacorp-monitor</code>.</li>
            <li>Volte para esta página e clique em <b>Conectar extensão</b> ao lado.</li>
            <li>
              Em <Link className="text-accent font-semibold" href="/monitoramento">Monitoramento</Link>, cole o link de acompanhamento da compra.
              Depois abra esse link no Comprasnet <b>já logado</b> e deixe a aba aberta. A extensão abre o painel de mensagens sozinha,
              importa o histórico e continua capturando as novas.
            </li>
          </ol>
          <div className="mt-4 rounded-lg bg-bg p-3 text-xs text-muted space-y-1">
            <div>A extensão só lê as respostas do chat que o próprio portal carrega. Ela não lê sua senha nem o token do portal e não envia nada de outras telas.</div>
            <div>Para entrar no PEPPACORP, ela usa o token, nunca o seu login. O token só permite gravar mensagens.</div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <PlugZap size={18} className="text-brand" />
              <h2 className="font-bold text-brand flex-1">Status da extensão</h2>
              {!ext && <span className="badge bg-warn/15 text-warn">Não detectada</span>}
              {ext && !connected && <span className="badge bg-warn/15 text-warn">Instalada · v{ext.version}</span>}
              {connected && <span className="badge bg-ok/12 text-ok"><CheckCircle2 size={12} /> Conectada · v{ext!.version}</span>}
            </div>
            <p className="text-xs text-muted mt-2">
              {!ext && "Instale a extensão e recarregue esta página (F5)."}
              {ext && !connected && "Falta conectar a extensão a este PEPPACORP."}
              {connected && "Tudo pronto. Abra a compra no Comprasnet para começar a capturar."}
            </p>
            <button className="btn btn-primary mt-3" disabled={!ext || !empresa.ingest_key}
              onClick={() => { setMsg(null); window.postMessage({ type: "PEPPA_EXT_CONNECT", key: empresa.ingest_key }, window.location.origin); }}>
              <PlugZap size={14} /> {connected ? "Reconectar" : "Conectar extensão"}
            </button>
            {msg && <div className={`mt-2 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
            {isDemo && (
              <div className="mt-4 flex gap-2 rounded-lg bg-warn/10 p-3 text-xs text-warn">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Modo demonstração: as mensagens são gravadas neste navegador. Para isso, deixe uma aba do PEPPACORP aberta
                  enquanto o monitor captura.
                </span>
              </div>
            )}
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-bold text-brand">Configuração manual</h2>
            <p className="text-xs text-muted">Se o botão não funcionar, cole este token no popup da extensão (ícone “P” na barra do navegador).</p>
            <Field label="Token" value={empresa.ingest_key} />
          </div>
        </div>
      </div>
    </>
  );
}
