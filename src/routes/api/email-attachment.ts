/**
 * GET /api/email-attachment?accountId=<id>&id=<msgId>&attId=<attachmentId>&name=<filename>
 * Read-only attachment download from Gmail. Streams the decoded bytes back as
 * an attachment. Route-level server handler; logic in ./email-attachment.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { emailAttachmentHandler } from "./email-attachment.handler";

export const Route = createFileRoute("/api/email-attachment")({
  server: {
    handlers: {
      GET: async ({ request }) => emailAttachmentHandler(request),
    },
  },
});