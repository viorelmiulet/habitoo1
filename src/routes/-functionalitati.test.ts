import { describe, expect, it } from "vitest";
import { FEATURE_ENTRIES, featureHref } from "@/lib/marketing/feature-pages";

// Randează paginile prin serverul de dezvoltare (SSR).
describe("/functionalitati", () => {
  it("răspunde 200 și are câte un link pentru fiecare funcție", async () => {
    const res = await fetch("http://localhost:8080/functionalitati");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(FEATURE_ENTRIES.length).toBeGreaterThan(0);
    for (const e of FEATURE_ENTRIES) expect(html).toContain(`href="${featureHref(e)}"`);
  });
  it("un slug necunoscut dă 404", async () => {
    const res = await fetch("http://localhost:8080/functionalitati/functie-inexistenta");
    expect(res.status).toBe(404);
  });
});
