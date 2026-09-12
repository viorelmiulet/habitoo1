import { createFileRoute, redirect } from "@tanstack/react-router";

// Calea reală a paginii este /confidentialitate; această rută păstrează
// funcțională forma lungă des folosită („politica-de-confidentialitate").
export const Route = createFileRoute("/politica-de-confidentialitate")({
  beforeLoad: () => {
    throw redirect({ to: "/confidentialitate", statusCode: 301 });
  },
});
