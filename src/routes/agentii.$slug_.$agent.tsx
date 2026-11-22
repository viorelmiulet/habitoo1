import { createFileRoute, redirect } from "@tanstack/react-router";

// Former agent profile pages: agent details now live on each offer page, so the address moves permanently to the agency.
export const Route = createFileRoute("/agentii/$slug_/$agent")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/agentii/$slug", params: { slug: params.slug }, statusCode: 301 });
  },
});
