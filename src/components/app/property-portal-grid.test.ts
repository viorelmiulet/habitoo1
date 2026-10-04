import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync("src/components/app/PropertyPortalsCard.tsx", "utf8");

describe("grila de publicare", () => {
  it("păstrează o singură intrare per portal, în ordinea existentă, cu 1/2/3 coloane", () => {
    expect(view).toContain('grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3');
    expect(view.match(/cells\.map\(\(cell, index\) =>/g)).toHaveLength(1);
    expect(view.indexOf('portal-facebook-catalog')).toBeLessThan(view.indexOf('portal-habitoo-collaboration'));
    expect(view.indexOf('portal-habitoo-collaboration')).toBeLessThan(view.indexOf('cells.map((cell, index)'));
    expect(view).toContain('<PortalLogoStack portalId={cell.portalId} name={cell.portalName} size={40} />');
  });

  it("folosește aceleași selecții și blochează bifele în afara editării", () => {
    expect(view).toContain('checked={value}');
    expect(view).toContain('setChecked((prev) => ({ ...prev, [cell.portalId]: next === true }))');
    expect(view).toContain('!editing ||\n                !canManage');
    expect(view).toContain('disabled={!editing || !canManage || !canEditFacebookCatalog || fb.isLoading}');
    expect(view).toContain('disabled={!editing || !canManage}');
  });

  it("ascunde bifa portalului neconectat și arată restricția de locuri pentru agentul responsabil", () => {
    expect(view).toContain('{cell.configured ? <Checkbox');
    expect(view).toContain('Agenția nu l-a conectat încă');
    expect(view).toContain('assignedTo === sessionUser?.userId');
    expect(view).toContain('noSlots ||');
    expect(view).toContain('din {slot.allocated} sloturi');
  });

  it("ține câmpurile de colaborare în cardul Colaborare Habitoo, stivuite și active doar în editare", () => {
    const card = view.indexOf('portal-habitoo-collaboration');
    const percent = view.indexOf('id="collab-percent"');
    const terms = view.indexOf('id="collab-terms"');
    const cells = view.indexOf('cells.map((cell, index)');
    // Rândurile de portal vin după card; câmpurile sunt în interiorul lui.
    expect(card).toBeGreaterThan(-1);
    expect(percent).toBeGreaterThan(card);
    expect(terms).toBeGreaterThan(percent);
    expect(terms).toBeLessThan(cells);
    // Fără rând separat pe toată lățimea.
    expect(view).not.toContain('md:col-span-2 lg:col-span-3');
    // Stivuite vertical, deasupra etichetei care bifează la click.
    expect(view).toContain('relative z-10 mt-3 min-w-0 space-y-3 pointer-events-auto');
    // Vizibile doar cu bifa bifată.
    expect(view.indexOf('{collabValue ? (')).toBeLessThan(percent);
    // Dezactivate în afara editării, ca bifa.
    expect(view.match(/disabled=\{!editing \|\| !canManage\}/g)).toHaveLength(3);
  });
});