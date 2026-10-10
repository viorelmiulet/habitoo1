import "./lib/error-capture";
import { runWithRequestContext } from "./lib/after-response";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { decideEdge, publicCacheControl, shouldTagNoindex } from "./lib/host-policy";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function withPrivateDocumentCache(response: Response, request: Request): Response {
  if (request.method !== "GET") return response;
  const pathname = new URL(request.url).pathname;
  const isPrivateDocument =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/auth/callback" ||
    pathname === "/onboarding" ||
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/superadmin" ||
    pathname.startsWith("/superadmin/");
  if (!isPrivateDocument) return response;

  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withPublicCache(response: Response, request: Request): Response {
  const value = publicCacheControl(request, response);
  if (!value) return response;
  const headers = new Headers(response.headers);
  headers.set("cache-control", value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function withNoindexHeader(response: Response, request: Request): Response {
  if (!shouldTagNoindex(request, response)) return response;
  const headers = new Headers(response.headers);
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const decision = decideEdge(request);
    if (decision.kind === "redirect") {
      return new Response(null, { status: 301, headers: { location: decision.location } });
    }
    if (decision.kind === "robots") {
      return withNoindexHeader(
        new Response(decision.body, { headers: { "content-type": "text/plain; charset=utf-8" } }),
        request,
      );
    }
    try {
      const handler = await getServerEntry();
      const response = await runWithRequestContext(ctx, () => handler.fetch(request, env, ctx));
      return withNoindexHeader(
        withPublicCache(withPrivateDocumentCache(await normalizeCatastrophicSsrResponse(response), request), request),
        request,
      );
    } catch (error) {
      console.error(error);
      return withNoindexHeader(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        request,
      );
    }
  },
};
