// GET /api/public/agent-avatar/<agencySlug>/<agentSlug> — poza unui agent al unei agenții vizibile; 404 în rest.
import { createFileRoute } from "@tanstack/react-router";

const SLUG = /^[a-z0-9-]{1,200}$/;
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });

export const Route = createFileRoute("/api/public/agent-avatar/$agency/$agent")({
  server: { handlers: { GET: async ({ params }) => {
    if (!SLUG.test(params.agency) || !SLUG.test(params.agent)) return notFound();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: path } = await supabaseAdmin.rpc("public_agent_avatar_path", { _agency_slug: params.agency, _agent_slug: params.agent });
    if (!path) return notFound();
    const { data: blob, error } = await supabaseAdmin.storage.from("avatars").download(path);
    if (error || !blob) return notFound();
    const type = blob.type && blob.type.startsWith("image/") ? blob.type : "application/octet-stream";
    return new Response(await blob.arrayBuffer(), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
  } } },
});
