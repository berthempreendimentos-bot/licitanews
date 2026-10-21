import { NextResponse } from "next/server";
import { analisarEdital, EditalError } from "@/lib/edital";
import { iaDoPedido } from "@/lib/iaServidor";
import { fetchRetry } from "@/lib/mercado";
import { compraBase, mapArquivos } from "@/lib/compra";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 25 * 1024 * 1024; // limite prático por análise (a API aceita até 32 MB por requisição)

/** Aceita link do PNCP (".../app/editais/{cnpj}/{ano}/{seq}") ou o nº de controle ("{cnpj}-1-{seq}/{ano}"). */
function parsePncp(v: string) {
  const link = v.match(/editais\/(\d{14})\/(\d{4})\/(\d+)/);
  if (link) return { cnpj: link[1], ano: Number(link[2]), seq: Number(link[3]), id: `${link[1]}-1-${link[3].padStart(6, "0")}/${link[2]}` };
  const ctrl = v.trim().match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
  if (ctrl) return { cnpj: ctrl[1], ano: Number(ctrl[3]), seq: Number(ctrl[2]), id: v.trim() };
  return null;
}

const isPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

async function baixar(url: string): Promise<Buffer | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000), cache: "no-store" });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status < 500) return null;
    } catch {
      /* tenta de novo */
    }
  }
  return null;
}

/**
 * POST /api/edital/analisar (multipart/form-data)
 *  - arquivos: um ou mais PDFs; ou
 *  - pncp: link/nº de controle da licitação no PNCP (baixa edital e termo de referência); e/ou
 *  - texto: trecho do edital colado
 */
export async function POST(req: Request) {
  // Provedor escolhido em Configurações → Inteligência artificial (enviado pelo navegador).
  const escolha = iaDoPedido(req);
  if ("erro" in escolha) return NextResponse.json({ error: escolha.erro }, { status: escolha.status });
  const { ia } = escolha;
  // O Gemini aceita até ~20 MB por pedido com os PDFs embutidos (base64 aumenta ~33%).
  const limite = ia.provedor === "gemini" ? 14 * 1024 * 1024 : MAX_BYTES;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });

  const pdfs: { nome: string; base64: string }[] = [];
  let total = 0;
  let pncpId: string | null = null;
  let titulo = "";

  for (const f of form.getAll("arquivos")) {
    if (!(f instanceof File) || f.size === 0) continue;
    const buf = Buffer.from(await f.arrayBuffer());
    if (!isPdf(buf)) return NextResponse.json({ error: `"${f.name}" não é um PDF.` }, { status: 400 });
    total += buf.length;
    if (total > limite) return NextResponse.json({ error: `Arquivos grandes demais (máximo ${Math.round(limite / 1048576)} MB no total${ia.provedor === "gemini" ? " com o Gemini" : ""}).` }, { status: 400 });
    pdfs.push({ nome: f.name, base64: buf.toString("base64") });
    titulo ||= f.name.replace(/\.pdf$/i, "");
  }

  const pncp = String(form.get("pncp") || "").trim();
  if (pncp) {
    const p = parsePncp(pncp);
    if (!p) return NextResponse.json({ error: "Link do PNCP não reconhecido. Use o link da página do edital no PNCP." }, { status: 400 });
    pncpId = p.id;
    const arquivos = mapArquivos(await fetchRetry<Record<string, unknown>[]>(`${compraBase(p.cnpj, p.ano, p.seq)}/arquivos`, 5, 15000));
    // Prioriza edital e termo de referência; ignora atas, resultados e afins.
    const peso = (t: string) => (/edital/i.test(t) ? 0 : /termo de refer|projeto b[aá]sico|anexo/i.test(t) ? 1 : 9);
    const escolhidos = arquivos.filter((a) => peso(`${a.tipo} ${a.titulo}`) < 9).sort((a, b) => peso(`${a.tipo} ${a.titulo}`) - peso(`${b.tipo} ${b.titulo}`)).slice(0, 4);
    if (!escolhidos.length) return NextResponse.json({ error: "Não encontrei o edital em PDF publicado no PNCP para essa licitação." }, { status: 404 });
    for (const a of escolhidos) {
      const buf = await baixar(a.url);
      if (!buf || !isPdf(buf) || total + buf.length > limite) continue; // pula ZIP, imagens e arquivos que estourem o limite
      total += buf.length;
      pdfs.push({ nome: `${a.tipo} - ${a.titulo}`, base64: buf.toString("base64") });
    }
    if (!pdfs.length) return NextResponse.json({ error: "Os arquivos do edital no PNCP não são PDFs legíveis (ex.: ZIP). Baixe e envie o PDF manualmente." }, { status: 422 });
    titulo ||= `Licitação ${p.id}`;
  }

  const texto = String(form.get("texto") || "");
  if (!pdfs.length && !texto.trim()) return NextResponse.json({ error: "Envie o PDF do edital, o link do PNCP ou cole o texto." }, { status: 400 });

  try {
    const resultado = await analisarEdital({ pdfs, texto }, ia);
    return NextResponse.json({
      titulo: resultado.dados_gerais?.objeto && resultado.dados_gerais.objeto !== "Não informado" ? resultado.dados_gerais.objeto.slice(0, 140) : titulo || "Edital",
      fonte: pdfs.map((p) => p.nome).join(", ") || "texto colado",
      pncpId,
      resultado,
    });
  } catch (e) {
    const msg = e instanceof EditalError ? e.message : "Falha ao analisar o edital.";
    return NextResponse.json({ error: msg }, { status: e instanceof EditalError ? 422 : 500 });
  }
}
