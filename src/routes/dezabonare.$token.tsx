import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmUnsubscribe, getUnsubscribePreview } from "@/lib/outreach-unsubscribe.functions";

export const Route = createFileRoute("/dezabonare/$token")({
  loader: ({ params }) => getUnsubscribePreview({ data: { token: params.token.slice(0, 200) } }),
  head: () => ({
    meta: [
      { title: "Dezabonare — Habitoo" },
      { name: "description", content: "Dezabonare de la mesajele Habitoo." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Dezabonare — Habitoo" },
      { property: "og:description", content: "Dezabonare de la mesajele Habitoo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const preview = Route.useLoaderData();
  const { token } = Route.useParams();
  const [state, setState] = useState<"idle" | "busy" | "done" | "invalid" | "limited">("idle");
  async function submit() {
    setState("busy");
    try {
      const r = await confirmUnsubscribe({ data: { token } });
      setState(r.status === "ok" ? "done" : r.status === "rate_limited" ? "limited" : "invalid");
    } catch { setState("idle"); }
  }
  const limited = state === "limited" || preview.status === "rate_limited";
  const invalid = state === "invalid" || preview.status === "invalid";
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">Dezabonare</h1>
        {limited ? <p className="mt-4 text-muted-foreground">Prea multe încercări. Reveniți în câteva minute.</p>
          : invalid ? <p className="mt-4 text-muted-foreground">Link invalid</p>
          : state === "done" ? <p className="mt-4 text-foreground">Adresa a fost scoasă din listă. Nu veți mai primi mesaje de la Habitoo.</p>
          : preview.status === "ok" && <>
            <p className="mt-4 text-muted-foreground">Adresa <span className="font-medium text-foreground">{preview.maskedEmail}</span> nu va mai primi mesaje de la Habitoo.</p>
            <Button className="mt-6 w-full" onClick={submit} disabled={state === "busy"}>Dezabonează-mă</Button>
          </>}
      </div>
    </main>
  );
}
