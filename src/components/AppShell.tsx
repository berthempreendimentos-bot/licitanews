"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Search, Radar, Star, KanbanSquare, CalendarDays, FilePlus2, Gavel,
  MessageSquareText, PlugZap, LineChart, ScrollText, FolderOpen, Bell, BarChart3, Settings, Menu, X,
  PanelLeftClose, PanelLeftOpen, UsersRound,
} from "lucide-react";
import { AuthGate } from "./AuthGate";
import { AlertasDocumentos } from "./AlertasDocumentos";
import { ExtensaoPonte } from "./ExtensaoPonte";
import { CicloAdminAuto } from "./CicloAdminAuto";
import { BotaoSair } from "./BotaoSair";
import { useCollection, useEmpresa } from "@/lib/store";
import { useAdmin } from "@/lib/useAdmin";

/** admin: só aparece para administradores. */
type NavItem = { href: string; label: string; icon: React.ElementType; tag?: string; admin?: boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/oportunidades", label: "Oportunidades", icon: Search },
  { href: "/radar", label: "Radar", icon: Radar },
  { href: "/favoritos", label: "Favoritos", icon: Star },
  { href: "/crm", label: "CRM", icon: KanbanSquare },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/propostas", label: "Propostas", icon: FilePlus2 },
  { href: "/disputar", label: "Robô de Lances", icon: Gavel, tag: "Aguarde", admin: true },
  { href: "/monitoramento", label: "Monitoramento", icon: MessageSquareText },
  { href: "/conectar-robo", label: "Conectar Robô", icon: PlugZap, admin: true },
  { href: "/inteligencia-mercado", label: "Inteligência de Mercado", icon: LineChart },
  { href: "/atas-registro-preco", label: "Atas de Registro", icon: ScrollText },
  { href: "/documentos", label: "Documentos", icon: FolderOpen },
  { href: "/alertas", label: "Alertas", icon: Bell },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, tag: "Aguarde" },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
  { href: "/administracao", label: "Administração", icon: UsersRound, admin: true },
];

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : "px-2"}`}>
      <div className="h-9 w-9 shrink-0 rounded-xl bg-white grid place-items-center text-black font-black text-lg">P</div>
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-white font-extrabold tracking-wide text-[15px]">PEPPACORP</div>
          <div className="text-[11px] font-semibold text-white/60 tracking-[0.2em]">LICITA</div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const { items: alerts } = useCollection("alerts");
  const unread = alerts.filter((a) => !a.lido).length;
  const admin = useAdmin();
  return (
    <div className="flex h-full flex-col bg-brand py-5">
      <Logo collapsed={collapsed} />
      <nav className={`mt-6 flex-1 overflow-y-auto space-y-0.5 ${collapsed ? "px-2" : "px-3"}`}>
        {NAV.filter((item) => !item.admin || admin).map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={`relative flex items-center rounded-lg py-2 text-[13.5px] font-medium transition ${
                collapsed ? "justify-center px-0" : "gap-3 px-3"
              } ${
                active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/6 hover:text-white"
              }`}
            >
              <Icon size={17} className={`shrink-0 ${active ? "text-white" : ""}`} />
              {collapsed ? (
                item.href === "/alertas" && unread > 0 && (
                  <span className="absolute top-1 right-1.5 h-2 w-2 rounded-full bg-white" />
                )
              ) : (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.href === "/alertas" && unread > 0 && (
                    <span className="badge bg-white text-black">{unread > 99 ? "99+" : unread}</span>
                  )}
                  {item.tag && <span className="text-[9px] uppercase tracking-wide text-white/35">{item.tag}</span>}
                </>
              )}
            </Link>
          );
        })}
      </nav>
      {!collapsed && <div className="px-5 pt-4 text-[11px] text-white/40">Você vende. Nós encontramos.</div>}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("menu-recolhido") === "1");
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("menu-recolhido", c ? "0" : "1");
      } catch {}
      return !c;
    });
  }

  const { empresa } = useEmpresa();
  return (
    <AuthGate>
      <AlertasDocumentos />
      <ExtensaoPonte />
      <CicloAdminAuto />
      <div className="flex min-h-screen">
        <aside className={`hidden lg:block shrink-0 fixed inset-y-0 left-0 transition-[width] ${collapsed ? "w-16" : "w-64"}`}>
          <Sidebar collapsed={collapsed} />
        </aside>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-64">
              <Sidebar onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}
        <div className={`flex-1 min-w-0 transition-[margin] ${collapsed ? "lg:ml-16" : "lg:ml-64"}`}>
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/90 backdrop-blur px-4 lg:px-8 h-14">
            <button className="lg:hidden p-1.5 -ml-1.5" onClick={() => setOpen(true)} aria-label="Abrir menu">
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
            <button
              className="hidden lg:block p-1.5 -ml-1.5 text-muted hover:text-text"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
            <div className="text-sm font-semibold truncate">{empresa.razao_social || "Minha empresa"}</div>
            {empresa.cnpj && <div className="hidden sm:block text-xs text-muted">CNPJ {empresa.cnpj}</div>}
            <BotaoSair />
          </header>
          <main className="px-4 lg:px-8 py-6 max-w-[1400px]">{children}</main>
        </div>
      </div>
    </AuthGate>
  );
}
