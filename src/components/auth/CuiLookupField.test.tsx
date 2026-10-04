// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
function render(el: React.ReactElement) {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host).render(el));
}
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as unknown as T;
const byText = (t: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === t)!;
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f, createServerFn: () => ({}) }));
vi.mock("@/lib/company-lookup.functions", () => ({ lookupCompanyByCui: vi.fn() }));

import { CuiLookupField, type CuiLookupState } from "./CuiLookupField";
import type { LookupResult } from "@/lib/company-lookup";

function Harness({ lookup }: { lookup: (c: string) => Promise<LookupResult> }) {
  const [cui, setCui] = useState("");
  const [agency, setAgency] = useState("");
  const onState = (s: CuiLookupState) => s.kind === "found" && setAgency(s.company.legalName);
  return (
    <>
      <CuiLookupField value={cui} onChange={setCui} onState={onState} lookup={lookup} />
      <input aria-label="Numele agenției" value={agency} onChange={(e) => setAgency(e.target.value)} />
    </>
  );
}

const company = {
  cui: "18547290", legalName: "EXEMPLU SRL", tradeRegistryNumber: "J1/1/2000", address: "JUD. CLUJ, STR. X",
  postalCode: null, county: "Cluj", city: "Cluj-Napoca", phone: null, status: "activa" as const, vatPayer: true,
};

describe("CuiLookupField (Google /onboarding și /register)", () => {
  it("CUI valid → card + numele agenției completat, editabil", async () => {
    vi.useFakeTimers();
    render(<Harness lookup={async () => ({ ok: true, company, alreadyRegistered: false })} />);
    type(q("#cui"), "RO18547290");
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(q("[data-testid=company-card]").textContent).toContain("EXEMPLU SRL");
    expect(q<HTMLInputElement>("[aria-label='Numele agenției']").value).toBe("EXEMPLU SRL");
    vi.useRealTimers();
  });
  it("ANAF indisponibil → mesaj, se poate continua manual", async () => {
    render(<Harness lookup={async () => { throw new Error("down"); }} />);
    type(q("#cui"), "1");
    await act(async () => { byText("Caută firma").click(); });
    expect(q("[role=status]").textContent).toContain("continua");
    expect(q<HTMLInputElement>("[aria-label='Numele agenției']").disabled).toBe(false);
  });
  it("CUI duplicat → mesajul fără detalii", async () => {
    render(<Harness lookup={async () => ({ ok: true, company, alreadyRegistered: true })} />);
    await act(async () => { byText("Caută firma").click(); });
    expect(q("[role=alert]").textContent).toContain("Există deja o agenție");
  });
});
