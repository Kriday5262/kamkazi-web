/**
 * Phase 4 — /api/files route (drive file browser).
 *
 * GET  /api/files?op=list&path=...          → folder listing
 * GET  /api/files?op=read&path=...          → text file content (≤200KB)
 * GET  /api/files?op=raw&path=...           → stream file (inline images/pdf, else download)
 * GET  /api/files?op=search&q=...           → recursive filename search (read-only)
 * POST /api/files  JSON actions:
 *      { action: "write", path, content }    → save a text file
 *      { action: "mkdir", path }             → create folder
 *      { action: "rename", from, toName }
 *      { action: "move", from, toDir }
 *      { action: "delete", path }            → UI always confirms first
 * POST /api/files  multipart (dir, file)     → upload one file
 *
 * All paths are allowlisted to the drive root (see files.server.ts).
 */
import { createFileRoute } from "@tanstack/react-router";
import { sessionFromRequest } from "@/server/session.util";
import {
  abortUpload,
  appendUploadChunk,
  createDir,
  deleteEntry,
  isImageExt,
  isTextExt,
  json,
  listDir,
  moveEntry,
  readTextFile,
  renameEntry,
  safePath,
  saveUpload,
  walkFiles,
  writeTextFile,
} from "@/server/files.server";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".srt": "text/plain",
};

async function filesHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const op = url.searchParams.get("op") ?? "list";
  const rel = url.searchParams.get("path") ?? "/";

  if (op === "list") {
    const res = await listDir(rel);
    if (!res) return json({ error: "not found" }, 404);
    return json({ ...res, path: rel });
  }

  if (op === "read") {
    const ext = rel.toLowerCase().replace(/.*\./, "").replace(/^\/+/, "");
    const extClean = ext.includes("/") ? "" : ext;
    if (!isTextExt(extClean)) return json({ error: "not a text file" }, 415);
    const res = await readTextFile(rel);
    if (!res) return json({ error: "too large or unreadable (200 KB cap)" }, 413);
    return json({ ...res, path: rel });
  }

  if (op === "raw") {
    const abs = await safePath(rel);
    if (!abs) return json({ error: "bad path" }, 400);
    try {
      const buf = await import("node:fs/promises").then((m) => m.readFile(abs));
      const name = rel.split("/").pop() || "file";
      const ext = name.toLowerCase().replace(/.*\./, ".");
      const ctype = MIME[ext] ?? "application/octet-stream";
      const inline = (isImageExt(ext.replace(".", "")) || ext === ".pdf") && ctype !== "application/octet-stream";
      return new Response(new Uint8Array(buf), {
        headers: {
          "content-type": ctype,
          "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
          "cache-control": "private, max-age=60",
        },
      });
    } catch {
      return json({ error: "not found" }, 404);
    }
  }

  if (op === "search") {
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if (!q) return json({ results: [] });
    // 205k+ files live on the drive — a flat recursive walk can't cover it.
    // Strategy: BFS with a real-time budget (≤4s) and an entry cap; skip the
    // huge media libraries (Immich/Movies/TV Shows/Music) unless the query
    // explicitly names one of them, so ordinary searches reach Work/ quickly.
    const out: { path: string; name: string; ext: string }[] = [];
    const SKIP = new Set(["immich", "movies", "tv shows", "music"]);
    const deadline = Date.now() + 4_000;
    const roots = SKIP.has(q) || [...SKIP].some((s) => q.includes(s))
      ? ["/"]
      : ["/Work", "/Personal", "/"];
    for (const start of roots) {
      if (out.length > 0 || Date.now() > deadline) break;
      await walkFiles(start, { depth: 8, max: 5000, out, deadline, skip: SKIP });
    }
    const results = out
      .filter((f) => f.name.toLowerCase().includes(q))
      .slice(0, 40)
      .map((f) => ({ ...f, isText: isTextExt(f.ext), isImage: isImageExt(f.ext) }));
    return json({ results });
  }

  return json({ error: "unknown op" }, 400);
}

async function filesPostHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthorized" }, 401);
  const ctype = request.headers.get("content-type") ?? "";

  if (ctype.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return json({ error: "bad form" }, 400);
    const file = form.get("file");
    const dir = String(form.get("dir") ?? "/");
    if (!(file instanceof File)) return json({ error: "missing file" }, 400);

    // Chunked upload (op=chunk): part N of T for one uploadId.
    if (String(form.get("chunk") ?? "") === "1") {
      const name = String(form.get("name") ?? "");
      const uploadId = String(form.get("uploadId") ?? "");
      const index = Number(form.get("index"));
      const total = Number(form.get("total"));
      if (form.get("op") === "abort") {
        const ok = await abortUpload(dir, name, uploadId);
        return ok ? json({ ok: true }) : json({ error: "abort failed" }, 400);
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const res = await appendUploadChunk(dir, name, uploadId, index, total, buf);
      return res.ok ? json({ ok: true }) : json({ error: res.error }, 400);
    }

    if (file.size > 200 * 1024 * 1024) return json({ error: "too large (200 MB cap)" }, 413);
    const buf = Buffer.from(await file.arrayBuffer());
    const res = await saveUpload(dir, file.name, buf);
    return res.ok ? json({ ok: true }) : json({ error: res.error }, 400);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, string>;
  const action = body["action"];
  try {
    if (action === "write") {
      const ok = await writeTextFile(body["path"] ?? "", body["content"] ?? "");
      return ok ? json({ ok: true }) : json({ error: "write failed" }, 400);
    }
    if (action === "mkdir") {
      const ok = await createDir(body["path"] ?? "");
      return ok ? json({ ok: true }) : json({ error: "mkdir failed" }, 400);
    }
    if (action === "rename") {
      const ok = await renameEntry(body["from"] ?? "", body["toName"] ?? "");
      return ok ? json({ ok: true }) : json({ error: "rename failed" }, 400);
    }
    if (action === "move") {
      const ok = await moveEntry(body["from"] ?? "", body["toDir"] ?? "/");
      return ok ? json({ ok: true }) : json({ error: "move failed" }, 400);
    }
    if (action === "delete") {
      const ok = await deleteEntry(body["path"] ?? "");
      return ok ? json({ ok: true }) : json({ error: "delete failed" }, 400);
    }
  } catch {
    return json({ error: "operation failed" }, 500);
  }
  return json({ error: "unknown action" }, 400);
}

export const Route = createFileRoute("/api/files")({
  server: {
    handlers: {
      GET: async ({ request }) => filesHandler(request),
      POST: async ({ request }) => filesPostHandler(request),
    },
  },
});