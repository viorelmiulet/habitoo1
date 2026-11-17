import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasPortalLogo } from "@/components/app/PortalLogo";
import { INTEGRATION_PAGES, integrationFeatures, portalsLabel, publicPortalCount, withPublicPortalCount } from "@/lib/portals/integration-pages";
import type { PortalDefinition } from "@/lib/portals/registry";

const counts = (html: string) => [...html.matchAll(/(\d+) de portaluri/g)].map((m) => Number(m[1]));

describe("RD2 — număr de portaluri", () => {
  it("/functionalitati și /integrari afișează același număr de portaluri", async () => {
    const [f, i] = await Promise.all(["/functionalitati", "/integrari"].map((p) => fetch(`http://localhost:8080${p}`).then((r) => r.text())));
    const all = [...counts(f), ...counts(i)];
    expect(counts(f).length).toBeGreaterThan(0);
    expect(counts(i).length).toBeGreaterThan(0);
    expect(new Set(all).size).toBe(1);
    expect(all[0]).toBeGreaterThanOrEqual(publicPortalCount([]));
  });

  it("textele statice sunt recalculate cu portalurile dinamice publice (publicPortalCount)", () => {
    const dynamic = [{ id: "test_feed", dynamic_feed: true, status: "available", show_public: true } as unknown as PortalDefinition];
    const text = `Publici pe ${portalsLabel(publicPortalCount())} imobiliare.`;
    expect(withPublicPortalCount(text, dynamic)).toBe(`Publici pe ${portalsLabel(publicPortalCount(dynamic))} imobiliare.`);
    expect(publicPortalCount(dynamic)).toBe(publicPortalCount() + 1);
  });
});

describe("RD2 — logo-uri în listele de pe /integrari", () => {
  it("randează img pentru portalurile cu logo", async () => {
    const html = await (await fetch("http://localhost:8080/integrari")).text();
    const direct = INTEGRATION_PAGES.filter((p) => p.portalId !== "facebook_catalog" && integrationFeatures(p).direct && hasPortalLogo(p.portalId));
    expect(direct.length).toBeGreaterThan(0);
    for (const p of direct) expect(html).toMatch(new RegExp(`data-logo-plate[^>]*><img[^>]*alt="Logo ${p.name.replace(/[.+]/g, "\\$&")}"`));
  });
});

describe("RD2 — inițiale pe /agentii", () => {
  it("fallback-ul de inițiale folosește culoare închisă pe plăcuța deschisă", () => {
    const route = readFileSync(new URL("./agentii.index.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    expect(route).toMatch(/ds-plate-initials[^"]*"[^>]*aria-hidden>\s*\{partnerInitials/);
    expect(route).not.toMatch(/partnerInitials[\s\S]{0,40}text-accent-foreground/);
    expect(css).toMatch(/\.mk-root \.ds-plate-initials \{[^}]*color: #1A2440/);
  });
});
