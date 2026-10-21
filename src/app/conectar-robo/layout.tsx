import { SomenteAdmin } from "@/components/SomenteAdmin";

/** Área só para administradores. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SomenteAdmin>{children}</SomenteAdmin>;
}
