// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
function render(el: React.ReactElement) {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host).render(el));
}

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

import { RegistrationRequestDetails } from "./RegistrationRequestDetails";
import type { RegistrationRequestDetails as Details } from "@/lib/registration-request-details.functions";

const base: Details = {
  request: {
    id: "req-1",
    agencyName: "Expert Imobiliare",
    fullName: "Ana Pop",
    email: "ana@expert.ro",
    phone: "0722000000",
    requestedPlan: "pro",
    requestedTerm: "12m",
    createdAt: "2026-10-01T10:00:00Z",
    status: "approved",
    reviewedByName: "Super Admin",
    reviewedAt: "2026-10-02T10:00:00Z",
    rejectionReason: null,
  },
  company: {
    legalName: "EXPERT REAL ESTATE SRL",
    cui: "40930967",
    tradeRegistryNumber: "J40/1234/2019",
    registeredAddress: "Sector 1, Str. Lămâiului, nr. 4",
    city: "București",
    county: "București",
    postalCode: "014584",
    companyStatus: "inactiva",
    companyStatusSince: "2021-12-07",
    companyVerifiedAt: "2026-10-04T08:00:00Z",
  },
  organization: {
    id: "org-1",
    name: "Expert Imobiliare",
    status: "active",
    plan: "pro",
    isTrial: false,
    subscriptionStartedAt: "2026-10-02T10:00:00Z",
    subscriptionExpiresAt: "2027-10-02T10:00:00Z",
    collaborationEnabled: true,
    userCount: 3,
    propertyCount: 12,
  },
  contact: { loginEmail: "ana@expert.ro", provider: "google" },
};

describe("RegistrationRequestDetails", () => {
  it("arată toate secțiunile pentru o cerere cu organizație", () => {
    render(<RegistrationRequestDetails details={base} />);
    const text = host.textContent ?? "";
    expect(text).toContain("Cerere");
    expect(text).toContain("Expert Imobiliare");
    expect(text).toContain("Pro");
    expect(text).toContain("Aprobată");
    expect(text).toContain("Super Admin");
    expect(text).toContain("Firmă (ANAF și organizație)");
    expect(text).toContain("EXPERT REAL ESTATE SRL");
    expect(text).toContain("Inactivă");
    expect(text).toContain("Organizație creată");
    expect(text).toContain("Activată"); // colaborare
    expect(text).toContain("3"); // utilizatori
    expect(text).toContain("12"); // proprietăți
    expect(text).toContain("Deschide agenția");
    expect(text).toContain("Google");
  });

  it("arată mesajul pentru cerere fără organizație", () => {
    render(<RegistrationRequestDetails details={{ ...base, organization: null }} />);
    const text = host.textContent ?? "";
    expect(text).toContain("Nu a fost creată încă");
    expect(text).not.toContain("Deschide agenția");
  });

  it("arată „—” pentru câmpurile lipsă", () => {
    render(
      <RegistrationRequestDetails
        details={{
          ...base,
          request: { ...base.request, phone: null, reviewedByName: null, rejectionReason: null },
          company: {
            ...base.company,
            registeredAddress: null,
            county: null,
            postalCode: null,
            companyStatus: null,
            companyVerifiedAt: null,
          },
          organization: null,
          contact: { loginEmail: null, provider: null },
        }}
      />,
    );
    const dashes = [...host.querySelectorAll("dd")].filter((d) => d.textContent === "—");
    // telefon, verificată de, motiv respingere, adresă, județ, cod poștal,
    // stare firmă, verificare ANAF, email logare, metodă înregistrare
    expect(dashes.length).toBeGreaterThanOrEqual(9);
  });
});
