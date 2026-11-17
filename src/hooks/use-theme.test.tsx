// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
function render(el: React.ReactElement) {
  const host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host); act(() => root!.render(el));
  return { unmount: () => { root?.unmount(); root = null; } };
}
function cleanup() { if (root) act(() => root!.unmount()); root = null; document.body.innerHTML = ""; }
import { readFileSync } from "node:fs";
import { useApplyTheme, APP_DEEP_CLASS } from "./use-theme";

function Shell() { useApplyTheme(); return <div data-testid="shell" />; }

describe("CR1 — tema Deep Space a aplicației", () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it("aplică implicit scope-ul închis pe layout-ul autentificat", () => {
    render(<Shell />);
    expect(document.documentElement.classList.contains(APP_DEEP_CLASS)).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("preferința „luminoasă” scoate scope-ul închis", () => {
    localStorage.setItem("habitoo.theme", "light");
    render(<Shell />);
    expect(document.documentElement.classList.contains(APP_DEEP_CLASS)).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("scope-ul dispare la ieșirea din aplicație (site-ul public)", () => {
    const { unmount } = render(<Shell />);
    act(() => unmount());
    expect(document.documentElement.classList.contains(APP_DEEP_CLASS)).toBe(false);
  });

  it("regulile .mk-root ale site-ului public nu depind de app-deep", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const mkRules = css.split("\n").filter((l) => l.includes(".mk-root"));
    expect(mkRules.length).toBeGreaterThan(0);
    expect(mkRules.some((l) => l.includes("app-deep"))).toBe(false);
    const deepRules = css.split("\n").filter((l) => l.includes("app-deep"));
    expect(deepRules.some((l) => l.includes(".mk-root"))).toBe(false);
  });
});
