// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { handleStaleVersion, STALE_RELOAD_KEY } from "./stale-chunk-reload";

describe("CR11 reîncărcare la chunk vechi", () => {
  it("reîncarcă o singură dată, apoi arată mesajul", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, href: "http://x/a", reload, assign: vi.fn() }, writable: true });
    sessionStorage.removeItem(STALE_RELOAD_KEY);
    expect(handleStaleVersion()).toBe("reload");
    expect(handleStaleVersion()).toBe("message");
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
