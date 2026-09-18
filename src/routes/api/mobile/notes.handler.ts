/**
 * GET /api/mobile/notes?query= — native app notes list (P4).
 * POST /api/mobile/notes { id?, title, body, tags? } — create/update.
 */
import { mobileAuth, mobileJson, mobileUnauthorized } from "@/server/mobile-auth.server";

export async function mobileNotesHandler(request: Request): Promise<Response> {
  const session = await mobileAuth(request);
  if (!session) return mobileUnauthorized();
  const { db } = await import("@/db");
  const { notes } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  if (request.method === "GET") {
    const url = new URL(request.url);
    const q = (url.searchParams.get("query") ?? "").toLowerCase();
    const rows = await db.select().from(notes).where(eq(notes.userId, session.uid)).limit(500);
    const filtered = q
      ? rows.filter(
          (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
        )
      : rows;
    filtered.sort((a, b) => (a.updatedAtTs < b.updatedAtTs ? 1 : -1));
    return mobileJson({
      notes: filtered.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        tags: n.tags,
        pinned: n.pinned,
        updatedAt: n.updatedAtTs,
      })),
    });
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      title?: string;
      body?: string;
    };
    const now = new Date();
    let id = body.id?.trim() ?? "";
    if (id) {
      await db
        .update(notes)
        .set({ title: (body.title ?? "").slice(0, 500), body: (body.body ?? "").slice(0, 100_000), updatedAtTs: now })
        .where(eq(notes.id, id));
      return mobileJson({ ok: true, id });
    }
    id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(notes).values({
      id,
      userId: session.uid,
      notebookId: "default",
      title: (body.title ?? "").slice(0, 500),
      body: (body.body ?? "").slice(0, 100_000),
      createdAtTs: now,
      updatedAtTs: now,
    });
    return mobileJson({ ok: true, id });
  }

  return mobileJson({ ok: false, error: "Method not allowed" }, 405);
}