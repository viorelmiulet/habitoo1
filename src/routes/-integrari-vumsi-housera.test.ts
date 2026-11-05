import { describe, expect, it } from "vitest";
import houseraLogo from "@/assets/portals/housera.png.asset.json";

// Randează paginile publice prin serverul de dezvoltare (SSR) și verifică titlul și logo-ul.
describe.each([
  ["vumsi", "Vumsi.com", "vumsi"],
  ["housera", "Housera.ro", (houseraLogo as { url: string }).url],
])("/integrari/%s", (slug, name, logoPart) => {
  it("se randează cu titlul și logo-ul", async () => {
    const res = await fetch(`http://localhost:8080/integrari/${slug}`);
    expect(res.status).toBe(200);
    const html = (await res.text()).replace(/<!-- -->/g, "");
    expect(html).toMatch(new RegExp(`<h1[^>]*>Integrare ${name.replace(".", "\\.")} cu Habitoo CRM</h1>`));
    expect(html).toContain(`<title>Integrare ${name} cu CRM imobiliar | Habitoo</title>`);
    expect(html).toMatch(new RegExp(`<img[^>]*src="[^"]*${logoPart}[^"]*"`));
  });
});
