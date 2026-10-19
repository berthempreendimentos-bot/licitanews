import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readSheet } from "read-excel-file/node";

/**
 * CAPAG — Capacidade de Pagamento dos Municípios (Tesouro Nacional).
 * Fonte: Tesouro Transparente (CKAN), planilha mais recente do conjunto "capag-municipios".
 * A planilha tem ~25 MB: é baixada uma vez e guardada em .cache/ por 7 dias.
 */

export type CapagMunicipio = {
  ibge: string;
  municipio: string;
  uf: string;
  capag: string; // A+, A, B+, B, C, D ou n.d.
  ind1: number | null; // Endividamento (DC/RCL)
  nota1: string;
  ind2: number | null; // Poupança corrente (DC/RCA)
  nota2: string;
  ind3: number | null; // Liquidez (OF/DCB)
  nota3: string;
  observacao: string;
};

export type CapagBase = { fonte: string; atualizadoEm: string; url: string; municipios: CapagMunicipio[] };

const CKAN = "https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=capag-municipios";
const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "capag-municipios.json");
const TTL = 7 * 86400000;

let memoria: { base: CapagBase; em: number } | null = null;
let emAndamento: Promise<CapagBase> | null = null;

type Resource = { name: string; format: string; url: string; created: string };

async function ultimaPlanilha(): Promise<Resource> {
  const r = await fetch(CKAN, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (!r.ok) throw new Error(`Tesouro Transparente respondeu HTTP ${r.status}`);
  const j = (await r.json()) as { result: { resources: Resource[] } };
  const xlsx = j.result.resources.filter((x) => /xlsx/i.test(x.format) || /\.xlsx$/i.test(x.url));
  if (!xlsx.length) throw new Error("Nenhuma planilha CAPAG encontrada no Tesouro Transparente.");
  return xlsx.sort((a, b) => a.created.localeCompare(b.created)).at(-1)!;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (v == null ? "" : String(v).trim());

async function baixarEProcessar(): Promise<CapagBase> {
  const res = await ultimaPlanilha();
  const r = await fetch(res.url, { signal: AbortSignal.timeout(120000), cache: "no-store" });
  if (!r.ok) throw new Error(`Falha ao baixar a planilha CAPAG (HTTP ${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());

  // A aba "Prévia da CAPAG" tem uma linha por município com a nota final e os 3 indicadores.
  const rows = await readSheet(buf, "Prévia da CAPAG");
  const hIdx = rows.findIndex((row) => row.some((c) => str(c) === "Código Município Completo"));
  if (hIdx < 0) throw new Error("Formato da planilha CAPAG não reconhecido.");
  const header = rows[hIdx].map(str);
  const col = (name: string) => header.indexOf(name);
  const c = {
    ibge: col("Código Município Completo"),
    nome: col("Nome_Município"),
    uf: col("UF"),
    capag: col("CAPAG"),
    i1: col("Indicador 1"), n1: col("Nota 1"),
    i2: col("Indicador 2"), n2: col("Nota 2"),
    i3: col("Indicador 3"), n3: col("Nota 3"),
    obs: col("Observação"),
  };
  const municipios: CapagMunicipio[] = [];
  for (const row of rows.slice(hIdx + 1)) {
    const ibge = str(row[c.ibge]);
    if (!/^\d{7}$/.test(ibge)) continue;
    municipios.push({
      ibge,
      municipio: str(row[c.nome]),
      uf: str(row[c.uf]),
      capag: str(row[c.capag]) || "n.d.",
      ind1: num(row[c.i1]), nota1: str(row[c.n1]),
      ind2: num(row[c.i2]), nota2: str(row[c.n2]),
      ind3: num(row[c.i3]), nota3: str(row[c.n3]),
      observacao: c.obs >= 0 ? str(row[c.obs]) : "",
    });
  }
  return { fonte: res.name.trim(), atualizadoEm: res.created, url: res.url, municipios };
}

export async function carregarCapag(): Promise<CapagBase> {
  if (memoria && Date.now() - memoria.em < TTL) return memoria.base;
  try {
    const raw = JSON.parse(await readFile(CACHE_FILE, "utf8")) as { em: number; base: CapagBase };
    if (Date.now() - raw.em < TTL) {
      memoria = raw;
      return raw.base;
    }
  } catch {
    /* sem cache em disco */
  }
  emAndamento ??= baixarEProcessar()
    .then(async (base) => {
      memoria = { base, em: Date.now() };
      await mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
      await writeFile(CACHE_FILE, JSON.stringify(memoria)).catch(() => {});
      return base;
    })
    .finally(() => {
      emAndamento = null;
    });
  return emAndamento;
}
