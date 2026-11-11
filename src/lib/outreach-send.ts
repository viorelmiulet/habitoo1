import { renderCampaign, type MergeRecipient, type RenderedMessage } from "./outreach-message";

/** Bulk outreach worker logic (deps injected; the DB RPCs own claiming, limits and status). */
export const OUTREACH_CHUNK = 10;
export type ClaimResult =
  | { state: "claimed"; recipient: MergeRecipient & { id: string; email: string }; campaign: { subject: string; body_text: string; sender_name: string; footer_text: string } }
  | { state: "wait"; wait_seconds: number }
  | { state: "not_sending" | "completed" | "outside_window" | "daily_limit" | "idle" };
export type SendDeps = {
  dueCampaigns: () => Promise<string[]>;
  claim: (campaignId: string) => Promise<ClaimResult>;
  recheck: (recipientId: string) => Promise<boolean>;
  send: (msg: RenderedMessage & { to: string }) => Promise<{ ok: true } | { ok: false; error: string; kind?: "auth" | "quota" }>;
  result: (recipientId: string, campaignId: string, ok: boolean, error: string | null, fatal: boolean) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

/** One run: at most OUTREACH_CHUNK recipients across due campaigns, within the time budget. */
export async function runOutreachSend(deps: SendDeps, opts: { budgetMs?: number } = {}): Promise<{ sent: number; failed: number; skipped: number }> {
  const deadline = deps.now() + (opts.budgetMs ?? 40_000);
  const out = { sent: 0, failed: 0, skipped: 0 };
  let processed = 0;
  for (const campaignId of await deps.dueCampaigns()) {
    while (processed < OUTREACH_CHUNK && deps.now() < deadline) {
      const c = await deps.claim(campaignId);
      if (c.state === "wait") {
        const ms = c.wait_seconds * 1000;
        if (deps.now() + ms >= deadline) break;
        await deps.sleep(ms);
        continue;
      }
      if (c.state !== "claimed") break;
      processed++;
      if (!(await deps.recheck(c.recipient.id))) { out.skipped++; continue; }
      let r: Awaited<ReturnType<SendDeps["send"]>>;
      try { r = await deps.send({ ...renderCampaign(c.campaign, c.recipient), to: c.recipient.email }); }
      catch (e) { r = { ok: false, error: e instanceof Error ? e.message : "Trimiterea a eșuat." }; }
      if (r.ok) out.sent++; else out.failed++;
      const status = await deps.result(c.recipient.id, campaignId, r.ok, r.ok ? null : r.error, !r.ok && Boolean(r.kind));
      if (status !== "sending") break;
    }
    if (processed >= OUTREACH_CHUNK) break;
  }
  return out;
}

/** Estimated number of sending days for the confirmation dialog. */
export function estimateDays(pending: number, dailyLimit: number, windowStart: string, windowEnd: string, delaySeconds: number): number {
  const [sh, sm] = windowStart.split(":").map(Number), [eh, em] = windowEnd.split(":").map(Number);
  const perWindow = Math.max(1, Math.floor(((eh * 60 + em) - (sh * 60 + sm)) * 60 / Math.max(delaySeconds, 20)));
  return pending <= 0 ? 0 : Math.ceil(pending / Math.min(dailyLimit, perWindow));
}
