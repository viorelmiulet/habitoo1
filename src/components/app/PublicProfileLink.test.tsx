import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PublicProfileLink } from "./PublicProfileLink";

describe("public profile link in settings", () => {
  it("shows a read-only link and no editable slug field", () => {
    const html = renderToStaticMarkup(<PublicProfileLink slug="agentia-test-bucuresti" />);
    expect(html).toMatch(/href="[^"]*\/agentii\/agentia-test-bucuresti"/);
    expect(html).toContain('aria-label="Copiază linkul profilului public"');
    expect(html).not.toMatch(/<input|<textarea/);
  });
  it("settings no longer edits public_slug or the profile toggle", () => {
    const src = readFileSync("src/routes/_authenticated/app.settings.tsx", "utf8");
    expect(src).not.toMatch(/public_slug\s*:/);
    expect(src).not.toContain("public_profile_enabled");
    expect(src).not.toContain('id="public_slug"');
  });
});
