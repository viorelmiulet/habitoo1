import { createFileRoute } from "@tanstack/react-router";
import { serveExtension, meHandler, methodNotAllowed } from "@/lib/extension/core";
import { extensionStore } from "@/lib/extension/store.server";

const handle = async (request: Request) => serveExtension(request, await extensionStore(), request.method === "GET" ? meHandler : methodNotAllowed);

export const Route = createFileRoute("/api/public/extension/v1/me")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request), DELETE: ({ request }) => handle(request) } },
});
