/**
 * GET /api/mercado/arquivo?url=https://pncp.gov.br/pncp-api/v1/orgaos/.../arquivos/1
 * Repassa um documento público do PNCP para abrir no navegador (o PNCP força download).
 * Só aceita endereços de arquivos do PNCP — não é um proxy aberto.
 */
const PERMITIDO = /^https:\/\/pncp\.gov\.br\/(pncp-api|api\/pncp)\/v1\/orgaos\/\d{14}\/(contratos|compras|atas)\/[\w/.-]*arquivos\/\d+$/;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const url = sp.get("url") || "";
  const baixar = sp.get("download") === "1";
  if (!PERMITIDO.test(url)) return new Response("Endereço não permitido.", { status: 400 });

  let r: Response | null = null;
  for (let i = 0; i < 4 && !r; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000), cache: "no-store" });
      if (res.ok) r = res;
      else if (res.status < 500) return new Response("Arquivo não encontrado no PNCP.", { status: res.status });
    } catch {
      /* tenta de novo */
    }
  }
  if (!r || !r.body) return new Response("O PNCP não respondeu. Tente de novo.", { status: 502 });

  const disp = r.headers.get("content-disposition") || "";
  const nome = disp.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] ?? "documento";
  const ext = nome.split(".").pop()?.toLowerCase();
  const tipos: Record<string, string> = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    txt: "text/plain; charset=utf-8", html: "text/plain; charset=utf-8",
  };
  const tipo = (ext && tipos[ext]) || r.headers.get("content-type") || "application/octet-stream";

  return new Response(r.body, {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `${baixar || !tipos[ext ?? ""] ? "attachment" : "inline"}; filename="${nome.replace(/"/g, "")}"`,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
