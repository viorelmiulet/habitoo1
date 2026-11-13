import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { Button } from "@/components/ui/button";
import { ActiveMatchAlertList, STATUS_LABEL } from "@/components/app/active-matching/ActiveMatchAlerts";
import type { AlertStatus } from "@/lib/active-matching/plan";

export const Route = createFileRoute("/_authenticated/app/potriviri-noi")({
  head: () => { const title = "Habitoo CRM — potriviri noi"; const description = "Proprietăți noi sau mai ieftine potrivite cu cererile clienților tăi, cu mesaj pregătit."; const head = appHead(title); return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
  component: ActiveMatchesPage,
});

const FILTERS: (AlertStatus | "all")[] = ["new", "sent", "ignored", "all"];

function ActiveMatchesPage() {
  const [status, setStatus] = useState<AlertStatus | "all">("new");
  return (
    <>
      <PageHeader title="Potriviri noi" description="Te anunțăm când o proprietate nouă sau mai ieftină se potrivește cu o cerere. Tu decizi ce trimiți clientului." />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrează după stare">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={status === f ? "default" : "outline"} onClick={() => setStatus(f)}>
            {f === "all" ? "Toate" : STATUS_LABEL[f]}
          </Button>
        ))}
      </div>
      <ActiveMatchAlertList status={status} />
    </>
  );
}
