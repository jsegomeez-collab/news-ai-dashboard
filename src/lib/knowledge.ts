import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";
import mammoth from "mammoth";

const KNOWLEDGE_DIR = join(process.cwd(), "knowledge");

export type KnowledgeBundle = {
  basesNegocio: string; // problema, cliente ideal, oferta, competencia
  tonalidad: string;
  historia: string;
  combined: string; // todo junto, listo para el system prompt
  hash: string; // cambia cuando cambia cualquier archivo
  fileCount: number;
};

function walk(dir: string): string[] {
  let files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const e of entries) {
    if (e.startsWith(".") || e.toLowerCase() === "readme.md") continue;
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) files = files.concat(walk(full));
    else files.push(full);
  }
  return files;
}

async function readDoc(path: string): Promise<string> {
  const ext = extname(path).toLowerCase();
  try {
    if (ext === ".md" || ext === ".txt") {
      return readFileSync(path, "utf8");
    }
    if (ext === ".docx") {
      const { value } = await mammoth.extractRawText({ path });
      return value;
    }
    if (ext === ".pdf") {
      // import dinámico: pdf-parse es CommonJS.
      const mod = await import("pdf-parse");
      const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(readFileSync(path));
      return data.text;
    }
  } catch (e) {
    console.warn(`[knowledge] no pude leer ${path}:`, (e as Error).message);
  }
  return "";
}

async function loadFolder(sub: string): Promise<{ text: string; files: string[] }> {
  const dir = join(KNOWLEDGE_DIR, sub);
  const files = walk(dir);
  const parts: string[] = [];
  for (const f of files) {
    const text = (await readDoc(f)).trim();
    if (text) parts.push(`### ${f.replace(KNOWLEDGE_DIR, "").replace(/\\/g, "/")}\n${text}`);
  }
  return { text: parts.join("\n\n"), files };
}

let _cache: KnowledgeBundle | null = null;

export async function loadKnowledge(force = false): Promise<KnowledgeBundle> {
  const bases = await loadFolder("bases-negocio");
  const tono = await loadFolder("tonalidad");
  const hist = await loadFolder("historia");

  const allFiles = [...bases.files, ...tono.files, ...hist.files].sort();
  const hash = createHash("sha256");
  for (const f of allFiles) {
    try {
      hash.update(f + ":" + statSync(f).mtimeMs);
    } catch {
      /* ignore */
    }
  }
  const digest = hash.digest("hex").slice(0, 16);

  if (!force && _cache && _cache.hash === digest) return _cache;

  const combined = [
    bases.text && `## BASES DE NEGOCIO\n${bases.text}`,
    tono.text && `## TONALIDAD Y FORMA DE HABLAR\n${tono.text}`,
    hist.text && `## HISTORIA Y MARCA\n${hist.text}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  _cache = {
    basesNegocio: bases.text,
    tonalidad: tono.text,
    historia: hist.text,
    combined,
    hash: digest,
    fileCount: allFiles.length,
  };
  return _cache;
}
