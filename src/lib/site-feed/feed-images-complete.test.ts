import { describe, expect, it } from "vitest";
import { readFeedImages } from "./complete-read.server";
import { feedUrlsForRequest } from "./config";
import { offerUrl } from "./mapper";

type Row = { id: string; property_id: string; organization_id: string; include_in_publish: boolean; is_confidential: boolean };

/** Fals PostgREST: întoarce maximum 1.000 de rânduri per cerere, ca serverul real. */
function fakeDb(rows: Row[]) {
  let requests = 0;
  const db = {
    from: () => {
      const filters: Array<(r: Row) => boolean> = [];
      let range: [number, number] = [0, 999];
      const q: any = {
        select: () => q,
        eq: (k: keyof Row, v: unknown) => (filters.push((r) => r[k] === v), q),
        in: (k: keyof Row, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), q),
        order: () => q,
        range: (a: number, b: number) => ((range = [a, b]), q),
        then: (res: (v: unknown) => void) => {
          requests++;
          const all = rows.filter((r) => filters.every((f) => f(r))).sort((a, b) => a.id.localeCompare(b.id));
          const size = Math.min(range[1] - range[0] + 1, 1000);
          res({ data: all.slice(range[0], range[0] + size), error: null });
        },
      };
      return q;
    },
  };
  return { db, requests: () => requests };
}

describe("imaginile din feed nu se pierd peste 1.000 de rânduri", () => {
  const org = "org-1";
  const ids = Array.from({ length: 139 }, (_, i) => `p-${String(i).padStart(3, "0")}`);
  const rows: Row[] = ids.flatMap((pid) =>
    Array.from({ length: 10 }, (_, j) => ({ id: `${pid}-img-${j}`, property_id: pid, organization_id: org, include_in_publish: true, is_confidential: false })),
  );
  rows.push({ id: "z-hidden", property_id: ids[0]!, organization_id: org, include_in_publish: false, is_confidential: false });
  rows.push({ id: "z-conf", property_id: ids[0]!, organization_id: org, include_in_publish: true, is_confidential: true });
  rows.push({ id: "z-other", property_id: ids[0]!, organization_id: "org-2", include_in_publish: true, is_confidential: false });

  it("o agenție cu 1.390 de imagini publicabile le primește pe toate", async () => {
    const { db } = fakeDb(rows);
    const { data } = await readFeedImages<Row>(db, org, ids);
    expect(data).toHaveLength(1390);
    expect(new Set(data.map((r) => r.id)).size).toBe(1390);
    expect(data.filter((r) => r.property_id === ids[138])).toHaveLength(10);
  });

  it("fără filtrul de publicare include și imaginile nepublicabile ale agenției", async () => {
    const { db } = fakeDb(rows);
    const { data } = await readFeedImages<Row>(db, org, ids, { publishableOnly: false });
    expect(data).toHaveLength(1392);
  });
});

describe("url-ul ofertei din feed", () => {
  it("începe cu https://www.habitoo.ro/ pe hosturile de producție", () => {
    for (const host of ["https://crm.habitoo.ro/api/public/portal/v1/properties", "https://www.habitoo.ro/api/public/sites/v1/properties"]) {
      const { publicSiteUrl } = feedUrlsForRequest(host);
      const url = offerUrl(publicSiteUrl, "id-1", "apartament-2-camere-hb-1438");
      expect(url.startsWith("https://www.habitoo.ro/")).toBe(true);
      expect(url).toBe("https://www.habitoo.ro/oferta/apartament-2-camere-hb-1438");
    }
  });
});
