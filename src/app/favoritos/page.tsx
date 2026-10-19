"use client";

import Link from "next/link";
import { Empty, OpportunityCard, PageHeader } from "@/components/ui";
import { useCollection } from "@/lib/store";

export default function Favoritos() {
  const { items } = useCollection("favoritos");
  return (
    <>
      <PageHeader title="Favoritos" subtitle={`${items.length} licitações salvas`} />
      {items.length === 0 ? (
        <Empty title="Nenhum favorito ainda" text="Use o botão Favoritar nas oportunidades para salvar aqui." action={<Link href="/oportunidades" className="btn btn-primary">Buscar licitações</Link>} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((f) => <OpportunityCard key={f.id} o={f.opportunity} />)}
        </div>
      )}
    </>
  );
}
