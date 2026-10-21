import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase";
import { usuarioDaRequisicao } from "@/lib/adminServidor";

/**
 * PDFs dos documentos da empresa no Supabase Storage (bucket privado "documentos", pasta por usuário).
 * O arquivo não passa pela Vercel (limite de 4,5 MB por requisição): esta rota confere o login e
 * devolve uma autorização de envio direto ao Storage; para ver, um link temporário.
 *   POST   { nome, tamanho, docId } → { path, token }   (o navegador envia com uploadToSignedUrl)
 *   GET    ?path=                   → { url }           (link válido por 10 min)
 *   DELETE ?path=                   → { ok }
 */
const BUCKET = "documentos";
const MAX_BYTES = 20 * 1024 * 1024;

let bucketPronto = false;
/** Cria o bucket na primeira vez (privado, só PDF, até 20 MB). */
async function garantirBucket(sb: SupabaseClient) {
  if (bucketPronto) return;
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES, allowedMimeTypes: ["application/pdf"] });
    if (error && !/exist/i.test(error.message)) throw new Error(error.message);
  }
  bucketPronto = true;
}

async function autorizar(req: Request) {
  const sb = serviceClient();
  if (!sb) return { erro: NextResponse.json({ error: "Supabase não configurado no servidor" }, { status: 503 }) };
  const user = await usuarioDaRequisicao(sb, req);
  if (!user) return { erro: NextResponse.json({ error: "Entre no PEPPACORP para enviar arquivos." }, { status: 401 }) };
  return { sb, uid: user.id };
}

/** O caminho é da pasta do usuário? (ninguém vê nem apaga arquivo de outro) */
function doUsuario(path: string, uid: string) {
  return path.startsWith(`${uid}/`) && !path.includes("..");
}

export async function POST(req: Request) {
  const a = await autorizar(req);
  if (a.erro) return a.erro;
  const b = (await req.json().catch(() => ({}))) as { nome?: string; tamanho?: number; docId?: string };
  const nome = String(b.nome || "");
  if (!/\.pdf$/i.test(nome)) return NextResponse.json({ error: "Envie um arquivo PDF." }, { status: 400 });
  if (!(Number(b.tamanho) > 0) || Number(b.tamanho) > MAX_BYTES) return NextResponse.json({ error: "O PDF pode ter até 20 MB." }, { status: 400 });
  const docId = String(b.docId || "").replace(/[^\w-]/g, "");
  if (!docId) return NextResponse.json({ error: "Documento não informado." }, { status: 400 });
  try {
    await garantirBucket(a.sb);
  } catch (e) {
    return NextResponse.json({ error: `Storage indisponível: ${(e as Error).message}` }, { status: 500 });
  }
  const path = `${a.uid}/${docId}/${Date.now()}.pdf`;
  const { data, error } = await a.sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ path, token: data.token });
}

export async function GET(req: Request) {
  const a = await autorizar(req);
  if (a.erro) return a.erro;
  const path = new URL(req.url).searchParams.get("path") || "";
  if (!doUsuario(path, a.uid)) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const { data, error } = await a.sb.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  return NextResponse.json({ url: data.signedUrl });
}

export async function DELETE(req: Request) {
  const a = await autorizar(req);
  if (a.erro) return a.erro;
  const path = new URL(req.url).searchParams.get("path") || "";
  if (!doUsuario(path, a.uid)) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const { error } = await a.sb.storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
