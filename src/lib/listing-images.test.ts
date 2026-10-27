// Coada pozelor din „Anunțuri particulari”: salvare imediată, înlocuire pe poziție, eșec care păstrează originalul.
import { afterEach, describe, expect, it, vi } from "vitest";
import { isMirroredUrl, mergeIncomingImages, planImageJobs } from "./listing-images";

const db = vi.hoisted(() => ({
  listings: [] as { id: string; source: string; external_id: string; url: string | null; images: string[] | null }[],
  jobs: [] as { id: string; listing_id: string; source_url: string; position: number; status: string; attempts: number; stored_url: string | null; last_error: string | null }[],
  uploads: [] as string[],
}));

function fakeAdmin() {
  const from = (table: string) => {
    const filters: [string, string, unknown][] = [];
    let mode: "select" | "update" = "select";
    let patch: Record<string, unknown> = {};
    const rowsOf = () => (table === "listings" ? db.listings : db.jobs) as Record<string, unknown>[];
    const match = (r: Record<string, unknown>) => filters.every(([op, k, v]) => (op === "in" ? (v as unknown[]).includes(r[k]) : r[k] === v));
    const q: Record<string, unknown> = {
      select: () => q,
      in: (k: string, v: unknown[]) => { filters.push(["in", k, v]); return q; },
      eq: (k: string, v: unknown) => { filters.push(["eq", k, v]); if (mode === "update") { rowsOf().filter(match).forEach((r) => Object.assign(r, patch)); } return q; },
      maybeSingle: async () => ({ data: rowsOf().find(match) ?? null, error: null }),
      update: (p: Record<string, unknown>) => { mode = "update"; patch = p; return q; },
      upsert: (input: Record<string, unknown>[], opts: { onConflict: string }) => {
        if (table === "listings") {
          const saved = input.map((r) => {
            let row = db.listings.find((l) => l.source === r.source && l.external_id === r.external_id);
            if (!row) { row = { id: crypto.randomUUID(), source: String(r.source), external_id: String(r.external_id), url: null, images: null }; db.listings.push(row); }
            Object.assign(row, r);
            return { id: row.id, images: row.images };
          });
          return { select: async () => ({ data: saved, error: null }) };
        }
        expect(opts.onConflict).toBe("listing_id,source_url");
        for (const j of input) {
          if (db.jobs.some((x) => x.listing_id === j.listing_id && x.source_url === j.source_url)) continue;
          db.jobs.push({ id: crypto.randomUUID(), status: "pending", attempts: 0, stored_url: null, last_error: null, ...(j as { listing_id: string; source_url: string; position: number }) });
        }
        return Promise.resolve({ error: null });
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rowsOf().filter(match), error: null }).then(resolve),
    };
    return q;
  };
  return {
    from,
    storage: { from: () => ({ upload: async (path: string) => { db.uploads.push(path); return { error: null }; } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "claim_listing_image_jobs") {
        const claimed = db.jobs.filter((j) => j.status === "pending" && j.attempts < 2).slice(0, Number(args._batch_size));
        claimed.forEach((j) => { j.attempts += 1; });
        return { data: claimed.map((j) => ({ ...j })), error: null };
      }
      if (fn === "listing_image_replace") {
        const job = db.jobs.find((j) => j.id === args._job_id)!;
        const listing = db.listings.find((l) => l.id === job.listing_id)!;
        listing.images = (listing.images ?? []).map((u) => (u === job.source_url ? String(args._stored_url) : u));
        Object.assign(job, { status: "done", stored_url: args._stored_url });
        return { data: true, error: null };
      }
      throw new Error(fn);
    },
  };
}

vi.mock("@/integrations/supabase/client.server", () => ({ get supabaseAdmin() { return fakeAdmin(); } }));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); db.listings.length = 0; db.jobs.length = 0; db.uploads.length = 0; });

