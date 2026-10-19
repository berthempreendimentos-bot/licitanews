import { ComingSoon } from "@/components/ui";

export default function Page() {
  return (
    <ComingSoon
      title="Relatórios"
      subtitle="Indicadores de desempenho"
      features={[
        "Taxa de vitória por órgão, modalidade e período",
        "Funil do CRM",
        "Exportação em PDF e Excel"
      ]}
    />
  );
}
