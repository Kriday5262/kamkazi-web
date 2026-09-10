/**
 * EmailDetail — read-only email detail panel.
 *
 * Desktop (md+): right-side sheet. Mobile: bottom sheet. Body is fetched
 * lazily from GET /api/email-read (read-only; never marks the email as read)
 * and rendered as plain text (pre-wrap). "Add as Task" is available here too.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  /** Sanitized rich-HTML body (server-side allowlist sanitizer). */
  html?: string;
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

export function EmailDetail({
  email,
  accountId,
  open,
  onOpenChange,
  onAddAsTask,
  taskAdded,
  taskSummarizing,
}: {
  email: InboxEmail | null;
  /** google_accounts.id for the account the message belongs to. */
  accountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddAsTask: (e: InboxEmail) => void;
  taskAdded: boolean;
  taskSummarizing?: boolean;
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          // Flex column: scrollable body area + pinned footer so the
          // "Add as Task" button is always visible and tappable.
          "flex w-full flex-col gap-0 overflow-hidden p-5 sm:max-w-md",
          "max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-auto max-md:max-h-[85vh] max-md:w-full max-md:rounded-t-2xl max-md:border-t",
        )}
      >
        <SheetHeader className="pr-8 text-left">
          <div className="flex items-center gap-2">
            {email.unread ? (
              <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
            ) : null}
            <span className="truncate text-[12px] font-medium text-muted-foreground">
              {email.from || "(unknown)"}
            </span>
            <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {email.account}
            </span>
          </div>
          <SheetTitle className="text-[15px] leading-snug">
            {email.subject || "(no subject)"}
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            <span suppressHydrationWarning>
              {email.date ? new Date(email.date).toLocaleString() : ""}
            </span>
          </SheetDescription>
        </SheetHeader>

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
              className="email-rich break-words text-[13.5px] leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-[15px] [&_h3]:font-semibold [&_h4]:text-[14px] [&_h4]:font-semibold [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-[12.5px] [&_strong]:font-semibold [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc"
              // Server-sanitized via a strict allowlist sanitizer in gmail.server.ts.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed text-foreground">
              {body || "(empty message)"}
            </pre>
          )}
        </div>

        <div className="relative z-10 mt-4 shrink-0 border-t border-border bg-background pt-3">
          <button
            type="button"
            disabled={taskAdded || taskSummarizing}
            onClick={() => {
              onAddAsTask(email);
              // Close the panel so the undo toast is visible and tappable.
              onOpenChange(false);
            }}
            className={cn(
              "tap w-full rounded-full border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              taskAdded
                ? "border-accent-green/40 bg-accent-green/15 text-accent-green"
                : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            {taskAdded ? "✓ Added" : taskSummarizing ? "Summarizing…" : "Add as Task"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
