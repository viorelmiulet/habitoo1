import { createFileRoute } from "@tanstack/react-router";
import { serveExtension, methodNotAllowed } from "@/lib/extension/core";
import { extensionStore } from "@/lib/extension/store.server";
import { myListingsHandler } from "@/lib/extension/listings";
import { extensionListingsStore } from "@/lib/extension/listings.server";

async function handle(request: Request) {
  const handler = request.method === "GET" ? myListingsHandler(request, await extensionListingsStore()) : methodNotAllowed;
  return serveExtension(request, await extensionStore(), handler);
}

export const Route = createFileRoute("/api/public/extension/v1/my-listings")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
