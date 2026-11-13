import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { deletePropertiesCore } from "@/lib/property-delete.functions";
import { bulkDeleteSummary } from "@/components/app/BulkDeletePropertiesDialog";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ORG = "org-1";

function setup(uid: string) {
  const props: Row[] = [
    { id: "p1", organization_id: ORG, assigned_to: "agent-1", deleted_at: null },
    { id: "p2", organization_id: ORG, assigned_to: "agent-1", deleted_at: null },
    { id: "p3", organization_id: ORG, assigned_to: "agent-2", deleted_at: null },
  ];
  const roles: Record<string, string> = { admin: "agency_admin", "agent-1": "agent" };
  const client = {
    rpc: async (_n: string, p?: Row) => {
      const row = props.find((r) => r["id"] === p!["_id"])!;
      if (roles[uid] !== "agency_admin" && row["assigned_to"] !== uid) return { data: null, error: { message: "Nu ai dreptul să ștergi acest anunț." } };
      row["deleted_at"] = "now";
      return { data: ORG, error: null };
    },
  };
  const pubs = [
    { property_id: "p1", portal_key: "imobiliare_ro" },
    { property_id: "p1", portal_key: "storia" },
  ];
  const enqueue = vi.fn(async (_a: unknown, i: { propertyIds: string[]; reason: string }) => ({
    queued: pubs.filter((p) => i.propertyIds.includes(p.property_id)),
    manual: [],
  }));
  return { props, client, enqueue };
}

describe("ștergerea în masă", () => {
  it("3 proprietăți, una pe 2 portaluri → toate șterse, retragerile în coadă într-un singur apel", async () => {
    const { props, client, enqueue } = setup("admin");
    const out = await deletePropertiesCore(client, {} as never, { propertyIds: ["p1", "p2", "p3"], actorId: "admin" }, { enqueue: enqueue as never, logOperation: async () => {} });
    expect(props.every((p) => p["deleted_at"])).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]![1]).toMatchObject({ organizationId: ORG, propertyIds: ["p1", "p2", "p3"], reason: "deleted" });
    expect(out.queued).toBe(2);
    expect(bulkDeleteSummary(out).ok).toBe("3 proprietăți șterse; 2 retrageri de pe portaluri puse în coadă");
  });

  it("o proprietate fără drept → eșec raportat, celelalte se șterg", async () => {
    const { props, client, enqueue } = setup("agent-1");
    const out = await deletePropertiesCore(client, {} as never, { propertyIds: ["p1", "p3", "p2"], actorId: "agent-1" }, { enqueue: enqueue as never, logOperation: async () => {} });
    expect(out.deleted).toEqual(["p1", "p2"]);
    expect(out.failed).toEqual([{ propertyId: "p3", reason: "Nu ai dreptul să ștergi acest anunț." }]);
    expect(props.find((p) => p["id"] === "p3")!["deleted_at"]).toBeNull();
    expect(bulkDeleteSummary(out).failed).toBe("1 nu au putut fi șterse");
  });

  it("bara de selecție afișează „Șterge”, nu „Arhivează”", () => {
    const src = readFileSync("src/routes/_authenticated/app.properties.index.tsx", "utf8");
    const bar = src.slice(src.indexOf("Retrage de pe portaluri…"), src.indexOf("Anulează selecția"));
    expect(bar).toMatch(/Trash2[^\n]*\/> Șterge/);
    expect(bar).not.toContain("Arhivează");
  });
});
