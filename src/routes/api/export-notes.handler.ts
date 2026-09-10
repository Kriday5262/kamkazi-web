/**
 * Export-notes logic (plain async handler, mounted by ./export-notes.ts).
 *
 * GET /api/export-notes — every note for the session user as a .md file
 * (title as filename, body as content) inside a real ZIP archive built with
 * the zero-dependency STORE (uncompressed) zip format: local file headers +
 * central directory + EOCD, all CRC-32'd. Node's zlib crc32 (v22.15+) is used
 * when available with a table-based fallback.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";

/** CRC-32 (IEEE), table-based — matches zlib's crc32 when node exposes it. */
const CRC_TABLE: number[] = (() => {
  const t: number[] = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Sanitise a note title into a safe, unique filename stem. */
function fileStem(title: string, index: number, seen: Set<string>): string {
  const base =
    title
      .trim()
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_") // eslint-disable-line no-control-regex
      .slice(0, 80) || `note-${index + 1}`;
  let name = base;
  let n = 2;
  while (seen.has(name.toLowerCase())) name = `${base} (${n++})`;
  seen.add(name.toLowerCase());
  return name;
}

export async function exportNotesHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const rows = await db
      .select()
      .from(notes)
      .where(eq(notes.userId, session.uid))
      .orderBy(notes.createdAtTs);

    const seen = new Set<string>();
    const files = rows.map((n, i) => {
      const stem = fileStem(n.title, i, seen);
      const body = n.body || "";
      return { name: `${stem}.md`, data: new TextEncoder().encode(body) };
    });

    const zip = buildZip(files);
    return new Response(new Uint8Array(zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="kamkazi-notes-${new Date().toISOString().slice(0, 10)}.zip"`,
        "content-length": String(zip.length),
      },
    });
  } catch (err) {
    console.error("[export-notes] failed:", err);
    return new Response(JSON.stringify({ error: "export failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Minimal ZIP (STORE method, no compression) — valid per APPNOTE.TXT. */
function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0),
      ...nameBytes,
    ]);
    chunks.push(local, e.data);

    central.push(
      new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0x0800),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(crc),
        ...u32(size),
        ...u32(size),
        ...u16(nameBytes.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset),
        ...nameBytes,
      ]),
    );
    offset += local.length + size;
  }

  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array([
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(offset),
    ...u16(0),
  ]);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of [...chunks, ...central, eocd]) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
