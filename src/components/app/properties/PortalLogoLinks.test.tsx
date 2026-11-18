// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function render(el: React.ReactElement) { const d = document.createElement("div"); document.body.innerHTML = ""; document.body.appendChild(d); act(() => { createRoot(d).render(el); }); return { container: d }; }
import { TooltipProvider } from "@/components/ui/tooltip";
import { PortalLogoLinks } from "./PortalLogoLinks";

const base = { selected: true, state: "published" } as const;

describe("PortalLogoLinks", () => {
  it("randează logo cu link pentru portalurile cu URL și fără link altfel", () => {
    const cells = [
      { ...base, portalId: "imobiliare_ro", portalName: "Imobiliare.ro", publicUrl: "https://www.imobiliare.ro/oferta/1" },
      { ...base, portalId: "storia", portalName: "Storia", publicUrl: "https://homezz.ro/anunt/2" },
      { ...base, portalId: "lacheie", portalName: "La Cheie", publicUrl: null },
    ];
    const { container } = render(<TooltipProvider><PortalLogoLinks cells={cells as never} /></TooltipProvider>);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("https://www.imobiliare.ro/oferta/1");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(links[0].querySelector('img[alt="Imobiliare.ro"]')).not.toBeNull();
    expect(links[1].querySelector('img[alt="Storia"]')).not.toBeNull();
    const pub = container.querySelector('img[alt="La Cheie"]');
    expect(pub).not.toBeNull();
    expect(pub!.closest("a")).toBeNull();
  });
});
