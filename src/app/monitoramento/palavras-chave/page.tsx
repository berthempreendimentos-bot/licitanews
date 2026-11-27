"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X, Eye, Search, ChevronRight } from "lucide-react";
import { db, useEmpresa } from "@/lib/store";
import { retroSearch } from "@/lib/ingestLocal";

export default function PalavrasChavePage() {
  const { empresa, save } = useEmpresa();
  const [term, setTerm] = useState("");
  const [info, setInfo] = useState("");
  const [modalTerm, setModalTerm] = useState("");
  const [modalInfo, setModalInfo] = useState("");
  const [modalBusca, setModalBusca] = useState("");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalTerm("");
        setModalInfo("");
        setModalBusca("");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function adicionarTermos(texto: string) {
    const pedacos = texto.split(",").map((s) => s.trim()).filter(Boolean);
    if (!pedacos.length) return;

    const empresaAtual = db.get("empresa")[0] ?? empresa;
    const listaAtual = empresaAtual.palavras_chave || [];
    const existentes = new Set(listaAtual.map((k) => k.toLowerCase()));
    const novos: string[] = [];
    let totalMencoes = 0;

    for (const p of pedacos) {
      if (!existentes.has(p.toLowerCase())) {
        existentes.add(p.toLowerCase());
        novos.push(p);
        totalMencoes += retroSearch(p);
      }
    }

    if (novos.length === 0) {
      setModalInfo("Esse termo já está cadastrado.");
      return;
    }

    const atualizada = [...listaAtual, ...novos];
    save({ palavras_chave: atualizada });

    setModalInfo(
      totalMencoes > 0
        ? `Adicionado! ${totalMencoes} menção(ões) encontrada(s) nas mensagens já capturadas.`
        : `Adicionado com sucesso (${novos.length} termo(s)).`
    );
    setModalTerm("");
  }

  function removerTermo(t: string) {
    const empresaAtual = db.get("empresa")[0] ?? empresa;
    const listaAtual = empresaAtual.palavras_chave || [];
    save({ palavras_chave: listaAtual.filter((x) => x !== t) });
  }

  const total = empresa.palavras_chave?.length ?? 0;
  const buscaLimpa = modalBusca.trim().toLowerCase();
  const palavrasFiltradas = buscaLimpa
    ? (empresa.palavras_chave || []).filter((k) => k.toLowerCase().includes(buscaLimpa))
    : empresa.palavras_chave || [];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6 text-xs text-muted">
        <Link href="/monitoramento" className="hover:text-brand transition">Monitoramento</Link>
        <ChevronRight size={12} />
        <span className="text-brand font-medium">Palavras-chave</span>
      </div>

      <div className="card p-5 mb-4">
        <h1 className="font-bold text-lg text-brand mb-1">Palavras-chave do alerta</h1>
        <p className="text-xs text-muted mb-4">
          Valem para todos os pregões. Vigiamos o chat e alertamos assim que qualquer um destes termos for mencionado.
          Além destes, CNPJ e Razão Social cadastrados em Configurações também são vigiados.
        </p>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-brand mb-1.5">
            Adicionar nova palavra-chave
          </label>
          <form onSubmit={(e) => { e.preventDefault(); adicionarTermos(modalTerm); }} className="flex gap-2">
            <input
              className="input text-sm flex-1"
              placeholder="Ex.: nome da empresa, item específico, recurso..."
              value={modalTerm}
              onChange={(e) => { setModalTerm(e.target.value); setModalInfo(""); }}
              autoFocus
            />
            <button type="submit" className="btn btn-primary shrink-0" disabled={!modalTerm.trim()}>
              <Plus size={14} /> Adicionar
            </button>
          </form>
          <p className="text-[11px] text-muted mt-1">
            Dica: você pode colar vários termos separados por vírgula.
          </p>
          {modalInfo && (
            <div className={`mt-2 text-xs font-medium p-2 rounded-lg ${modalInfo.includes("Esse") ? "text-danger bg-danger/10" : "text-ok bg-accent-soft/70"}`}>
              {modalInfo}
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Palavras cadastradas ({total})
            </span>
            {total > 5 && (
              <div className="relative w-56">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  className="input !py-1 !pl-7 !pr-6 !text-xs w-full"
                  placeholder="Filtrar palavras..."
                  value={modalBusca}
                  onChange={(e) => setModalBusca(e.target.value)}
                />
                {modalBusca && (
                  <button
                    type="button"
                    onClick={() => setModalBusca("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-brand"
                    aria-label="Limpar filtro"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}
          </div>

          {total === 0 ? (
            <div className="py-8 text-center text-sm text-muted">
              Nenhuma palavra-chave cadastrada ainda. Use o campo acima para adicionar.
            </div>
          ) : palavrasFiltradas.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted">
              Nenhuma encontrada para &ldquo;{modalBusca}&rdquo;.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {palavrasFiltradas.map((k) => (
                <span
                  key={k}
                  className="badge bg-accent-soft text-brand !text-xs !py-1.5 !px-3 font-medium flex items-center gap-2 border border-border/80"
                >
                  <span className="max-w-[320px] truncate">{k}</span>
                  <button
                    type="button"
                    aria-label={`Remover ${k}`}
                    onClick={() => removerTermo(k)}
                    className="text-muted hover:text-danger hover:bg-danger/10 p-0.5 rounded transition"
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="text-center">
        <Link href="/monitoramento" className="btn btn-ghost text-xs">
          Voltar para o monitoramento
        </Link>
      </div>
    </div>
  );
}
