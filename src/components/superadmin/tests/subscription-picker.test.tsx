import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SubscriptionPicker } from "../SubscriptionPicker";

describe("SubscriptionPicker", () => {
  it("preselectează perioada gratuită de 14 zile, nu „Fără termen”", () => {
    render(<SubscriptionPicker term="trial_14d" saving={false} onSave={vi.fn()} />);
    expect(screen.getByRole("combobox").textContent).toContain("Trial 14 zile");
    // Fără modificare, butonul de salvare rămâne inactiv.
    expect(screen.getByRole("button", { name: "Salvează" })).toBeDisabled();
  });

  it("afișează „Fără termen” doar când agenția nu are termen", () => {
    render(<SubscriptionPicker term={null} saving={false} onSave={vi.fn()} />);
    expect(screen.getByRole("combobox").textContent).toContain("Fără termen");
  });
});
