import { promises as fs } from "fs";
import path from "path";
import { zipSync } from "fflate";

export const runtime = "nodejs";

const FILES = ["manifest.json", "background.js", "probe.js", "monitor.js", "bridge.js", "popup.html", "popup.js", "offscreen.html", "offscreen.js", "icon.png"];

/** Baixa a extensão PEPPACORP Monitor (pasta extension/) em .zip, pronta para "Carregar sem compactação". */
export async function GET() {
  const dir = path.join(process.cwd(), "extension");
  const entries: Record<string, Uint8Array> = {};
  for (const f of FILES) entries[`peppacorp-monitor/${f}`] = new Uint8Array(await fs.readFile(path.join(dir, f)));
  const zip = zipSync(entries, { level: 9 });
  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="peppacorp-monitor.zip"',
      "Cache-Control": "no-store",
    },
  });
}
