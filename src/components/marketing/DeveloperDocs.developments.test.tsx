import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeveloperDocs } from "./DeveloperDocs";

const spec = JSON.parse(readFileSync("public/dezvoltatori/openapi.json", "utf8"));
const html = renderToStaticMarkup(<DeveloperDocs />);

describe("pagina /dezvoltatori — ansambluri", () => {
  it("randează secțiunea cu ancora în cuprins", () => {
    expect(html).toContain('id="ansambluri"');
    expect(html).toContain('href="#ansambluri"');
    expect(html).toContain("Ansambluri rezidențiale");
    expect(html).toContain("Retry-After: 300");
    expect(html).toContain("Ansamblu fictiv");
  });
  it("tabelul conține fiecare câmp din schema ansamblului din openapi.json", () => {
    const start = html.indexOf('data-testid="development-schema"');
    expect(start).toBeGreaterThan(-1);
    const table = html.slice(start, html.indexOf("</table>", start));
    const fields = Object.keys(spec.components.schemas.FeedDevelopment.properties);
    expect(fields.length).toBeGreaterThan(20);
    for (const f of fields) expect(table, f).toContain(`>${f}<`);
  });
});
