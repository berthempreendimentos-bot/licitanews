"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

/** E-mail de quem está logado + botão Sair (só com Supabase; no modo demonstração não há login). */
export function BotaoSair() {
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(false);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setAdmin(data.user?.app_metadata?.role === "admin");
    });
  }, []);

  if (!supabase) return null;

  async function sair() {
    if (!confirm("Sair do PEPPACORP?")) return;
    setSaindo(true);
    await supabase!.auth.signOut(); // o AuthGate volta para a tela de login
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      {email && (
        <div className="hidden min-w-0 text-right md:block">
          <div className="max-w-[220px] truncate text-xs font-semibold">{email}</div>
          {admin && <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Administrador</div>}
        </div>
      )}
      <button onClick={() => void sair()} disabled={saindo} title="Sair da conta"
        className="btn btn-ghost !py-1.5 !text-xs hover:!border-red-300 hover:!text-red-700">
        <LogOut size={14} /> {saindo ? "Saindo…" : "Sair"}
      </button>
    </div>
  );
}
