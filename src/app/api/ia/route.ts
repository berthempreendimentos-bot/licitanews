import { NextResponse } from "next/server";
import { claudeConfigurado as iaConfigurada } from "@/lib/iaServidor";
import { GeminiError, listarModelos } from "@/lib/gemini";

export const runtime = "nodejs";

/** GET /api/ia — o Claude está configurado no servidor (ANTHROPIC_API_KEY)? */
export async function GET() {
  return NextResponse.json({ claude: iaConfigurada() });
}

/** POST /api/ia { gemini_key } — valida a chave do Gemini e lista os modelos de texto da conta. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { gemini_key?: string } | null;
  const key = String(body?.gemini_key || "").trim();
  if (!key) return NextResponse.json({ error: "Cole a chave da API do Gemini." }, { status: 400 });
  try {
    const modelos = await listarModelos(key);
    if (!modelos.length) return NextResponse.json({ error: "A chave funciona, mas a conta não tem modelos Gemini de texto disponíveis." }, { status: 422 });
    return NextResponse.json({ ok: true, modelos });
  } catch (e) {
    const msg = e instanceof GeminiError ? e.message : "Não consegui falar com a API do Gemini. Verifique a internet e tente de novo.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
