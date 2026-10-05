import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout pentru secțiunea publică `/agentii`: lista e în `agentii.index.tsx`,
 * profilul unei agenții în `agentii.$slug.tsx`.
 */
export const Route = createFileRoute("/agentii")({
  component: () => <Outlet />,
});
