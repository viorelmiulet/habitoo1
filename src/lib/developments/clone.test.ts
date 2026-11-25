import { describe, it, expect, vi } from "vitest";
import { clonePortalIds, cloneConfirmText } from "./clone";
import { cloneToDevelopmentCore } from "./clone.functions";
import { allPortals, getPortalDefinition } from "@/lib/portals/registry";
import { isFeedPullPortal } from "@/lib/portals/registry";
import { applyDevelopmentCopyStoria } from "@/lib/portals/storia/development.server";

describe("portalurile copiei", () => {
  it("Storia (dezvoltator) și feed-urile activate, determinate din registry", () => {
    const defs = allPortals();
    const feed = defs.find((d) => d.status === "available" && isFeedPullPortal(d));
    const push = defs.find((d) => d.status === "available" && d.id !== "storia" && d.capabilities.includes("publish_listing") && !d.capabilities.includes("feed_pull") && !d.dynamic_feed && !d.public_feed_path_template);
    if(!feed||!push)throw new Error('Missing portal fixtures');
    expect(feed && push && getPortalDefinition("storia")).toBeTruthy();
    const out = clonePortalIds(new Set(["storia", feed.id, push.id]), defs);
    expect(out).toContain("storia");
    expect(out).toContain(feed.id);
    expect(out).not.toContain(push.id);
    expect(clonePortalIds(new Set([push.id]), defs)).toEqual([]);
  });
  it("textul de confirmare", () => {
    expect(cloneConfirmText(3)).toBe("Se vor crea 3 copii noi în ansamblu; anunțurile originale rămân neschimbate. Copiile preiau locația ansamblului.");
  });
});

describe("cloneToDevelopmentCore", () => {
  it("copiază fișierele, bifează portalurile și raportează slotul lipsă", async () => {
    const rpc = vi.fn(async () => ({ error: null, data: { copies: [{ original_id: "o", original_reference: "HB-1", copy_id: "c", copy_reference: "HB-2" }], skipped: [], files: [{ from: "org/o/a.jpg", to: "org/c/a.jpg", copy_id: "c" }] } }));
    const copyFile = vi.fn(async () => true);
    const applySelection = vi.fn(async () => [{ portalId: "storia", ok: true, message: null }, { portalId: "clickimob", ok: false, message: "Agentul nu are locuri libere" }]);
    const out = await cloneToDevelopmentCore({ rpc }, { developmentId: "d", propertyIds: ["o"] }, {
      copyFile, removeImage: vi.fn(), activatedPortals: async () => new Set(["storia"]), organizationOf: async () => "org", applySelection,
      developmentPortals:async()=>['storia'],
    });
    expect(rpc).toHaveBeenCalledWith("clone_properties_to_development", { _development_id: "d", _property_ids: ["o"] });
    expect(copyFile).toHaveBeenCalledWith("org/o/a.jpg", "org/c/a.jpg");
    expect(applySelection).toHaveBeenCalledWith("org", "c", ["storia"]);
    expect(out.portalSkipped).toEqual([{ copy_id: "c", portal: "clickimob", reason: "Agentul nu are locuri libere" }]);
    expect(out.copies[0]?.copy_reference).toBe("HB-2");
  });
});

describe("preselecția pentru copia unui anunț publicat", () => {
  it("bifează Storia și feed-urile fără eroarea „nu este publicabilă”", async () => {
    const feeds = allPortals().filter((d) => d.status === "available" && d.id !== "storia" && isFeedPullPortal(d)).map((d) => d.id).slice(0, 2);
    const activated = new Set(["storia", ...feeds]);
    const expected = clonePortalIds(activated, allPortals());
    expect(expected).toContain("storia");
    for (const f of feeds) expect(expected).toContain(f);
    const copyState = { publish_status: "published" };
    const rpc = vi.fn(async () => ({ error: null, data: { copies: [{ original_id: "o", original_reference: "HB-1", copy_id: "c", copy_reference: "HB-2" }], skipped: [], files: [] } }));
    const applySelection = vi.fn(async (_org: string, _id: string, ids: string[]) => ids.map((portalId) => copyState.publish_status === "published" ? { portalId, ok: true, message: null } : { portalId, ok: false, message: "Oferta nu este publicabilă" }));
    const out = await cloneToDevelopmentCore({ rpc }, { developmentId: "d", propertyIds: ["o"] }, {
      copyFile: vi.fn(async () => true), removeImage: vi.fn(), activatedPortals: async () => activated, organizationOf: async () => "org", applySelection,
      developmentPortals:async()=>expected,
    });
    expect(applySelection).toHaveBeenCalledWith("org", "c", expected);
    expect(out.portalSkipped).toEqual([]);
    expect(JSON.stringify(out)).not.toMatch(/nu este publicabil/);
  });
});

describe("Storia pe copie", () => {
  it("bifarea nu creează job în contul de agenție, doar intenția și unitatea", async () => {
    const calls: string[] = [];
    const chain = (table: string): Record<string, unknown> => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is"]) q[m] = () => q;
      q.upsert = () => { calls.push(`upsert:${table}`); return Promise.resolve({ error: null }); };
      q.maybeSingle = () => Promise.resolve({ data: table === "properties" ? { development_id: "d" } : null });
      q.then = (r: (v: unknown) => unknown) => r({ data: [] });
      return q;
    };
    const db = { from: (t: string) => { calls.push(`from:${t}`); return chain(t); }, rpc: vi.fn() };
    const res = await applyDevelopmentCopyStoria(db as never, { organizationId: "org", propertyId: "c", enabled: true, actorId: "u" });
    expect(res.ok).toBe(true);
    expect(calls).not.toContain("from:portal_publish_jobs");
    expect(calls).not.toContain("from:portal_listings");
    expect(calls).toContain("upsert:portal_publications");
  });
});
