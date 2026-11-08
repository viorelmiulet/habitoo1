import { createFileRoute } from "@tanstack/react-router";
import { ExtensionConnectPanel } from "@/components/app/ExtensionConnectPanel";

export const Route = createFileRoute("/_authenticated/app/extensie/conectare")({
  validateSearch: (s: Record<string, unknown>) => ({ nonce: typeof s.nonce === "string" ? s.nonce : undefined }),
  head: () => ({ meta: [{ title: "Conectează extensia Habitoo Captură" }, { name: "description", content: "Permite extensiei Chrome Habitoo Captură accesul la contul tău Habitoo." }, { name: "robots", content: "noindex" }] }),
  component: ConnectExtensionPage,
});

function ConnectExtensionPage() {
  const { nonce } = Route.useSearch();
  return <ExtensionConnectPanel nonce={nonce} />;
}
