// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MailReplyWindow, type ReplyTarget } from "./MailReplyWindow";

vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ""; vi.clearAllMocks(); });
const inbound: ReplyTarget = { id: "received", direction: "inbound", from_email: "client@example.test", to_emails: ["office@example.test"] };
const outbound: ReplyTarget = { id: "sent", direction: "outbound", from_email: "office@example.test", to_emails: ["other@example.test", "second@example.test"] };
type Send = React.ComponentProps<typeof MailReplyWindow>["onSend"];
function Harness({ send }: { send: Send }) {
  const [target, setTarget] = useState<ReplyTarget | null>(null);
  return <>
    <button onClick={() => setTarget(inbound)}>Răspunde primit</button>
    <button onClick={() => setTarget(outbound)}>Răspunde trimis</button>
    {target && <MailReplyWindow target={target} threadId="thread-1" subject="Proprietate" attachmentIds={[]} uploading={false} attachments={null} picker={null} onSend={send} onClose={() => setTarget(null)} onSent={vi.fn()} />}
  </>;
}
function render(send: Send) {
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host);
  act(() => root?.render(<Harness send={send} />));
}
function button(label: string) {
  const match = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent === label);
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}
function editor() {
  const element = document.querySelector("textarea");
  if (!element) throw new Error("Missing reply editor");
  return element;
}
function type(text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (!set) throw new Error("Missing textarea value setter");
  act(() => { const input = editor(); set.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
function click(label: string) { act(() => button(label).click()); }

describe("floating mail reply (no real email)", () => {
  it("reply to received message shows its sender and focuses the editor", () => {
    render(vi.fn()); click("Răspunde primit");
    expect(document.querySelector("section")?.textContent).toContain("Către: client@example.test");
    expect(document.activeElement).toBe(editor());
  });
  it("minimize and reopen preserve the text", () => {
    render(vi.fn()); click("Răspunde primit"); type("Un răspuns păstrat"); click("Minimizează");
    expect(document.querySelector("textarea")).toBeNull(); click("Redeschide răspunsul");
    expect(editor().value).toBe("Un răspuns păstrat");
  });
  it("another message reuses the same draft and uses outbound recipients", () => {
    render(vi.fn()); click("Răspunde primit"); type("Ciornă"); click("Răspunde trimis");
    expect(document.querySelectorAll("section").length).toBe(1);
    expect(document.querySelector("section")?.textContent).toContain("Către: other@example.test, second@example.test");
    expect(editor().value).toBe("Ciornă");
  });
  it("closing a written reply asks confirmation and cancel preserves it", () => {
    render(vi.fn()); click("Răspunde primit"); type("Păstrează"); click("Închide răspunsul");
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Renunți la răspuns?");
    click("Continuă răspunsul"); expect(editor().value).toBe("Păstrează");
  });
  it("double submit sends exactly one mocked message and closes on success", async () => {
    let finish: ((value: { ok: boolean }) => void) | undefined;
    const send = vi.fn(() => new Promise<{ ok: boolean }>((resolve) => { finish = resolve; }));
    render(send); click("Răspunde primit"); type("Răspuns");
    act(() => { const submit = button("Trimite"); submit.click(); submit.click(); });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ threadId: "thread-1", text: "Răspuns", attachmentIds: [] });
    await act(async () => { finish?.({ ok: true }); });
    expect(document.querySelector("section")).toBeNull();
  });
  it("failed request retains draft and retries with the same idempotency key", async () => {
    const send = vi.fn<Send>().mockResolvedValueOnce({ ok: false, error: "Temporar" }).mockResolvedValueOnce({ ok: true });
    render(send); click("Răspunde primit"); type("Retry");
    await act(async () => button("Trimite").click());
    expect(editor().value).toBe("Retry");
    await act(async () => button("Trimite").click());
    expect(send.mock.calls[0]?.[0].sendKey).toBeTruthy();
    expect(send.mock.calls[1]?.[0].sendKey).toBe(send.mock.calls[0]?.[0].sendKey);
  });
});