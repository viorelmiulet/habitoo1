import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const input = z.object({ token: z.string().max(200) });
export type UnsubscribePreview = { status: "ok"; maskedEmail: string } | { status: "invalid" | "rate_limited" };

export const getUnsubscribePreview = createServerFn({ method: "GET" }).inputValidator((v: unknown) => input.parse(v)).handler(async ({ data }): Promise<UnsubscribePreview> => {
  const { unsubscribeClient, clientIp, UNSUBSCRIBE_TOKEN } = await import("./outreach-unsubscribe.server");
  if (!UNSUBSCRIBE_TOKEN.test(data.token)) return { status: "invalid" };
  const { data: res, error } = await unsubscribeClient().rpc("outreach_unsubscribe_preview", { _token: data.token, _ip: clientIp(getRequest().headers) });
  const r = res as { status?: string; masked_email?: string } | null;
  if (error || !r) return { status: "invalid" };
  if (r.status === "ok" && r.masked_email) return { status: "ok", maskedEmail: r.masked_email };
  return { status: r.status === "rate_limited" ? "rate_limited" : "invalid" };
});

export const confirmUnsubscribe = createServerFn({ method: "POST" }).inputValidator((v: unknown) => input.parse(v)).handler(async ({ data }) => {
  const { runUnsubscribe, clientIp } = await import("./outreach-unsubscribe.server");
  return { status: await runUnsubscribe(data.token, clientIp(getRequest().headers), "page") };
});
