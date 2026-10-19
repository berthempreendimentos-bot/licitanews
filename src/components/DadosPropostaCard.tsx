"use client";

import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import { useEmpresa } from "@/lib/store";
import { DADOS_PROPOSTA_VAZIOS } from "@/lib/proposta";
import type { DadosProposta } from "@/lib/types";

const CAMPOS: { k: keyof DadosProposta; rotulo: string; placeholder?: string; largo?: boolean }[] = [
  { k: "endereco", rotulo: "Endereço", placeholder: "Rua, número, bairro", largo: true },
  { k: "cidade_uf", rotulo: "Cidade/UF", placeholder: "Manaus/AM" },
  { k: "cep", rotulo: "CEP" },
  { k: "telefone", rotulo: "Telefone" },
  { k: "email", rotulo: "E-mail" },
  { k: "representante", rotulo: "Representante legal" },
  { k: "cargo", rotulo: "Cargo", placeholder: "Sócio-administrador" },
  { k: "cpf_representante", rotulo: "CPF do representante" },
  { k: "banco", rotulo: "Banco" },
  { k: "agencia", rotulo: "Agência" },
  { k: "conta", rotulo: "Conta" },
];

/** Dados que saem no cabeçalho, nas condições e na assinatura das propostas. */
export function DadosPropostaCard() {
  const { empresa, save } = useEmpresa();
  const salvo = JSON.stringify({ ...DADOS_PROPOSTA_VAZIOS, ...(empresa.dados_proposta ?? {}) });
  const [form, setForm] = useState<DadosProposta>(JSON.parse(salvo));
  const [ok, setOk] = useState(false);
  useEffect(() => setForm(JSON.parse(salvo)), [salvo]);

  return (
    <form className="card p-5" onSubmit={(e) => {
      e.preventDefault();
      save({ dados_proposta: Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v).trim()])) as DadosProposta });
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    }}>
      <h2 className="font-bold text-brand flex items-center gap-2"><FileSignature size={16} /> Dados para propostas</h2>
      <p className="text-xs text-muted mt-1">Saem no cabeçalho, nas condições e na assinatura da proposta impressa e na carta-proposta gerada com IA.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {CAMPOS.map((c) => (
          <label key={c.k} className={`block text-xs font-semibold text-muted ${c.largo ? "sm:col-span-2" : ""}`}>{c.rotulo}
            <input className="input mt-1" placeholder={c.placeholder} value={form[c.k]} onChange={(e) => setForm({ ...form, [c.k]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className="btn btn-primary" disabled={JSON.stringify(form) === salvo}>Salvar</button>
        {ok && <span className="text-xs text-ok">Salvo!</span>}
      </div>
    </form>
  );
}
