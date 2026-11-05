// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IdScanPanel } from "./IdScanPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // jsdom nu are URL.createObjectURL; miniaturile nu sunt verificate aici.
  URL.createObjectURL = () => "blob:mock";
  URL.revokeObjectURL = () => {};
  // jsdom nu are matchMedia; panoul îl folosește pentru detecția dispozitivelor tactile.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

function render() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host).render(<IdScanPanel idPrefix="t" onResult={() => {}} />));
  return host;
}

function pickFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("IdScanPanel — cele două variante de adăugare", () => {
  it("inputul „Încarcă o poză” nu are capture, iar „Fotografiază” are capture=\"environment\"", () => {
    const host = render();
    const upload = host.querySelector<HTMLInputElement>("#t-upload")!;
    const photo = host.querySelector<HTMLInputElement>("#t-photo")!;
    expect(upload.hasAttribute("capture")).toBe(false);
    expect(photo.getAttribute("capture")).toBe("environment");
    expect(upload.getAttribute("accept")).toBe("image/*");
  });

  it("după 2 poze, ambele butoane de adăugare sunt dezactivate", () => {
    const host = render();
    const upload = host.querySelector<HTMLInputElement>("#t-upload")!;
    const uploadBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Încarcă o poză"))!;
    expect((uploadBtn as HTMLButtonElement).disabled).toBe(false);
    pickFiles(upload, [new File(["a"], "fata.jpg", { type: "image/jpeg" }), new File(["b"], "verso.jpg", { type: "image/jpeg" })]);
    expect((uploadBtn as HTMLButtonElement).disabled).toBe(true);
    expect(upload.disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>("#t-photo")!.disabled).toBe(true);
  });
});