async function post(body: unknown) {
  const { Route } = await import("@/routes/api/public/listings/upsert");
  const handler = (Route.options as unknown as { server: { handlers: { POST: (a: { request: Request }) => Promise<Response> } } }).server.handlers.POST;
  return handler({ request: new Request("https://crm.test/api/public/listings/upsert", { method: "POST", headers: { "x-scraper-secret": "fixture", "content-type": "application/json" }, body: JSON.stringify(body) }) });
}

describe("endpointul nu mai așteaptă pozele", () => {
  it("salvează un lot de 50 imediat, cu URL-urile originale, și pune pozele în coadă", async () => {
    vi.stubEnv("HBSYNC_SECRET", "fixture");
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {})); // o poză care nu răspunde niciodată
    vi.stubGlobal("fetch", fetchSpy);
    const listings = Array.from({ length: 50 }, (_, i) => ({
      source: "homezz", external_id: `hz-${i}`, title: `Anunț ${i}`,
      images: Array.from({ length: 12 }, (_, k) => `https://img.example.test/${i}/${k}.jpg`),
    }));
    const started = Date.now();
    const res = await post({ listings });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await res.json()).toMatchObject({ success: true, inserted: 50, images_queued: 600 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.listings).toHaveLength(50);
    expect(db.listings[0]!.images![3]).toBe("https://img.example.test/0/3.jpg");

    // Retrimis cu aceleași poze: fără dubluri în coadă.
    await post({ listings });
    expect(db.jobs).toHaveLength(600);
  });
});

describe("worker-ul cozii", () => {
  it("înlocuiește URL-ul pe aceeași poziție; eșecul păstrează originalul după 2 încercări", async () => {
    vi.stubEnv("HBSYNC_SECRET", "fixture");
    vi.stubGlobal("fetch", vi.fn());
    await post({ listings: [{ source: "imoradar", external_id: "ir-1", images: ["https://a.test/0.jpg", "https://a.test/broken.jpg", "https://a.test/2.jpg"] }] });
    const fetchImpl = vi.fn(async (url: string) => url.includes("broken")
      ? new Response("nu", { status: 404 })
      : new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
    const { runListingImages } = await import("./listing-images.server");
    const totals = await runListingImages({ admin: fakeAdmin(), fetchImpl, baseUrl: "https://crm.test" });
    expect(totals).toEqual({ done: 2, pending: 0, failed: 1 });
    const images = db.listings[0]!.images!;
    expect(isMirroredUrl(images[0]!)).toBe(true);
    expect(images[0]).toMatch(/^https:\/\/crm\.test\/api\/public\/listings\/media\/.+\?p=ir-1%2F0-/);
    expect(images[1]).toBe("https://a.test/broken.jpg");
    expect(isMirroredUrl(images[2]!)).toBe(true);
    expect(db.jobs.find((j) => j.source_url.includes("broken"))).toMatchObject({ status: "failed", attempts: 2 });

    // Retrimis cu aceleași originale: pozele copiate se păstrează, nimic nou în coadă.
    await post({ listings: [{ source: "imoradar", external_id: "ir-1", images: ["https://a.test/0.jpg", "https://a.test/broken.jpg", "https://a.test/2.jpg"] }] });
    expect(db.listings[0]!.images).toEqual(images);
    expect(db.jobs).toHaveLength(3);
  });
});

describe("reguli pure", () => {
  it("păstrează galeria copiată anterior cu același număr de poze", () => {
    const old = ["https://crm.test/api/public/listings/media/0b6c7f2e-1111-4a3b-8c9d-123456789abc?p=x%2F0-a.jpg"];
    expect(mergeIncomingImages(["https://a.test/0.jpg"], old, new Map())).toEqual(old);
  });
  it("nu pune în coadă URL-urile deja copiate", () => {
    expect(planImageJobs("l", ["https://crm.test/api/public/listings/media/0b6c7f2e-1111-4a3b-8c9d-123456789abc?p=x", "https://a.test/1.jpg"]))
      .toEqual([{ listing_id: "l", source_url: "https://a.test/1.jpg", position: 1 }]);
  });
});
