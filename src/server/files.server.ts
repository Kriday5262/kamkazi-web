/**
 * Phase 4 — file browser backend.
 *
 * Every operation is allowlisted to the drive mount root
 * (DRIVE_ROOT, default /app/shantanu-drive = the user's
 * /media/HIKVISION/Shantanu tree). Paths are canonicalised with
 * realpath-style resolution; anything that escapes the root — including via
 * symlinks — is rejected before the operation runs.
 *
 * Task attachments live at <root>/Work/Kamkazi/Attachments and are naturally
 * part of this tree — one mount, no duplication.
 */
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { realpath } from "node:fs/promises";

export const DRIVE_ROOT = process.env["DRIVE_ROOT"] || "/app/shantanu-drive";

export const TEXT_EXTENSIONS = new Set([
  "md", "txt", "json", "ts", "tsx", "js", "jsx", "css", "html", "yml", "yaml",
  "csv", "sh", "py", "xml", "ini", "conf", "log", "srt", "env", "toml",
]);
export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
export const MAX_TEXT_BYTES = 200 * 1024;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Resolve a request path inside the drive; null when it escapes the root. */
export async function safePath(rel: string): Promise<string | null> {
  const cleaned = rel.replace(/^\/+/, "").replace(/\\/g, "/");
  if (cleaned.split("/").some((seg) => seg === "..")) return null;
  const abs = path.resolve(DRIVE_ROOT, cleaned);
  const root = path.resolve(DRIVE_ROOT);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  // Symlink escape check (best effort — the mount is a plain bind).
  try {
    const real = await realpath(abs);
    if (real !== root && !real.startsWith(root + path.sep)) return null;
  } catch {
    // Missing file is fine for write operations.
  }
  return abs;
}

export interface FileEntry {
  name: string;
  type: "dir" | "file";
  size: number;
  sizeLabel: string;
  modified: string; // ISO
  ext: string;
}

/** List one folder (non-recursive). Large folders are capped client-side. */
export async function listDir(rel: string): Promise<{ entries: FileEntry[]; total: number } | null> {
  const abs = await safePath(rel);
  if (!abs) return null;
  let dirents;
  try {
    dirents = await readdir(abs, { withFileTypes: true });
  } catch {
    return null;
  }
  const entries: FileEntry[] = [];
  for (const d of dirents) {
    if (d.name.startsWith(".")) continue; // hidden system files stay out
    const childRel = path.posix.join(rel.replace(/^\/+/, ""), d.name);
    try {
      const st = await stat(path.join(abs, d.name));
      const isDir = st.isDirectory();
      entries.push({
        name: d.name,
        type: isDir ? "dir" : "file",
        size: isDir ? 0 : st.size,
        sizeLabel: isDir ? "—" : humanSize(st.size),
        modified: st.mtime.toISOString(),
        ext: isDir ? "" : path.extname(d.name).toLowerCase().replace(/^\./, ""),
      });
      void childRel;
    } catch {
      // unreadable entry — skip
    }
  }
  entries.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
  );
  return { entries, total: entries.length };
}

export function isTextExt(ext: string): boolean {
  return TEXT_EXTENSIONS.has(ext);
}
export function isImageExt(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext);
}

/** Read a text file (capped). Returns null when too big or unreadable. */
export async function readTextFile(
  rel: string,
): Promise<{ content: string; truncated: boolean; size: number } | null> {
  const abs = await safePath(rel);
  if (!abs) return null;
  try {
    const st = await stat(abs);
    if (st.isDirectory() || st.size > MAX_TEXT_BYTES) return null;
    const buf = await readFile(abs);
    return {
      content: buf.toString("utf8"),
      truncated: false,
      size: st.size,
    };
  } catch {
    return null;
  }
}

export async function writeTextFile(rel: string, content: string): Promise<boolean> {
  const abs = await safePath(rel);
  if (!abs || abs.endsWith(path.sep)) return false;
  try {
    await writeFile(abs, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function createDir(rel: string): Promise<boolean> {
  const abs = await safePath(rel);
  if (!abs) return false;
  try {
    await mkdir(abs, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function renameEntry(fromRel: string, toName: string): Promise<boolean> {
  const fromAbs = await safePath(fromRel);
  if (!fromAbs || !toName || toName.includes("/") || toName.includes("..")) return false;
  const toAbs = path.join(path.dirname(fromAbs), path.basename(toName));
  if (!toAbs.startsWith(path.resolve(DRIVE_ROOT) + path.sep)) return false;
  try {
    await rename(fromAbs, toAbs);
    return true;
  } catch {
    return false;
  }
}

export async function moveEntry(fromRel: string, toDirRel: string): Promise<boolean> {
  const fromAbs = await safePath(fromRel);
  const toDirAbs = await safePath(toDirRel);
  if (!fromAbs || !toDirAbs) return false;
  const toAbs = path.join(toDirAbs, path.basename(fromAbs));
  if (toAbs === fromAbs) return true;
  try {
    await rename(fromAbs, toAbs);
    return true;
  } catch {
    return false;
  }
}

export async function deleteEntry(rel: string): Promise<boolean> {
  const abs = await safePath(rel);
  if (!abs || abs === path.resolve(DRIVE_ROOT)) return false; // never the root
  try {
    await rm(abs, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function saveUpload(
  dirRel: string,
  fileName: string,
  data: Buffer,
): Promise<{ ok: boolean; error?: string }> {
  const dirAbs = await safePath(dirRel);
  if (!dirAbs) return { ok: false, error: "bad path" };
  const safeName = path.basename(fileName).replace(/[^\w.\-() ]+/g, "_").slice(0, 160);
  if (!safeName || safeName === "." || safeName === "..")
    return { ok: false, error: "bad file name" };
  try {
    await writeFile(path.join(dirAbs, safeName), data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "write failed" };
  }
}

/** Recursive walk (bounded) for search + AI tools. Read-only. */
export async function walkFiles(
  rel: string,
  opts: { depth: number; max: number; out: { path: string; name: string; ext: string }[] },
): Promise<void> {
  if (opts.out.length >= opts.max || opts.depth <= 0) return;
  const listing = await listDir(rel);
  if (!listing) return;
  for (const e of listing.entries) {
    if (opts.out.length >= opts.max) return;
    const childRel = path.posix.join(rel.replace(/^\/+/, ""), e.name);
    if (e.type === "dir") {
      await walkFiles(childRel, { depth: opts.depth - 1, max: opts.max, out: opts.out });
    } else {
      opts.out.push({ path: `/${childRel}`, name: e.name, ext: e.ext });
    }
  }
}