// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const TOKEN = "hbext_" + "a".repeat(64);
const connect = vi.fn(async () => ({ token: TOKEN }));
let search: { nonce?: string } = {};
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => connect, createServerFn: () => ({}) }));
vi.mock("@/lib/extension.functions", () => ({ connectExtension: {} }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({ ...opts, useSearch: () => search }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

beforeEach(() => { connect.mockClear(); });

async function page() {
  const mod = await import("./app.extensie.conectare");
  const C = (mod.Route as unknown as { component: () => JSX.Element }).component;
  return render(<C />);
}

describe("pagina de conectare a extensiei", () => {
  it("fără nonce valid nu se generează nimic", async () => {
    for (const n of [undefined, "bad!"]) {
      search = { nonce: n };
      const { unmount } = await page();
      expect(screen.queryByText("Permite")).toBeNull();
      unmount();
    }
    expect(connect).not.toHaveBeenCalled();
  });
  it("Permite trimite tokenul prin postMessage și nu îl afișează sau loghează", async () => {
    search = { nonce: "Nonce12345" };
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    const log = vi.spyOn(console, "log");
    const { container } = await page();
    fireEvent.click(screen.getByText("Permite"));
    await waitFor(() => screen.getByText("Extensia a fost conectată, poți închide fila."));
    expect(post).toHaveBeenCalledWith({ type: "habitoo-extension-token", nonce: "Nonce12345", token: TOKEN }, window.location.origin);
    expect(container.innerHTML).not.toContain(TOKEN);
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
  });
});
