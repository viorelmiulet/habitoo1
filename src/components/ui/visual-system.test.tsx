import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./button";
import { Card, Panel } from "./card";
import { Input } from "./input";
import { FieldError, FieldHint, Label } from "./label";
import { StatusPill, type StatusPillState } from "./status-pill";

describe("componentele de bază ale sistemului vizual", () => {
  it.each(["primary", "secondary", "soft", "danger"] as const)(
    "randează varianta Button %s",
    (variant) => {
      const html = renderToStaticMarkup(<Button variant={variant}>Acțiune</Button>);
      expect(html).toContain("h-11");
      expect(html).toContain("font-bold");
    },
  );

  it("randează mărimea compactă și starea disabled", () => {
    const html = renderToStaticMarkup(
      <Button size="compact" disabled>
        Acțiune
      </Button>,
    );
    expect(html).toContain("h-[38px]");
    expect(html).toContain("disabled:bg-control-disabled");
    expect(html).toContain('disabled=""');
  });

  it("randează inputul cu label, hint și eroare", () => {
    const html = renderToStaticMarkup(
      <div>
        <Label htmlFor="price">Preț</Label>
        <Input id="price" error aria-invalid />
        <FieldHint>În euro</FieldHint>
        <FieldError>Valoare invalidă</FieldError>
      </div>,
    );
    expect(html).toContain("h-11");
    expect(html).toContain("border-input-error");
    expect(html).toContain("text-muted-foreground");
    expect(html).toContain("text-destructive");
  });

  it.each(["published", "pending", "error", "inactive"] satisfies StatusPillState[])(
    "randează StatusPill %s",
    (state) => {
      const html = renderToStaticMarkup(<StatusPill state={state}>{state}</StatusPill>);
      expect(html).toContain("rounded-pill");
      expect(html).toContain(state);
    },
  );

  it("randează Card și Panel fără umbre", () => {
    const card = renderToStaticMarkup(<Card>Card</Card>);
    const panel = renderToStaticMarkup(<Panel>Panel</Panel>);
    expect(card).toContain("rounded-card");
    expect(panel).toContain("rounded-panel");
    expect(`${card}${panel}`).not.toMatch(/shadow/);
  });
});
