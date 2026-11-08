import { createFileRoute } from "@tanstack/react-router";
import { serveExtension, revokeHandler, methodNotAllowed } from "@/lib/extension/core";
import { extensionStore } from "@/lib/extension/store.server";

const handle = async (request: Request) => serveExtension(request, await extensionStore(), request.method === "DELETE" ? revokeHandler : methodNotAllowed);

export const Route = createFileRoute("/api/public/extension/v1/token")({
  server: { handlers: { DELETE: ({ request }) => handle(request), GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
