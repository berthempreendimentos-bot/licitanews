"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { newId, useEmpresa } from "@/lib/store";
import { useAdmin } from "@/lib/useAdmin";
import { UFS } from "@/lib/pncp";
import { ConfigIACard } from "@/components/ConfigIACard";
import { DadosPropostaCard } from "@/components/DadosPropostaCard";
import { ContaCard } from "@/components/ContaCard";

export default function Configuracoes() {
  const { empresa, save } = useEmpresa();
  const [form, setForm] = useState(empresa);
  const [ok, setOk] = useState(false);
  const [copied, setCopied] = useState(false);
  const admin = useAdmin();

  useEffect(() => setForm(empresa), [empresa]);

  return (
    <>
      <PageHeader title="Configurações" subtitle="Dados da empresa, chave do monitor e inteligência artificial" />
      <div className="grid gap-5 lg:grid-cols-2">
        <form className="card p-5 space-y-3" onSubmit={(e) => {
          e.preventDefault();
          save({ razao_social: form.razao_social.trim(), cnpj: form.cnpj.trim(), ufs: form.ufs, produtos: form.produtos });
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        }}>
          <h2 className="font-bold text-brand">Dados da empresa</h2>
          <label className="block text-xs font-semibold text-muted">Razão social
            <input className="input mt-1" value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
          </label>
          <label className="block text-xs font-semibold text-muted">CNPJ
            <input className="input mt-1" placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
          </label>
          <div>
            <div className="text-xs font-semibold text-muted mb-1.5">Estados atendidos</div>
            <div className="flex flex-wrap gap-1">
              {UFS.map((u) => {
                const on = form.ufs.includes(u);
                return (
                  <button type="button" key={u} onClick={() => setForm({ ...form, ufs: on ? form.ufs.filter((x) => x !== u) : [...form.ufs, u] })}
                    className={`badge border !px-2 ${on ? "bg-accent text-white border-accent" : "border-border text-muted"}`}>{u}</button>
                );
              })}
            </div>
          </div>
          <label className="block text-xs font-semibold text-muted">Produtos e serviços
            <textarea className="input mt-1 min-h-24" value={form.produtos} onChange={(e) => setForm({ ...form, produtos: e.target.value })} />
          </label>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary">Salvar</button>
            {ok && <span className="text-xs text-ok">Salvo!</span>}
          </div>
        </form>

        <div className="space-y-5 lg:row-span-2">
          <div className="card p-5">
            <h2 className="font-bold text-brand">Token do robô</h2>
            <p className="text-xs text-muted mt-1">
              Usado pela extensão para enviar o chat dos pregões e pela API de dados (<code>/api/v1</code>, header <code>x-api-key</code>)
              para ler suas compras monitoradas, mensagens e alertas. Não dá login na sua conta, mas trate como senha:
              se vazar, gere outro (a extensão precisa ser conectada de novo).
            </p>
            {admin && (
              <p className="text-xs text-warn mt-1">
                Este é um token de administrador: pela API ele lê as compras e o chat capturado de todos os usuários.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <code className="input !bg-bg truncate text-xs">{empresa.ingest_key}</code>
              <button className="btn btn-ghost shrink-0" aria-label="Copiar" onClick={() => { void navigator.clipboard.writeText(empresa.ingest_key); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                <Copy size={14} /> {copied ? "Copiado" : ""}
              </button>
              <button className="btn btn-ghost shrink-0" aria-label="Gerar novo token" onClick={() => { if (confirm("Gerar novo token? O antigo deixa de funcionar.")) save({ ingest_key: newId().replace(/-/g, "") }); }}>
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          <ConfigIACard />
          <ContaCard />
        </div>
        <DadosPropostaCard />
      </div>
    </>
  );
}
