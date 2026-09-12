import { createFileRoute, redirect } from "@tanstack/react-router";

// Calea reală a paginii este /termeni; această rută păstrează funcțională
// forma lungă des folosită („termeni-si-conditii").
export const Route = createFileRoute("/termeni-si-conditii")({
  beforeLoad: () => {
    throw redirect({ to: "/termeni", statusCode: 301 });
  },
});
