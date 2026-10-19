import { ComingSoon } from "@/components/ui";

export default function Page() {
  return (
    <ComingSoon
      title="Robô de Lances"
      subtitle="Automatize disputas com limites e estratégia"
      features={[
        "Robôs por lote ou por item, com preço mínimo por item",
        "Modos Manual Assistido, Automático e Estratégico",
        "Respeito ao intervalo mínimo entre lances exigido pelo portal",
        "Autorização no servidor antes de cada lance e registro de auditoria"
      ]}
    />
  );
}
