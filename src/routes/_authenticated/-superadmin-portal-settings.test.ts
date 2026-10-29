import { describe, expect, it } from "vitest";
import portalsSource from "./superadmin.portals.tsx?raw";
import settingsSource from "./superadmin.setari-portaluri.tsx?raw";
import layoutSource from "./superadmin.tsx?raw";
import { superadminNav } from "@/components/app/AppSidebar";
import { canAccessSuperadmin } from "@/lib/superadmin-status";
import { Route as PortalsRoute } from "./superadmin.portals";
import { Route as SettingsRoute } from "./superadmin.setari-portaluri";

const MOVED = [
  "<PortalRelayCard",
  "<StoriaUnmatchedCard",
  '<ImospotSettingsCard portal="imospot"',
  '<ImospotSettingsCard portal="vdi"',
  "<LaCheieCard",
  "<PortalSlotsCard",
  "Publicarea ofertelor pe portaluri",
];

type Validate = (s: Record<string, unknown>) => { org?: string };

describe("Setări portaluri", () => {
  it("ruta stă sub layoutul SuperAdmin, accesibil doar SuperAdmin", () => {
    expect(settingsSource).toContain('createFileRoute("/_authenticated/superadmin/setari-portaluri")');
    expect(layoutSource).toContain('if (!canAccessSuperadmin(user)) return <Navigate to="/app" />');
    expect(canAccessSuperadmin({ isSuperadmin: true })).toBe(true);
    expect(canAccessSuperadmin({ isSuperadmin: false })).toBe(false);
    expect(canAccessSuperadmin(null)).toBe(false);
  });

  it("meniul are „Setări portaluri” imediat după „Portaluri”", () => {
    const items = superadminNav.flatMap((g) => g.items);
    const i = items.findIndex((x) => x.label === "Portaluri");
    expect(items[i + 1]).toMatchObject({ label: "Setări portaluri", to: "/superadmin/setari-portaluri" });
  });

  it("cardurile mutate lipsesc din Portaluri și apar toate pe pagina nouă", () => {
    for (const m of MOVED) {
      expect(portalsSource).not.toContain(m);
      expect(settingsSource).toContain(m);
    }
    expect(portalsSource).toContain("<PortalActivationRequestsCard");
    expect(portalsSource).toContain("<PortalsCard");
    expect(portalsSource).toContain("Jurnal portaluri");
    expect(settingsSource).toContain("Jurnal portaluri");
  });

  it("?org= preselectează agenția pe ambele pagini", () => {
    for (const r of [PortalsRoute, SettingsRoute]) {
      const v = r.options.validateSearch as unknown as Validate;
      expect(v({ org: "org-1" }).org).toBe("org-1");
      expect(v({}).org).toBeUndefined();
    }
    for (const src of [portalsSource, settingsSource]) {
      expect(src).toContain('useState<string>(orgFromLink ?? "")');
    }
  });
});
