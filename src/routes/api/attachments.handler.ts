/**
 * Phase 2 — real attachment uploads.
 *
 * POST /api/attachments  (multipart form: file, taskId)
 *   → saves to /app/attachments/<uid>/<taskId>/<filename>
 *   → returns { attachment: { id, name, size, type, path } } for the caller to
 *     merge into tasks.attachments (jsonb).
 *
 * GET /api/attachments?path=<server-relative path>
 *   → streams the stored file back (download). Auth: session + path must be
 *     inside the caller's own /attachments/<uid>/ tree.
 *
 * DELETE via POST { action: "delete", path } — removes the file from disk.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { sessionFromRequest } from "@/server/session.util";

const ROOT = process.env["ATTACHMENTS_DIR"] || "/app/attachments";
const MAX_BYTES = 25 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Resolve a server-relative path and verify it stays inside the user's tree. */
function safeResolve(uid: string, rel: string): string | null {
  const abs = path.resolve(ROOT, rel.replace(/^\/+/, ""));
  const root = path.resolve(ROOT, uid);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export async function attachmentsHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthorized" }, 401);
  const uid = session.uid;
  const url = new URL(request.url);

  if (request.method === "POST") {
    const ctype = request.headers.get("content-type") ?? "";
    if (ctype.includes("application/json")) {
      // { action: "delete", path }
      const body = (await request.json().catch(() => ({}))) as {
        action?: string;
        path?: string;
      };
      if (body.action === "delete" && body.path) {
        const abs = safeResolve(uid, body.path);
        if (!abs) return json({ error: "bad path" }, 400);
        await unlink(abs).catch(() => undefined);
        return json({ ok: true });
      }
      return json({ error: "unknown action" }, 400);
    }

    // multipart upload
    const form = await request.formData().catch(() => null);
    if (!form) return json({ error: "bad form" }, 400);
    const file = form.get("file");
    const taskId = String(form.get("taskId") ?? "");
    if (!(file instanceof File) || !file.name || !/^[A-Za-z0-9_-]+$/.test(taskId))
      return json({ error: "missing file or taskId" }, 400);
    if (file.size > MAX_BYTES) return json({ error: "file too large (max 25 MB)" }, 413);

    const safeName = path
      .basename(file.name)
      .replace(/[^\w.\-() ]+/g, "_")
      .slice(0, 120);
    const dir = path.join(ROOT, uid, taskId);
    await mkdir(dir, { recursive: true });
    // Prefix with a short random id so same-named files never collide.
    const stored = `${randomBytes(4).toString("hex")}-${safeName}`;
    const abs = path.join(dir, stored);
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(abs, buf);

    const attachment = {
      id: `a_${randomBytes(4).toString("hex")}`,
      name: safeName,
      size: humanSize(buf.length),
      type: file.type || undefined,
      path: `/attachments/${uid}/${taskId}/${stored}`,
    };
    return json({ attachment });
  }

  // GET → download
  const rel = url.searchParams.get("path") ?? "";
  const abs = safeResolve(uid, rel);
  if (!abs) return json({ error: "bad path" }, 400);
  try {
    const data = await readFile(abs);
    const name = path.basename(abs);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      },
    });
  } catch {
    return json({ error: "not found" }, 404);
  }
}
