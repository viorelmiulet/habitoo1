// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { AiFieldMarksContext, AiMark } from "./AiFieldMarks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Aceeași logică de anulare ca în paginile fișei: onRemoveField → setAiMarked(m.filter(k ≠ key)). */
function Harness() {
  const [aiMarked, setAiMarked] = useState<string[]>(["rooms", "floor"]);
  const onRemoveField = (key: string) => setAiMarked((m) => m.filter((k) => k !== key));
  return (
    <AiFieldMarksContext.Provider value={new Set(aiMarked)}>
      <label>Camere<AiMark field="rooms" /></label>
      <label>Etaj<AiMark field="floor" /></label>
      <button type="button" aria-label="Anulează Camere" onClick={() => onRemoveField("rooms")}>×</button>
    </AiFieldMarksContext.Provider>
  );
}

describe("CR4 — fișa proprietății", () => {
  it("marcajul AI dispare de pe câmp după ×", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => root.render(<Harness />));
    expect(el.querySelector('[data-ai-mark="rooms"]')).not.toBeNull();
    act(() => el.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.querySelector('[data-ai-mark="rooms"]')).toBeNull();
    expect(el.querySelector('[data-ai-mark="floor"]')).not.toBeNull();
    act(() => root.unmount());
  });

});
