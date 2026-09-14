/**
 * Document text extraction for the AI read_file tool.
 *
 * Supports: PDF (pdf-parse v2), Word (.docx via mammoth), Excel
 * (.xlsx/.xls/.csv via xlsx), and images via OCR (tesseract.js — English).
 * Plain text files are handled by the existing readTextFile path.
 */

export type ExtractResult =
  | { ok: true; text: string; kind: string }
  | { ok: false; error: string };

export function isDocumentExt(ext: string): boolean {
  return ["pdf", "docx", "xlsx", "xls", "csv"].includes(ext);
}

export function isImageFileExt(ext: string): boolean {
  return ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext);
}

export async function extractDocument(absPath: string, ext: string): Promise<ExtractResult> {
  try {
    if (ext === "pdf") {
      const { PDFParse } = await import("pdf-parse");
      const buf = await import("node:fs/promises").then((m) => m.readFile(absPath));
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      try {
        const data = await parser.getText();
        return { ok: true, text: clamp(data.text), kind: `PDF, ${data.total ?? "?"} pages` };
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    }
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      const data = await mammoth.extractRawText({ path: absPath });
      return { ok: true, text: clamp(data.value), kind: "Word document" };
    }
    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      const XLSX = await import("xlsx");
      const wb = XLSX.readFile(absPath, { sheetRows: 2000 });
      const parts: string[] = [];
      for (const name of wb.SheetNames.slice(0, 10)) {
        const sheet = wb.Sheets[name];
        if (!sheet) continue;
        parts.push(`## Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet).slice(0, 60_000)}`);
      }
      return { ok: true, text: clamp(parts.join("\n\n")), kind: `${ext.toUpperCase()} spreadsheet` };
    }
    return { ok: false, error: `Unsupported document type .${ext}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "extraction failed" };
  }
}

/** OCR an image file (English). Slow (~seconds); used only when asked. */
export async function ocrImage(absPath: string): Promise<ExtractResult> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const { data } = await worker.recognize(absPath);
      const text = (data.text ?? "").trim();
      if (!text) return { ok: false, error: "No readable text found in the image." };
      return { ok: true, text: clamp(text), kind: "image (OCR)" };
    } finally {
      await worker.terminate();
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OCR failed" };
  }
}

function clamp(text: string, max = 120_000): string {
  const t = text.replace(/\u0000/g, "").trim();
  return t.length > max ? t.slice(0, max) + `\n…[truncated, ${t.length - max} more chars]` : t;
}

export function docKindLabel(ext: string): string {
  const labels: Record<string, string> = {
    pdf: "PDF", docx: "Word document", xlsx: "Excel sheet", xls: "Excel sheet", csv: "CSV",
  };
  return labels[ext] ?? ext;
}