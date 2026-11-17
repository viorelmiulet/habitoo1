// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function render(el: React.ReactElement) { const c = document.createElement("div"); document.body.appendChild(c); act(() => createRoot(c).render(el)); return c; }
import { readFileSync } from "node:fs";

const navigate = vi.fn();
let path = "/app";
vi.mock("@tanstack/react-router", () => ({ useLocation: () => ({ pathname: path }), useNavigate: () => navigate }));
import { AiAgentBubble } from "./AiAgentBubble";

describe("AiAgentBubble", () => {
  it("se randează și deschide Agentul AI la click", () => {
    path = "/app";
    const c = render(<AiAgentBubble />);
    act(() => (c.querySelector('button[aria-label="Deschide Agentul AI"]') as HTMLButtonElement).click());
    expect(navigate).toHaveBeenCalledWith({ to: "/app/ai" });
  });
  it("se ascunde când agentul e deschis", () => {
    path = "/app/ai";
    const c = render(<AiAgentBubble />);
    expect(c.firstChild).toBeNull();
  });
  it("layout-urile autentificate nu mai montează bula Mesaje, ci bula AI", () => {
    const app = readFileSync("src/routes/_authenticated/app.tsx", "utf8");
    const sa = readFileSync("src/routes/_authenticated/superadmin.tsx", "utf8");
    expect(app).not.toMatch(/Messenger/);
    expect(sa).not.toMatch(/Messenger/);
    expect(app).toMatch(/<AiAgentBubble \/>/);
  });
});
