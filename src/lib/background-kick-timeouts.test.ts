import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const tick = vi.fn(async () => [1, 2, 3]);
vi.mock("@/integrations/supabase/cron-auth", () => ({ authenticateCronRequest: async () => null }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: vi.fn() } }));
vi.mock("@/lib/account-deletion.server", () => ({ realDeletionDeps: async () => ({}), runAccountDeletionTick: tick }));

const FUNCS: Record<string, number> = {
  account_deletion_tick: 150000, chat_email_tick: 60000, collector_tick: 60000, development_clone_kick: 150000,
  lacheie_resend_tick: 150000, olx_direct_refresh_tick: 60000, olx_direct_status_tick: 60000, partner_webhook_wake: 60000,
  portal_bulk_tick: 150000, portal_slot_withdraw_tick: 150000, portal_status_withdraw_tick: 150000,
  promotion_withdraw_tick: 150000, property_import_images_tick: 150000, storia_webhook_retry_tick: 60000,
  subscription_cron_tick: 60000, vdi_leads_tick: 60000,
};

describe("cele 16 funcții de pornire", () => {
  const sql = readFileSync("drizzle/migrations/0339_background_kick_timeouts.sql", "utf8");
  const blocks = sql.split(/CREATE OR REPLACE FUNCTION /).slice(1);
  it("fiecare apel net.http_post are timeout_milliseconds ≥ 60000", () => {
    expect(blocks.map((b) => b.match(/public\.(\w+)\(/)?.[1]).sort()).toEqual(Object.keys(FUNCS).sort());
    for (const b of blocks) {
      const name = b.match(/public\.(\w+)\(/)![1]!;
      const calls = b.split(/net\.http_post\s*\(/).length - 1;
      const timeouts = [...b.matchAll(/timeout_milliseconds\s*:=\s*(\d+)/g)].map((m) => Number(m[1]));
      expect(calls).toBeGreaterThan(0);
      expect(timeouts.length, name).toBe(calls);
      for (const t of timeouts) expect(t, name).toBe(FUNCS[name]);
    }
  });
});

describe("rutele lucrărilor din fundal", () => {
  it("toate rutele cron/jobs înregistrează lucrul cu keepAliveUntilSettled", () => {
    for (const dir of ["cron", "jobs"]) {
      for (const f of readdirSync(`src/routes/api/public/${dir}`).filter((n) => n.endsWith(".ts") && !n.includes("test"))) {
        const src = readFileSync(`src/routes/api/public/${dir}/${f}`, "utf8");
        expect(/keepRouteHandlersAlive\(Route\)|keepAliveUntilSettled\(/.test(src), `${dir}/${f}`).toBe(true);
      }
    }
  });

  it("ruta pornește lucrul cu waitUntil și întoarce același răspuns", async () => {
    const { runWithRequestContext } = await import("@/lib/after-response");
    const { Route } = await import("@/routes/api/public/cron/account-deletion");
    const waitUntil = vi.fn();
    const post = (Route.options.server as any).handlers.POST;
    const res: Response = await runWithRequestContext({ waitUntil }, () =>
      post({ request: new Request("http://x/api/public/cron/account-deletion", { method: "POST" }) }),
    );
    expect(tick).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ ok: true, steps: 3 });
  });

  it("fără waitUntil răspunsul rămâne identic", async () => {
    const { Route } = await import("@/routes/api/public/cron/account-deletion");
    const res: Response = await (Route.options.server as any).handlers.POST({ request: new Request("http://x", { method: "POST" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, steps: 3 });
  });
});
