import { createFileRoute } from "@tanstack/react-router";

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post). Idempotent.
export const Route = createFileRoute("/api/public/outreach/unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runUnsubscribe, clientIp } = await import("@/lib/outreach-unsubscribe.server");
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const result = await runUnsubscribe(token, clientIp(request.headers), "one_click").catch(() => "error" as const);
        if (result === "ok") return new Response("Unsubscribed", { status: 200 });
        if (result === "rate_limited") return new Response("Too many requests", { status: 429, headers: { "Retry-After": "600" } });
        if (result === "error") return new Response("Error", { status: 500 });
        return new Response("Not found", { status: 404 });
      },
    },
  },
});
