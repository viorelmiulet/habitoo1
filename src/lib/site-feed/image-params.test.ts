import { describe, expect, it } from "vitest";
import { parseImageParams, storageTransform } from "./image-params";
import { indexLogoUrl } from "@/lib/portals/clickimob/index-feed.server";

const p = (q: string) => parseImageParams(new URLSearchParams(q));

describe("parametri imagini", () => {
  it("fără parametri → comportament neschimbat", () => expect(p("")).toBeNull());
  it("fit implicit contain", () => expect(p("w=400")).toEqual({ width: 400, resize: "contain" }));
  it("cover la exact w×h", () => expect(p("w=400&h=300&fit=cover")).toEqual({ width: 400, height: 300, resize: "cover" }));
  it("în afara intervalului sau nenumerici → ignorați", () => {
    expect(p("w=49&h=1921")).toBeNull();
    expect(p("w=abc&h=12.5")).toBeNull();
    expect(p("w=-100&h=300")).toEqual({ height: 300, resize: "contain" });
    expect(p("w=50&h=1920&fit=altceva")).toEqual({ width: 50, height: 1920, resize: "contain" });
  });
  it("calitate 75", () => expect(storageTransform({ width: 100, resize: "cover" })).toEqual({ width: 100, resize: "cover", quality: 75 }));
});

describe("logo_url permanent în index", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  it("logo încărcat → link permanent", () =>
    expect(indexLogoUrl({ id, logo_path: "org/logo.png" })).toMatch(new RegExp(`^https://[^/]+/api/public/sites/v1/media/agency/${id}$`)));
  it("fără logo → null", () => expect(indexLogoUrl({ id, logo_path: null, logo_url: "http://x.ro/l.png" })).toBeNull());
});
