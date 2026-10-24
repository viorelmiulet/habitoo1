/**
 * Fila „Agent” a paginii proprietății: ea înlocuiește panoul „Agent responsabil”
 * din coloana din dreapta a prezentării. Testele citesc sursa ca să prindă
 * reapariția vechiului titlu sau mutarea filăi în spatele prezentării.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/app.properties.$id.tsx", "utf8");
const agentField = readFileSync("src/components/app/PropertyResponsibleAgentField.tsx", "utf8");

/** Tab-urile declarate în `TabsList`, în ordinea din sursă. */
const tabsList = route.slice(
  route.indexOf('aria-label="Secțiunile proprietății"'),
  route.indexOf("].map(([value, label])"),
);
const tabValues = [...tabsList.matchAll(/\["([a-z]+)", /g)].map((match) => match[1]);

describe("fila Agent", () => {
  it("există și stă înaintea prezentării", () => {
    expect(tabValues).toContain("agent");
    expect(tabValues.indexOf("agent")).toBe(0);
    expect(tabValues.indexOf("agent")).toBeLessThan(tabValues.indexOf("overview"));
  });

  it("se numește „Agent”, nu „Agent responsabil”", () => {
    expect(route).toContain('["agent", "Agent"]');
    expect(route).not.toContain("Agent responsabil");
    expect(agentField).toContain("<Label htmlFor=\"responsible-agent\">Agent</Label>");
    expect(agentField).not.toContain("Agent responsabil");
  });

  it("păstrează conținutul într-un singur loc, nu și în coloana din dreapta", () => {
    expect(route.match(/<TabsContent value="agent"/g)).toHaveLength(1);
    expect(route.match(/setReassignOpen\(true\)/g)).toHaveLength(1);
  });
});
