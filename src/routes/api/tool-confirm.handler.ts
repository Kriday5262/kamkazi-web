/**
 * Stage 3 — confirmed tool execution (POST /api/tool-confirm).
 *
 * The chat stream never executes write tools; the UI shows a confirmation
 * card and POSTs the approved tool call here. Read-only tools run silently
 * inside the chat stream itself.
 */
import { sessionFromRequest } from "@/server/session.util";
import { executeTool } from "@/server/ai.server";

export async function toolConfirmHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const body = (await request.json().catch(() => null)) as {
    tool?: string;
    args?: Record<string, unknown>;
  } | null;
  const tool = body?.tool ?? "";
  if (!tool) {
    return new Response(JSON.stringify({ error: "tool required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const result = await executeTool(session.uid, tool, body?.args ?? {});
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
}
