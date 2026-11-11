/**
 * Bulk outreach worker. Managed HTTP schedule every minute; exits after one query
 * when no campaign is in status "sending". Window, daily limit and claiming live in the DB.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/outreach-send")({
  server: { handlers: { POST: async ({ request }) => {
    const authFailure = await authenticateCronRequest(request);
    if (authFailure) return authFailure;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { runOutreachSend } = await import("@/lib/outreach-send");
    const r = await runOutreachSend({
      dueCampaigns: async () => { const { data, error } = await db.rpc("outreach_send_due"); if (error) throw new Error(error.message); return (data ?? []) as unknown as string[]; },
      claim: async (id) => { const { data, error } = await db.rpc("outreach_send_claim", { _campaign_id: id }); if (error) throw new Error(error.message); return data as never; },
      recheck: async (id) => { const { data, error } = await db.rpc("outreach_send_recheck", { _recipient_id: id }); return !error && data === true; },
      // Platform Gmail (contact@habitoo.ro) only — same transport as the test send.
      send: async (msg) => { const { sendWorkspaceGmail } = await import("@/lib/gmail/gmail-workspace.server"); return sendWorkspaceGmail(msg); },
      result: async (rid, cid, ok, err, fatal) => { const { data, error } = await db.rpc("outreach_send_result", { _recipient_id: rid, _campaign_id: cid, _ok: ok, _error: err ?? "", _fatal: fatal }); if (error) throw new Error(error.message); return String(data); },
      sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
      now: () => Date.now(),
    });
    return Response.json({ ok: true, ...r });
  } } },
});
