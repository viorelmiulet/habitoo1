import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canAccessSuperadmin, dashboardHomeFor } from "@/lib/superadmin-status";

type Session = {
  isSuperadmin?: boolean;
  organization?: unknown;
  impersonation?: unknown;
};

const superadminFaraAgentie: Session = {
  isSuperadmin: true,
  organization: null,
  impersonation: null,
};

const superadminInImpersonare: Session = {
  isSuperadmin: true,
  organization: null,
  impersonation: { id: "imp-1", mode: "full" },
};

const superadminCuAgentie: Session = {
  isSuperadmin: true,
  organization: { id: "org-1" },
  impersonation: null,
};

const agent: Session = { isSuperadmin: false, organization: { id: "org-1" }, impersonation: null };
const agencyAdmin: Session = {
  isSuperadmin: false,
  organization: { id: "org-1" },
  impersonation: null,
};

describe("destinația după autentificare (/app)", () => {
  it("superadminul fără agenție merge direct în panoul platformei", () => {
    expect(dashboardHomeFor(superadminFaraAgentie)).toBe("/superadmin");
  });

  it("superadminul care impersonează o agenție lucrează în /app", () => {
    expect(dashboardHomeFor(superadminInImpersonare)).toBe("/app");
  });

  it("superadminul cu agenție rămâne pe /app", () => {
    expect(dashboardHomeFor(superadminCuAgentie)).toBe("/app");
  });

  it("agentul și adminul de agenție rămân pe /app", () => {
    expect(dashboardHomeFor(agent)).toBe("/app");
    expect(dashboardHomeFor(agencyAdmin)).toBe("/app");
  });

  it("nu se creează buclă de redirect: panoul platformei primește superadminul", () => {
    expect(canAccessSuperadmin(superadminFaraAgentie)).toBe(true);
    expect(canAccessSuperadmin({ isSuperadmin: false })).toBe(false);
  });
});

describe("ecranul intermediar „Zona Superadmin” a dispărut", () => {
  const source = readFileSync("src/routes/_authenticated/app.index.tsx", "utf8");

  it("ruta redirecționează și nu mai randează cardul", () => {
    expect(source).toContain('<Navigate to="/superadmin" replace />');
    expect(source).not.toContain("Zona Superadmin");
    expect(source).not.toContain("Deschide Superadmin");
    expect(source).not.toContain("nu este atașat unei agenții");
  });
});
