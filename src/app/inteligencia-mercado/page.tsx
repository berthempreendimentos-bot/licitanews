"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { ContratosTab, FornecedorTab, GrandesTab, RaioXTab, RenovacaoTab } from "@/components/mercado/contratosTabs";
import { AtasTab, CapagTab, OrgaoTab, PrecosTab } from "@/components/mercado/outrasTabs";

const TABS = [
  ["raiox", "Raio-X de Mercado"],
  ["contratos", "Contratos"],
  ["capag", "CAPAG Municípios"],
  ["precos", "Consultar Preços"],
  ["renovacao", "Radar de Renovação"],
  ["orgao", "Inteligência por Órgão"],
  ["atas", "Atas Esgotando"],
  ["grandes", "Grandes Contratos"],
  ["fornecedor", "Concorrente por CNPJ"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function InteligenciaMercado() {
  const [tab, setTab] = useState<Tab>("raiox");
  // Abas já visitadas ficam montadas (escondidas) para não refazer a consulta ao voltar.
  const [visitadas, setVisitadas] = useState<Set<Tab>>(new Set(["raiox"]));
  const [pick, setPick] = useState("");
  const open = (t: Tab) => {
    setTab(t);
    setVisitadas((v) => new Set(v).add(t));
  };
  const panel = (t: Tab, el: React.ReactNode) => visitadas.has(t) && <div className={tab === t ? "" : "hidden"}>{el}</div>;

  return (
    <>
      <PageHeader title="Inteligência de Mercado" subtitle="Contratos, preços, órgãos e atas: quem vende, quem compra e por quanto" />
      <div className="card mb-5 flex flex-wrap gap-1 p-1.5">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => open(k)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${tab === k ? "bg-black text-white" : "text-muted hover:text-black hover:bg-bg"}`}>
            {l}
          </button>
        ))}
      </div>
      {panel("raiox", <RaioXTab onPickFornecedor={(c) => { setPick(c); open("fornecedor"); }} />)}
      {panel("contratos", <ContratosTab />)}
      {panel("capag", <CapagTab />)}
      {panel("precos", <PrecosTab />)}
      {panel("renovacao", <RenovacaoTab />)}
      {panel("orgao", <OrgaoTab />)}
      {panel("atas", <AtasTab />)}
      {panel("grandes", <GrandesTab />)}
      {panel("fornecedor", <FornecedorTab initial={pick} />)}
    </>
  );
}
