import { createFileRoute, redirect } from "@tanstack/react-router";

// Statisticile s-au mutat în pagina „Agenții”; linkurile vechi redirecționează.
export const Route = createFileRoute("/_authenticated/superadmin/statistici")({
  beforeLoad: () => { throw redirect({ to: "/superadmin/agencies", replace: true }); },
});
