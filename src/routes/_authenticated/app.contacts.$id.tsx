import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Mail, MessageCircle, Phone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import {
  activityKindLabels,
  contactTypeLabels,
  leadStageLabels,
  propertyStatusLabels,
  propertyStatusTone,
} from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/app/contacts/$id")({
  component: ContactDetailPage,
});

function ContactDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      const [contact, activities, leads, requests, properties] = await Promise.all([
        supabase.from("contacts").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("activities")
          .select("*")
          .eq("contact_id", id)
          .order("starts_at", { ascending: false }),
        supabase.from("leads").select("*").eq("contact_id", id),
        supabase.from("requests").select("*").eq("contact_id", id),
        supabase.from("properties").select("*").eq("owner_contact_id", id),
      ]);
      if (contact.error) throw contact.error;
      return {
        contact: contact.data,
        activities: activities.data ?? [],
        leads: leads.data ?? [],
        requests: requests.data ?? [],
        properties: properties.data ?? [],
      };
    },
  });

  const contact = data?.contact;

  const addNote = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      const { error } = await supabase.from("activities").insert({
        organization_id: user.organization.id,
        contact_id: id,
        assigned_to: user.userId,
        created_by: user.userId,
        kind: "note",
        title: note,
        starts_at: new Date().toISOString(),
        done: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["contact", id] });
      toast.success("Nota a fost salvată în istoric.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("contacts")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEdit(null);
      queryClient.invalidateQueries({ queryKey: ["contact", id] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact actualizat.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Se încarcă contactul…</p>;
  if (!contact) {
    return (
      <EmptyState
        icon={UserRound}
        title="Contactul nu a fost găsit"
        action={
          <Button asChild size="sm">
            <Link to="/app/contacts">Înapoi la contacte</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
        <Link to="/app/contacts">
          <ArrowLeft className="size-4" /> Contacte
        </Link>
      </Button>

      <PageHeader
        title={`${contact.first_name} ${contact.last_name}`}
        description={contact.company || contactTypeLabels[contact.type]}
        actions={
          <>
            {contact.phone ? (
              <>
                <Button size="sm" variant="outline" asChild>
                  <a href={`tel:${contact.phone}`}>
                    <Phone className="size-4" /> Apel
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`https://wa.me/${contact.phone.replace(/[^\d]/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                </Button>
              </>
            ) : null}
            {contact.email ? (
              <Button size="sm" variant="outline" asChild>
                <a href={`mailto:${contact.email}`}>
                  <Mail className="size-4" /> Email
                </a>
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() =>
                setEdit({
                  first_name: contact.first_name,
                  last_name: contact.last_name,
                  phone: contact.phone ?? "",
                  email: contact.email ?? "",
                  company: contact.company ?? "",
                  notes: contact.notes ?? "",
                })
              }
            >
              Editează
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <StatusBadge tone="primary">{contactTypeLabels[contact.type] ?? contact.type}</StatusBadge>
        <span>{contact.phone ?? "fără telefon"}</span>
        <span>{contact.email ?? "fără email"}</span>
        <span>Adăugat {formatDate(contact.created_at)}</span>
        {contact.gdpr_consent ? <StatusBadge tone="success">Consimțământ GDPR</StatusBadge> : null}
      </div>

      {edit ? (
        <form
          className="panel space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              first_name: edit.first_name,
              last_name: edit.last_name,
              phone: edit.phone || null,
              email: edit.email || null,
              company: edit.company || null,
              notes: edit.notes || null,
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["first_name", "Prenume"],
              ["last_name", "Nume"],
              ["phone", "Telefon"],
              ["email", "Email"],
              ["company", "Companie"],
            ].map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  value={edit[key] ?? ""}
                  onChange={(e) => setEdit((d) => ({ ...(d ?? {}), [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea
              id="notes"
              rows={3}
              value={edit.notes ?? ""}
              onChange={(e) => setEdit((d) => ({ ...(d ?? {}), notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEdit(null)}>
              Anulează
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Salvează
            </Button>
          </div>
        </form>
      ) : null}

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Istoric ({data?.activities.length ?? 0})</TabsTrigger>
          <TabsTrigger value="requests">Cereri ({data?.requests.length ?? 0})</TabsTrigger>
          <TabsTrigger value="leads">Lead-uri ({data?.leads.length ?? 0})</TabsTrigger>
          <TabsTrigger value="properties">Proprietăți ({data?.properties.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          <div className="panel space-y-3 p-5">
            <Label htmlFor="note">Adaugă notă în istoric</Label>
            <Textarea
              id="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: discuție telefonică, caută 3 camere în Cluj…"
            />
            <div className="flex justify-end">
              <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                Salvează nota
              </Button>
            </div>
          </div>

          <div className="panel overflow-hidden">
            {(data?.activities.length ?? 0) === 0 ? (
              <EmptyState title="Niciun element în istoric" />
            ) : (
              <ul className="divide-y divide-border">
                {data?.activities.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <StatusBadge tone={a.done ? "success" : "primary"}>
                      {activityKindLabels[a.kind]}
                    </StatusBadge>
                    <span className="min-w-0 flex-1">{a.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="requests">
          <div className="panel overflow-hidden">
            {(data?.requests.length ?? 0) === 0 ? (
              <EmptyState title="Nicio cerere înregistrată" />
            ) : (
              <ul className="divide-y divide-border">
                {data?.requests.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatMoney(r.budget_min, r.currency)} – {formatMoney(r.budget_max, r.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="leads">
          <div className="panel overflow-hidden">
            {(data?.leads.length ?? 0) === 0 ? (
              <EmptyState title="Niciun lead asociat" />
            ) : (
              <ul className="divide-y divide-border">
                {data?.leads.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <StatusBadge tone="info">{leadStageLabels[l.stage]}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="properties">
          <div className="panel overflow-hidden">
            {(data?.properties.length ?? 0) === 0 ? (
              <EmptyState title="Nicio proprietate deținută" />
            ) : (
              <ul className="divide-y divide-border">
                {data?.properties.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Link
                      to="/app/properties/$id"
                      params={{ id: p.id }}
                      className="min-w-0 flex-1 truncate font-medium hover:text-primary"
                    >
                      {p.title}
                    </Link>
                    <StatusBadge tone={propertyStatusTone[p.status]}>
                      {propertyStatusLabels[p.status]}
                    </StatusBadge>
                    <span className="w-28 text-right">{formatMoney(p.price, p.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
