import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { InlineLoading } from "@/components/app/LoadingState";
import {
  assignUnmatchedStoriaMessage,
  listUnmatchedStoriaMessages,
  type UnmatchedStoriaMessage,
} from "@/lib/portals/storia-unmatched.functions";
import { listOrgPropertiesForPortals, listPortalOrganizations } from "@/lib/portals.functions";

const NO_PROPERTY = "__none__";

function AssignRow({
  message,
  organizations,
  onDone,
}: {
  message: UnmatchedStoriaMessage;
  organizations: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [orgId, setOrgId] = useState("");
  const [propertyId, setPropertyId] = useState(NO_PROPERTY);
  const [busy, setBusy] = useState(false);
  const listProperties = useServerFn(listOrgPropertiesForPortals);
  const assign = useServerFn(assignUnmatchedStoriaMessage);
  const properties = useQuery({
    queryKey: ["storia-unmatched-properties", orgId],
    queryFn: () => listProperties({ data: { organizationId: orgId, limit: 50 } }),
    enabled: Boolean(orgId),
  });

  async function submit() {
    setBusy(true);
    try {
      await assign({
        data: {
          id: message.id,
          organizationId: orgId,
          propertyId: propertyId === NO_PROPERTY ? null : propertyId,
        },
      });
      toast.success("Mesajul a fost atribuit agenției.");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Atribuirea a eșuat.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {message.senderName ?? "Contact necunoscut"}
          <span className="ml-2 text-xs text-muted-foreground">
            anunț „{message.adRef ?? "—"}” · {new Date(message.sentAt).toLocaleString("ro-RO")}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {[message.senderPhone, message.senderEmail].filter(Boolean).join(" · ") || "fără contact"}
        </p>
      </div>
      {message.body ? (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{message.body}</p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={orgId} onValueChange={(v) => { setOrgId(v); setPropertyId(NO_PROPERTY); }}>
          <SelectTrigger className="sm:w-64" aria-label="Agenția">
            <SelectValue placeholder="Alege agenția" />
          </SelectTrigger>
          <SelectContent>
            {organizations.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={propertyId} onValueChange={setPropertyId} disabled={!orgId}>
          <SelectTrigger className="sm:w-72" aria-label="Oferta">
            <SelectValue placeholder="Oferta (opțional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PROPERTY}>Fără ofertă</SelectItem>
            {(properties.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.title}{p.city ? ` · ${p.city}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!orgId || busy} onClick={submit}>
          {busy ? "Se atribuie…" : "Atribuie"}
        </Button>
      </div>
    </li>
  );
}

/** Mesaje Storia fără anunț recunoscut, vizibile doar SuperAdminului. */
export function StoriaUnmatchedCard() {
  const qc = useQueryClient();
  const list = useServerFn(listUnmatchedStoriaMessages);
  const listOrgs = useServerFn(listPortalOrganizations);
  const messages = useQuery({ queryKey: ["storia-unmatched"], queryFn: () => list() });
  const orgs = useQuery({ queryKey: ["storia-unmatched-orgs"], queryFn: () => listOrgs() });

  return (
    <section className="panel">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Mesaje Storia nepotrivite</h2>
        <p className="text-xs text-muted-foreground">
          Mesaje primite pentru anunțuri pe care nu le-am recunoscut. Nu ajung la nicio agenție până nu le atribui.
        </p>
      </header>
      {messages.isLoading ? (
        <div className="p-5"><InlineLoading label="Se încarcă mesajele…" /></div>
      ) : messages.isError ? (
        <p className="p-5 text-sm text-destructive">Lista nu a putut fi încărcată.</p>
      ) : (messages.data ?? []).length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">Nu există mesaje nepotrivite.</p>
      ) : (
        <ul className="divide-y divide-border">
          {(messages.data ?? []).map((m) => (
            <AssignRow
              key={m.id}
              message={m}
              organizations={orgs.data ?? []}
              onDone={() => qc.invalidateQueries({ queryKey: ["storia-unmatched"] })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
