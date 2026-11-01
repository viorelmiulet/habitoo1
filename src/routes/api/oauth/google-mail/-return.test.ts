import { describe, expect, it, vi } from "vitest";

// Ruta de retur a pop-up-ului: createFileRoute este înlocuită cu un simplu
// înfășurător, ca handler-ul de server să poată fi apelat direct.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));

import { Route } from "./return";

type GetHandler = (input: { request: Request }) => Promise<Response>;

async function get(query: string) {
  const route = Route as unknown as {
    options: { server: { handlers: { GET: GetHandler } } };
  };
  const res = await route.options.server.handlers.GET({
    request: new Request(`https://crm.habitoo.ro/api/oauth/google-mail/return${query}`),
  });
  return { status: res.status, html: await res.text() };
}

describe("pagina de retur a consimțământului Gmail", () => {
  it("trimite codul de unică folosință doar către fereastra care a deschis pop-up-ul", async () => {
    const { html } = await get("?success=true&connector_id=google_mail&code=one-time-code");

    expect(html).toContain("appUserConnectorOAuthComplete");
    expect(html).toContain("one-time-code");
    expect(html).toContain("window.opener.postMessage");
    expect(html).toContain("window.location.origin");
    expect(html).toContain("window.close()");
    // Cheia de conexiune nu apare niciodată aici.
    expect(html).not.toContain("lovack_");
  });

  it("tratează consimțământul fără cod ca eșec", async () => {
    const { html } = await get("?success=true&connector_id=google_mail");
    expect(html).toContain('"success":false');
    expect(html).toContain("Missing code");
  });

  it("păstrează consimțământul reușit când clientul nu are acces offline", async () => {
    const { html } = await get(
      "?success=true&connector_id=google_mail&offline_access_allowed=false",
    );
    expect(html).toContain('"success":true');
    expect(html).toContain('"code":null');
  });

  it("escapează textul erorii primite din query string", async () => {
    const { html } = await get("?success=false&error=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("răspunde cu HTML, nu cu o eroare de autentificare", async () => {
    const { status, html } = await get("?success=true&connector_id=google_mail&code=abc");
    expect(status).toBe(200);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
  });
});
