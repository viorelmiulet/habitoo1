import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const UNSUBSCRIBE_TOKEN = /^[A-Za-z0-9_-]{64}$/;

/** Anonymous client: only the two security-definer unsubscribe RPCs are callable. */
export function unsubscribeClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Configurația publică lipsește.");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
}

export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export type UnsubscribeResult = "ok" | "invalid" | "rate_limited";

export async function runUnsubscribe(token: string, ip: string, channel: "page" | "one_click"): Promise<UnsubscribeResult> {
  if (!UNSUBSCRIBE_TOKEN.test(token)) return "invalid";
  const { data, error } = await unsubscribeClient().rpc("outreach_unsubscribe", { _token: token, _ip: ip, _channel: channel });
  if (error) throw new Error("Dezabonarea nu a putut fi procesată.");
  return data === "ok" || data === "rate_limited" ? data : "invalid";
}
