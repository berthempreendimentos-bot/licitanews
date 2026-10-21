"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { Empty, PageHeader, StatCard } from "@/components/ui";
import { SomenteAdmin } from "@/components/SomenteAdmin";
import { fetchAdmin } from "@/lib/useAdmin";
import { dataBR } from "@/lib/format";
import type { UsuarioAdmin } from "@/app/api/admin/usuarios/route";

export default function Page() {
  return (
    <SomenteAdmin>
      <Administracao />
    </SomenteAdmin>
  );
}

function Administracao() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [eu, setEu] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [novoAdmin, setNovoAdmin] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const d = await fetchAdmin("/api/admin/usuarios");
      setUsuarios(d.usuarios);
      setEu(d.eu);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function executar(id: string, acao: () => Promise<unknown>, sucesso: string) {
    setErro("");
    setOk("");
    setOcupado(id);
    try {
      await acao();
      setOk(sucesso);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  function adicionar(e: React.FormEvent) {
    e.preventDefault();
    void executar("novo", async () => {
      await fetchAdmin("/api/admin/usuarios", { method: "POST", body: JSON.stringify({ email, senha, admin: novoAdmin }) });
      setEmail("");
      setSenha("");
      setNovoAdmin(false);
    }, `Usuário ${email.trim().toLowerCase()} criado. Ele já pode entrar com o e-mail e a senha informados.`);
  }

  const admins = usuarios.filter((u) => u.admin).length;

  return (
    <>
      <PageHeader
        title="Administração"
        tag="Administrador"
        subtitle="Contas de acesso ao PEPPACORP"
        actions={
          <>
            <Link href="/monitoramento/admin" className="btn btn-ghost"><ShieldCheck size={14} /> Ciclo de monitoramento</Link>
            <button className="btn btn-ghost" onClick={() => void carregar()} disabled={carregando}>
              <RefreshCw size={14} className={carregando ? "animate-spin" : ""} /> Atualizar
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard label="Usuários" value={usuarios.length} />
        <StatCard label="Administradores" value={admins} />
        <StatCard label="Usuários comuns" value={usuarios.length - admins} />
      </div>

      <form onSubmit={adicionar} className="card p-4 mb-4">
        <h2 className="font-bold text-brand flex items-center gap-2"><UserPlus size={16} /> Adicionar usuário</h2>
        <p className="text-xs text-muted mt-1">A conta é criada já confirmada: passe o e-mail e a senha para a pessoa entrar. Ela pode trocar a senha depois em Configurações.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_220px_auto_auto] md:items-center">
          <input className="input" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="text" placeholder="Senha (mín. 6 caracteres)" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} required />
          <label className="flex items-center gap-2 text-sm whitespace-nowrap">
            <input type="checkbox" checked={novoAdmin} onChange={(e) => setNovoAdmin(e.target.checked)} /> Administrador
          </label>
          <button className="btn btn-primary justify-center" disabled={ocupado === "novo"}>
            {ocupado === "novo" ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Adicionar
          </button>
        </div>
      </form>

      {erro && <div className="card p-3 mb-4 text-sm text-danger">{erro}</div>}
      {ok && <div className="card p-3 mb-4 text-sm text-ok">{ok}</div>}

      {!carregando && !usuarios.length && !erro && <Empty title="Nenhum usuário" />}

      {usuarios.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th className="p-3">E-mail</th>
                <th className="p-3">Perfil</th>
                <th className="p-3">Criado em</th>
                <th className="p-3">Último acesso</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const souEu = u.id === eu;
                const busy = ocupado === u.id;
                return (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="p-3 font-medium">
                      {u.email}
                      {souEu && <span className="ml-2 text-xs text-muted">(você)</span>}
                    </td>
                    <td className="p-3">
                      {u.admin ? <span className="badge bg-black text-white">Administrador</span> : <span className="badge bg-bg text-muted">Usuário</span>}
                    </td>
                    <td className="p-3 text-xs text-muted">{dataBR(u.criado_em)}</td>
                    <td className="p-3 text-xs text-muted">{u.ultimo_acesso ? dataBR(u.ultimo_acesso, true) : "Nunca entrou"}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1.5">
                        {busy && <Loader2 size={14} className="animate-spin self-center text-muted" />}
                        <button className="btn btn-ghost !py-1 !text-xs" disabled={busy || souEu}
                          title={souEu ? "Você não pode mudar o seu próprio perfil" : undefined}
                          onClick={() => {
                            if (!confirm(u.admin ? `Tirar o acesso de administrador de ${u.email}?` : `Tornar ${u.email} administrador?`)) return;
                            void executar(u.id, () => fetchAdmin("/api/admin/usuarios", { method: "PATCH", body: JSON.stringify({ id: u.id, admin: !u.admin }) }),
                              u.admin ? `${u.email} agora é usuário comum.` : `${u.email} agora é administrador.`);
                          }}>
                          <ShieldCheck size={13} /> {u.admin ? "Tirar admin" : "Tornar admin"}
                        </button>
                        <button className="btn btn-ghost !py-1 !text-xs" disabled={busy}
                          onClick={() => {
                            const nova = prompt(`Nova senha para ${u.email} (mín. 6 caracteres):`);
                            if (nova == null) return;
                            void executar(u.id, () => fetchAdmin("/api/admin/usuarios", { method: "PATCH", body: JSON.stringify({ id: u.id, senha: nova }) }),
                              `Senha de ${u.email} alterada.`);
                          }}>
                          <KeyRound size={13} /> Senha
                        </button>
                        <button className="btn btn-ghost !py-1 !text-xs text-danger" disabled={busy || souEu} aria-label={`Excluir ${u.email}`}
                          title={souEu ? "Você não pode excluir a sua própria conta" : undefined}
                          onClick={() => {
                            if (!confirm(`Excluir a conta ${u.email}?\n\nTodos os dados dela (pregões, propostas, alertas…) serão apagados. Não dá para desfazer.`)) return;
                            void executar(u.id, () => fetchAdmin(`/api/admin/usuarios?id=${encodeURIComponent(u.id)}`, { method: "DELETE" }),
                              `Conta ${u.email} excluída.`);
                          }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
