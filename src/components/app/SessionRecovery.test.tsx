// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
vi.mock("@/lib/impersonation.functions", () => ({ getImpersonationSession: vi.fn() }));

import {
  SessionRecoveryScreen,
  useSessionRecovery,
  type SessionRecoveryInput,
} from "./SessionRecovery";
import { SessionTimeoutError, withSessionTimeout } from "@/hooks/use-session";

type Props = Omit<SessionRecoveryInput, "slowMs">;

function Harness(props: Props) {
  const r = useSessionRecovery({ ...props, slowMs: 15_000 });
  if (r.showError && !props.data) {
    return <SessionRecoveryScreen onRetry={() => void r.retry()} retrying={r.retrying} />;
  }
  return <div>{props.isLoading ? "Se încarcă spațiul de lucru…" : "aplicația"}</div>;
}

let root: ReturnType<typeof createRoot> | null = null;
function render(props: Props) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Harness {...props} />));
}
function rerender(props: Props) {
  act(() => root!.render(<Harness {...props} />));
}
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
function returnToTab() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
});

describe("withSessionTimeout", () => {
  it("aruncă „Sesiunea nu a răspuns” când getUser nu se termină", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    const result = withSessionTimeout(never, 12_000);
    const check = expect(result).rejects.toBeInstanceOf(SessionTimeoutError);
    await vi.advanceTimersByTimeAsync(12_000);
    await check;
  });

  it("lasă să treacă un răspuns la timp", async () => {
    await expect(withSessionTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });
});

describe("recuperarea sesiunii", () => {
  const base = (): Props => ({
    data: undefined,
    isLoading: true,
    isError: false,
    refetch: vi.fn(async () => ({ data: { userId: "u" }, isError: false })),
    startAutoRefresh: vi.fn(),
    onExpired: vi.fn(),
  });

  it("după 15 secunde de încărcare arată eroarea și butoanele", () => {
    vi.useFakeTimers();
    render(base());
    expect(document.body.textContent).toContain("Se încarcă spațiul de lucru…");
    act(() => vi.advanceTimersByTime(15_000));
    expect(document.body.textContent).toContain("Nu am putut reîncărca sesiunea");
    expect(document.body.textContent).toContain("Reîncearcă");
    expect(document.body.textContent).toContain("Reîncarcă pagina");
  });

  it("arată eroarea când cererea a eșuat (sesiunea nu a răspuns)", () => {
    render({ ...base(), isLoading: false, isError: true });
    expect(document.body.textContent).toContain("Nu am putut reîncărca sesiunea");
  });

  it("la revenirea în tab pornește reîmprospătarea, apoi refetch", async () => {
    const props = { ...base(), isLoading: false, isError: true };
    render(props);
    returnToTab();
    await flush();
    expect(props.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(props.refetch).toHaveBeenCalledTimes(1);
    expect(props.onExpired).not.toHaveBeenCalled();
  });

  it("„Reîncearcă” cu sesiune expirată duce la login", async () => {
    const props = {
      ...base(),
      isLoading: false,
      isError: true,
      refetch: vi.fn(async () => ({ data: null, isError: false })),
    };
    render(props);
    const button = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Reîncearcă"),
    )!;
    act(() => button.click());
    await flush();
    expect(props.onExpired).toHaveBeenCalledTimes(1);
  });

  it("sesiune validă: nu arată eroarea și nu reîncearcă la revenirea în tab", async () => {
    const props = { ...base(), data: { userId: "u" }, isLoading: false };
    render(props);
    rerender(props);
    returnToTab();
    await flush();
    expect(document.body.textContent).toContain("aplicația");
    expect(props.refetch).not.toHaveBeenCalled();
    expect(props.startAutoRefresh).not.toHaveBeenCalled();
  });
});
