import { createFileRoute, redirect } from "@tanstack/react-router";

// Calea canonică a paginii este /politica-de-confidentialitate; această rută
// păstrează funcțională forma scurtă folosită anterior.
export const Route = createFileRoute("/confidentialitate")({
  beforeLoad: () => {
    throw redirect({ to: "/politica-de-confidentialitate", statusCode: 301 });
  },
});
