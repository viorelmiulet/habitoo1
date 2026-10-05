import { createFileRoute, Outlet } from "@tanstack/react-router";
import { appHead } from "@/components/app/app-head";

export const Route = createFileRoute("/_authenticated/app/team")({
  head: () => appHead("Habitoo CRM — echipă"),
  component: () => <Outlet />,
});
