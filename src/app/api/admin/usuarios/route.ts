import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { adminDaRequisicao } from "@/lib/adminServidor";

export type UsuarioAdmin = {
  id: string;
  email: string;
  admin: boolean;
  criado_em: string;
  ultimo_acesso: string | null;
};

async function autorizar(req: Request) {
  const sb = serviceClient();
  if (!sb) return { erro: NextResponse.json({ error: "Supabase não configurado no servidor" }, { status: 503 }) };
  const eu = await adminDaRequisicao(sb, req);
  if (!eu) return { erro: NextResponse.json({ error: "acesso só para administradores" }, { status: 403 }) };
  return { sb, eu };
}

/** GET /api/admin/usuarios — lista as contas. */
export async function GET(req: Request) {
  const a = await autorizar(req);
  if (a.erro) return a.erro;
  const { data, error } = await a.sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const usuarios: UsuarioAdmin[] = data.users
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      admin: u.app_metadata?.role === "admin",
      criado_em: u.created_at,
      ultimo_acesso: u.last_sign_in_at ?? null,
    }))
    .sort((x, y) => x.email.localeCompare(y.email));
  return NextResponse.json({ usuarios, eu: a.eu });
}

/** POST /api/admin/usuarios — cria uma conta já confirmada. Body: { email, senha, admin? } */
export async function POST(req: Request) {
  const a = await autorizar(req);
  if (a.erro) return a.erro;
  const b = (await req.json().catch(() => ({}))) as { email?: string; senha?: string; admin?: boolean };
  const email = String(b.email || "").trim().toLowerCase();
  const senha = String(b.senha || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  if (senha.length < 6) return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
  const { data, error } = await a.sb.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    app_metadata: b.admin ? { role: "admin" } : {},
  });
  if (error) {
    const msg = /already|registered|exists/i.test(error.message) ? "Já existe uma conta com este e-mail." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data.user.id });
}

/** PATCH /api/admin/usuarios — muda o perfil ou a senha. Body: { id, admin?, senha? } */
export async function PATCH(req: Request) {
  const a = await autorizar(req);
  if (a.erro) return a.erro;
  const b = (await req.json().catch(() => ({}))) as { id?: string; admin?: boolean; senha?: string };
  if (!b.id) return NextResponse.json({ error: "Usuário não informado." }, { status: 400 });
  if (b.id === a.eu && b.admin === false) return NextResponse.json({ error: "Você não pode tirar o seu próprio acesso de administrador." }, { status: 400 });
  const attrs: { app_metadata?: Record<string, unknown>; password?: string } = {};
  if (typeof b.admin === "boolean") attrs.app_metadata = { role: b.admin ? "admin" : null };
  if (b.senha !== undefined) {
    if (String(b.senha).length < 6) return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
    attrs.password = String(b.senha);
  }
  const { error } = await a.sb.auth.admin.updateUserById(b.id, attrs);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/usuarios?id= — exclui a conta e todos os dados dela. */
export async function DELETE(req: Request) {
  const a = await autorizar(req);
  if (a.erro) return a.erro;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Usuário não informado." }, { status: 400 });
  if (id === a.eu) return NextResponse.json({ error: "Você não pode excluir a sua própria conta." }, { status: 400 });
  const { error } = await a.sb.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
