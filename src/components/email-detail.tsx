/**
 * EmailDetail — read-only email detail panel.
 *
 * Two modes (Phase 3):
 *  - inline (desktop right pane of the Email section): `inlineActions` slot
 *    renders below the body (Add-as-Task / Undo / Close).
 *  - sheet (mobile, radix bottom sheet): `mobileOnly` renders as a Sheet.
 *
 * Body is fetched lazily from GET /api/email-read (read-only; never marks
 * the email as read) and rendered as sanitized HTML or plain text.
 * Attachments are listed with download-only links (read-only).
 */
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { InboxEmail } from "@/routes/api/inbox-overview.handler";

interface EmailBody {
  id: string;
  from: string;
  subject: string;
  date: string;
  account: string;
  unread: boolean;
  body: string;
  html?: string;
  attachments?: { filename: string; mimeType: string; size: number; attachmentId: string }[];
}

async function fetchEmailBody(accountId: string, id: string): Promise<EmailBody> {
  const res = await fetch(
    `/api/email-read?accountId=${encodeURIComponent(accountId)}&id=${encodeURIComponent(id)}`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    email?: EmailBody & { account?: string };
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "Could not load this email");
  if (!data.email) throw new Error("Could not load this email");
  return data.email;
}

/** Defensive: strip any residual HTML tags from the body text. */
function stripResidualHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmailDetail({
  email,
  accountId,
  open,
  onOpenChange,
  onAddAsTask,
  taskAdded,
  taskSummarizing,
  inlineActions,
  mobileOnly,
}: {
  email: InboxEmail | null;
  /** google_accounts.id for the account the message belongs to. */
  accountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddAsTask: (e: InboxEmail) => void;
  taskAdded: boolean;
  taskSummarizing?: boolean | undefined;
  /** Desktop inline pane: actions rendered inline instead of a Sheet. */
  inlineActions?: React.ReactNode;
  /** Mobile mode: render as a radix Sheet instead of an inline panel. */
  mobileOnly?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  const bodyQuery = useQuery({
    queryKey: ["email-read", accountId, email?.id],
    queryFn: () => fetchEmailBody(accountId!, email!.id),
    enabled: open && !!email && !!accountId,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (bodyQuery.error) setError((bodyQuery.error as Error).message);
    else setError(null);
  }, [bodyQuery.error]);

  if (!email) return null;

  const html = bodyQuery.data?.html ?? null;
  const body = bodyQuery.data ? stripResidualHtml(bodyQuery.data.body) : null;
  const attachments = bodyQuery.data?.attachments ?? [];

  const content = (
    <>
      <div className="pr-8 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12px] font-medium text-muted-foreground">
            {email.from || "(unknown)"}
          </span>
          <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {email.account}
          </span>
        </div>
        <div className={cn("text-[15px] font-semibold leading-snug", mobileOnly && "mt-1")}
          {...(mobileOnly ? ({ title: email.subject || "(no subject)" } as object) : {})}>
          {email.subject || "(no subject)"}
        </div>
        <div className="text-[12px] text-muted-foreground">
          <span suppressHydrationWarning>
            {email.date ? new Date(email.date).toLocaleString() : ""}
          </span>
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {bodyQuery.isPending ? (
          <div className="space-y-2" aria-label="Loading email body">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-[92%]" />
            <Skeleton className="h-3.5 w-[96%]" />
            <Skeleton className="h-3.5 w-[70%]" />
            <Skeleton className="h-3.5 w-[85%]" />
            <Skeleton className="h-3.5 w-[40%]" />
          </div>
        ) : error || body === null ? (
          <p className="text-[13px] text-destructive">{error ?? "Could not load this email."}</p>
        ) : html ? (
          <div
            className="email-rich break-words text-[13.5px] leading-relaxed text-foreground [&_*]:border-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-l [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-[15px] [&_h3]:font-semibold [&_h4]:text-[14px] [&_h4]:font-semibold [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-[12.5px] [&_strong]:font-semibold [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc"
            // Server-sanitized via a strict allowlist sanitizer in gmail.server.ts.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed text-foreground">
            {body || "(empty message)"}
          </pre>
        )}

        {attachments.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
              <Paperclip className="size-3.5" aria-hidden />
              {attachments.length} attachment{attachments.length > 1 ? "s" : ""}
            </p>
            <ul className="space-y-1.5">
              {attachments.map((a) => {
                const dl = `/api/email-attachment?accountId=${encodeURIComponent(accountId ?? "")}&id=${encodeURIComponent(email.id)}&attId=${encodeURIComponent(a.attachmentId)}&name=${encodeURIComponent(a.filename)}&mime=${encodeURIComponent(a.mimeType)}`;
                return (
                  <li key={a.filename}>
                    <a
                      href={dl}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12.5px] transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 truncate">{a.filename}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatBytes(a.size)}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      {mobileOnly ? (
        <div className="relative z-10 mt-4 shrink-0 border-t border-border bg-background pt-3">
          <button
            type="button"
            disabled={taskAdded || taskSummarizing}
            onClick={() => {
              onAddAsTask(email);
              onOpenChange(false);
            }}
            className={cn(
              "tap w-full rounded-full border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              taskAdded
                ? "border-accent-green/40 bg-accent-green/15 text-accent-green"
                : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            {taskAdded ? "✓ Added · Undo available on the row" : taskSummarizing ? "Summarizing…" : "Add as Task"}
          </button>
        </div>
      ) : (
        <div className="mt-4 shrink-0 space-y-1.5 border-t border-border pt-3">
          <button
            type="button"
            disabled={taskAdded || taskSummarizing}
            onClick={() => onAddAsTask(email)}
            className={cn(
              "tap w-full rounded-full border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              taskAdded
                ? "border-accent-green/40 bg-accent-green/15 text-accent-green"
                : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            {taskAdded ? "✓ Added" : taskSummarizing ? "Summarizing…" : "Add as Task"}
          </button>
          {inlineActions}
        </div>
      )}
    </>
  );

  if (mobileOnly) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={cn(
            "flex w-full flex-col gap-0 overflow-hidden p-5 sm:max-w-md",
            "max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-auto max-md:max-h-[85vh] max-md:w-full max-md:rounded-t-2xl max-md:border-t",
          )}
        >
          <SheetHeader className="hidden">
            <SheetTitle>{email.subject || "(no subject)"}</SheetTitle>
            <SheetDescription>{email.from}</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="flex h-full flex-col gap-0 overflow-y-auto p-5">
      {content}
    </div>
  );
}