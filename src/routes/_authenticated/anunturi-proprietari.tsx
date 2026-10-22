import { createFileRoute, redirect } from "@tanstack/react-router";

// Pagina veche a fost mutată în aplicație, în modulul „Anunțuri particulari”.
export const Route = createFileRoute("/_authenticated/anunturi-proprietari")({
  beforeLoad: () => {
    throw redirect({ to: "/app/anunturi-particulari" });
  },
});
