import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Minimal, dependency-free Markdown renderer for notes and chat. */
export function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string | undefined;
}) {
  return (
    <div className={cn("space-y-3 text-[15px] leading-relaxed", className)}>
      {renderBlocks(source)}
    </div>
  );
}

function renderBlocks(src: string): ReactNode[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (!line.trim()) {
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++;
      out.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[13px] leading-relaxed"
        >
          <code>
            {lang ? (
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
                {lang}
              </span>
            ) : null}
            {buf.join("\n")}
          </code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2]!;
      const sizes: Record<number, string> = {
        1: "text-2xl font-semibold tracking-tight",
        2: "text-xl font-semibold tracking-tight",
        3: "text-base font-semibold",
        4: "text-sm font-semibold uppercase tracking-wide text-muted-foreground",
      };
      const Tag = `h${Math.min(level + 1, 6)}` as "h2";
      out.push(
        <Tag key={key++} className={cn("pt-1", sizes[level])}>
          {inline(text)}
        </Tag>,
      );
      i++;
      continue;
    }

    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        buf.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        <blockquote
          key={key++}
          className="border-l-2 border-border-strong pl-4 text-muted-foreground"
        >
          {inline(buf.join(" "))}
        </blockquote>,
      );
      continue;
    }

    if (line.trimStart().startsWith("|") && (lines[i + 1] ?? "").includes("---")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trimStart().startsWith("|")) {
        const cells = (lines[i] ?? "")
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={key++} className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr>
                {head?.map((c, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-medium">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-t border-border">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-3 py-2 tnum">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^\s*[-*]\s+\[[ x]\]\s+/.test(line)) {
      const items: { text: string; done: boolean }[] = [];
      while (i < lines.length && /^\s*[-*]\s+\[[ x]\]\s+/.test(lines[i] ?? "")) {
        const m = /^\s*[-*]\s+\[([ x])\]\s+(.*)$/.exec(lines[i] ?? "");
        items.push({ done: m?.[1] === "x", text: m?.[2] ?? "" });
        i++;
      }
      out.push(
        <ul key={key++} className="space-y-1.5">
          {items.map((it, idx) => (
            <li key={idx} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "mt-[3px] grid size-[17px] shrink-0 place-items-center rounded-[5px] border text-[11px]",
                  it.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-strong",
                )}
              >
                {it.done ? "✓" : ""}
              </span>
              <span className={cn(it.done && "text-muted-foreground line-through")}>
                {inline(it.text)}
              </span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++} className="ml-1 space-y-1.5">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-2.5">
              <span
                aria-hidden
                className="mt-[9px] size-1 shrink-0 rounded-full bg-border-strong"
              />
              <span>{inline(it)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(
        <ol key={key++} className="ml-1 space-y-1.5">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-2.5">
              <span className="tnum w-4 shrink-0 text-muted-foreground">{idx + 1}.</span>
              <span>{inline(it)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    const buf: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !/^(#{1,4}\s|>|```|\s*[-*]\s|\s*\d+\.\s|\|)/.test(lines[i] ?? "")
    ) {
      buf.push(lines[i] ?? "");
      i++;
    }
    out.push(<p key={key++}>{inline(buf.join(" "))}</p>);
  }

  return out;
}

function inline(text: string): ReactNode {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return tokens.map((tok, i) => {
    if (/^\*\*[^*]+\*\*$/.test(tok))
      return (
        <strong key={i} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>
      );
    if (/^\*[^*]+\*$/.test(tok)) return <em key={i}>{tok.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(tok))
      return (
        <code key={i} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.86em]">
          {tok.slice(1, -1)}
        </code>
      );
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
    if (link)
      return (
        <a key={i} href={link[2]} className="text-primary underline underline-offset-2">
          {link[1]}
        </a>
      );
    return <Fragment key={i}>{tok}</Fragment>;
  });
}

export function plainPreview(md: string, len = 120) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`|_-]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, len);
}
