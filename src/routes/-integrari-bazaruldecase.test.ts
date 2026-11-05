import { describe, expect, it } from "vitest";
import logo from "@/assets/portals/bazaruldecase.png.asset.json";

// Randează pagina publică prin serverul de dezvoltare (SSR) și verifică titlul și logo-ul.
describe("/integrari/bazaruldecase", () => {
  it("se randează cu titlul și logo-ul BazarulDeCase.ro", async () => {
    const res = await fetch("http://localhost:8080/integrari/bazaruldecase");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.replace(/<!-- -->/g, "")).toMatch(/<h1[^>]*>Integrare BazarulDeCase.ro cu Habitoo CRM<\/h1>/);
    expect(html).toContain("<title>Integrare BazarulDeCase.ro cu CRM imobiliar | Habitoo</title>");
    expect(html).toContain(logo.url);
  });
});
