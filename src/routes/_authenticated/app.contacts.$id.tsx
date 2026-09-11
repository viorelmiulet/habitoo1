import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Eye,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  StickyNote,
  Target,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { DetailSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { DocumentsPanel } from "@/components/app/DocumentsPanel";
import { ActivityDialog } from "@/components/app/ActivityDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  requestKindLabels,
} from "@/lib/labels";
import { requestStatusLabels, requestStatusTone, activityStatusTone } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/app/contacts/$id")({
  component: ContactDetailPage,
});

type ActivityDefaults = { kind: "call" | "viewing" | "meeting" | "task" | "email" | "followup" | "note"; title?: string };

function ContactDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const [note, setNote] = useState("");
  const [activityDialog, setActivityDialog] = useState<ActivityDefaults | null>(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      const [contact, activities, leads, requests, properties, leadEventsRaw, agents] = await Promise.all([
        supabase.from("contacts").select("*").eq("id", id).maybeSingle(),
        supabase.from("activities").select("*").eq("contact_id", id).order("starts_at", { ascending: false }),
        supabase.from("leads").select("*").eq("contact_id", id),
        supabase.from("requests").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
        supabase.from("properties").select("*").eq("owner_contact_id", id),
        supabase.from("leads").select("id").eq("contact_id", id),
        supabase.from("profiles").select("id,full_name"),
      ]);
      if (contact.error) throw contact.error;
      const leadIds = (leadEventsRaw.data ?? []).map((l) => l.id);
      const leadEvents =
        leadIds.length > 0
          ? await supabase.from("lead_events").select("*").in("lead_id", leadIds).order("created_at", { ascending: false })
          : { data: [] as never[] };
      return {
        contact: contact.data,
        activities: activities.data ?? [],
        leads: leads.data ?? [],
        requests: requests.data ?? [],
        properties: properties.data ?? [],
        leadEvents: leadEvents.data ?? [],
        agents: agents.data ?? [],
      };
    },
  });

  const contact = data?.contact;
  const agentName = (aid: string | null) => data?.agents.find((a) => a.id === aid)?.full_name ?? "Neasignat";

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
        status: "done",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["contact", id] });
      toast.success("Nota a fost salvată în istoric.");
    },
    onError: (e: Error) => toastError(e),
  });

  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("contacts").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEdit(null);
      queryClient.invalidateQueries({ queryKey: ["contact", id] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const [requestForm, setRequestForm] = useState({ title: "", kind: "buy", budget_min: "", budget_max: "" });
  const createRequest = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      const num = (v: string) => (v.trim() === "" ? null : Number(v));
      const { error } = await supabase.from("requests").insert({
        organization_id: user.organization.id,
        assigned_to: user.userId,
        created_by: user.userId,
        contact_id: id,
        title: requestForm.title || `Cerere ${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim(),
        kind: requestForm.kind as never,
        budget_min: num(requestForm.budget_min),
        budget_max: num(requestForm.budget_max),
        status: "new",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRequestDialogOpen(false);
      setRequestForm({ title: "", kind: "buy", budget_min: "", budget_max: "" });
      queryClient.invalidateQueries({ queryKey: ["contact", id] });
      toast.success("Cererea a fost creată.");
    },
    onError: (e: Error) => toastError(e),
  });

  const timeline = useMemo(() => {
    if (!data) return [];
    type Item = { at: string; kind: string; label: string; icon: typeof StickyNote };
    const items: Item[] = [];
    for (const a of data.activities) {
      items.push({ at: a.starts_at, kind: a.kind, label: `${activityKindLabels[a.kind] ?? a.kind}: ${a.title}`, icon: a.kind === "note" ? StickyNote : a.kind === "viewing" ? Eye : CalendarClock });
    }
    for (const r of data.requests) {
      items.push({ at: r.created_at, kind: "request", label: `Cerere creată: ${r.title}`, icon: Target });
    }
    for (const e of data.leadEvents as { created_at: string; to_stage: string }[]) {
      items.push({ at: e.created_at, kind: "lead", label: `Lead → ${leadStageLabels[e.to_stage] ?? e.to_stage}`, icon: UserRound });
    }
    return items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  }, [data]);

  if (isLoading) return <DetailSkeleton />;
  if (!contact) {
    return (
      <EmptyState
        icon={UserRound}
        title="Contactul nu a fost găsit"
        action={<Button asChild size="sm"><Link to="/app/contacts">Înapoi la contacte</Link></Button>}
      />
    );
  }

  return (
    <>
      <PageHeader
        backTo="/app/contacts"
        backLabel="Contacte"
        eyebrow="Contact"
        title={`${contact.first_name} ${contact.last_name}`}
        description={contact.company || contactTypeLabels[contact.type]}
        actions={
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
        }
      />

      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/60">
        <div className="flex flex-wrap items-start gap-4">
          <UserAvatar
            name={`${contact.first_name} ${contact.last_name}`}
            className="size-14 text-base"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="primary">{contactTypeLabels[contact.type] ?? contact.type}</StatusBadge>
              <StatusBadge tone={contact.status === "active" ? "success" : "neutral"}>
                {contact.status === "active" ? "Activ" : "Inactiv"}
              </StatusBadge>
              {contact.gdpr_consent ? <StatusBadge tone="success">Consimțământ GDPR</StatusBadge> : null}
            </div>
            <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Telefon</p>
                <p>{contact.phone ?? "—"}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="truncate">{contact.email ?? "—"}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Agent</p>
                <p className="flex items-center gap-1.5">
                  <UserAvatar name={agentName(contact.assigned_to)} className="size-6 text-[10px]" />
                  <span className="truncate">{agentName(contact.assigned_to)}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Adăugat</p>
                <p>{formatDate(contact.created_at)}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {contact.phone ? (
              <>
                <a
                  href={`tel:${contact.phone}`}
                  className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Phone className="size-4" aria-hidden /> Sună
                </a>
                <a
                  href={`https://wa.me/${contact.phone.replace(/[^\d]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <MessageCircle className="size-4" aria-hidden /> WhatsApp
                </a>
              </>
            ) : null}
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Mail className="size-4" aria-hidden /> Email
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => setActivityDialog({ kind: "meeting", title: "Activitate" })}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CalendarClock className="size-4" aria-hidden /> Activitate
            </button>
            <button
              type="button"
              onClick={() => setActivityDialog({ kind: "task", title: "Task" })}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-4" aria-hidden /> Task
            </button>
            <button
              type="button"
              onClick={() => setActivityDialog({ kind: "viewing", title: "Vizionare" })}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Eye className="size-4" aria-hidden /> Vizionare
            </button>
            <button
              type="button"
              onClick={() => setRequestDialogOpen(true)}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Target className="size-4" aria-hidden /> Cerere
            </button>
          </div>
        </div>
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
                <Input id={key} value={edit[key] ?? ""} onChange={(e) => setEdit((d) => ({ ...(d ?? {}), [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea id="notes" rows={3} value={edit.notes ?? ""} onChange={(e) => setEdit((d) => ({ ...(d ?? {}), notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEdit(null)}>Anulează</Button>
            <Button type="submit" disabled={save.isPending}>Salvează</Button>
          </div>
        </form>
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="properties">Proprietăți ({data?.properties.length ?? 0})</TabsTrigger>
          <TabsTrigger value="requests">Cereri ({data?.requests.length ?? 0})</TabsTrigger>
          <TabsTrigger value="leads">Lead-uri ({data?.leads.length ?? 0})</TabsTrigger>
          <TabsTrigger value="activities">Activități</TabsTrigger>
          <TabsTrigger value="viewings">Vizionări</TabsTrigger>
          <TabsTrigger value="documents">Documente</TabsTrigger>
          <TabsTrigger value="notes">Note</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="panel space-y-2 p-5 text-sm">
          <p><span className="text-muted-foreground">Sursă:</span> {contact.source ?? "—"}</p>
          <p><span className="text-muted-foreground">Companie:</span> {contact.company ?? "—"}</p>
          <p><span className="text-muted-foreground">Etichete:</span> {(contact.tags ?? []).join(", ") || "—"}</p>
          <p><span className="text-muted-foreground">Note:</span> {contact.notes ?? "—"}</p>
        </TabsContent>

        <TabsContent value="properties">
          <div className="panel overflow-hidden">
            {(data?.properties.length ?? 0) === 0 ? (
              <EmptyState title="Nicio proprietate deținută" />
            ) : (
              <ul className="divide-y divide-border">
                {data?.properties.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Link to="/app/properties/$id" params={{ id: p.id }} className="min-w-0 flex-1 truncate font-medium hover:text-primary">
                      {p.title}
                    </Link>
                    <StatusBadge tone={propertyStatusTone[p.status]}>{propertyStatusLabels[p.status]}</StatusBadge>
                    <span className="w-28 text-right">{formatMoney(p.price, p.currency)}</span>
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
                    <Link to="/app/requests/$id" params={{ id: r.id }} className="min-w-0 flex-1 truncate font-medium hover:text-primary">
                      {r.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">{requestKindLabels[r.kind]}</span>
                    <StatusBadge tone={requestStatusTone[r.status] ?? "neutral"}>{requestStatusLabels[r.status] ?? r.status}</StatusBadge>
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

        <TabsContent value="activities">
          <div className="panel overflow-hidden">
            {(data?.activities.length ?? 0) === 0 ? (
              <EmptyState title="Nicio activitate" />
            ) : (
              <ul className="divide-y divide-border">
                {data?.activities.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <StatusBadge tone={activityStatusTone[a.status] ?? "neutral"}>{activityKindLabels[a.kind]}</StatusBadge>
                    <span className="min-w-0 flex-1">{a.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="viewings">
          <div className="panel overflow-hidden">
            {(data?.activities.filter((a) => a.kind === "viewing").length ?? 0) === 0 ? (
              <EmptyState title="Nicio vizionare" />
            ) : (
              <ul className="divide-y divide-border">
                {data?.activities.filter((a) => a.kind === "viewing").map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <StatusBadge tone={activityStatusTone[a.status] ?? "neutral"}>{a.status}</StatusBadge>
                    <span className="min-w-0 flex-1">{a.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents">
          {user?.organization?.id ? (
            <DocumentsPanel entityType="contact" entityId={id} orgId={user.organization.id} />
          ) : null}
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <div className="panel space-y-3 p-5">
            <Label htmlFor="note">Adaugă notă</Label>
            <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: discuție telefonică, caută 3 camere în Cluj…" />
            <div className="flex justify-end">
              <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                Salvează nota
              </Button>
            </div>
          </div>
          <div className="panel overflow-hidden">
            {(data?.activities.filter((a) => a.kind === "note").length ?? 0) === 0 ? (
              <EmptyState icon={FileText} title="Nicio notă" />
            ) : (
              <ul className="divide-y divide-border">
                {data?.activities.filter((a) => a.kind === "note").map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <p>{a.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          <div className="panel overflow-hidden">
            {timeline.length === 0 ? (
              <EmptyState title="Niciun eveniment" />
            ) : (
              <ul className="divide-y divide-border">
                {timeline.map((t, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <t.icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">{t.label}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(t.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {user?.organization?.id && activityDialog ? (
        <ActivityDialog
          open={Boolean(activityDialog)}
          onOpenChange={(open) => !open && setActivityDialog(null)}
          orgId={user.organization.id}
          userId={user.userId}
          defaults={{ contactId: id, kind: activityDialog.kind, title: activityDialog.title }}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["contact", id] })}
        />
      ) : null}

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerere nouă pentru {contact.first_name} {contact.last_name}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createRequest.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="req_title">Titlu</Label>
              <Input id="req_title" value={requestForm.title} onChange={(e) => setRequestForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex: caută 2 camere Centru" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tip</Label>
                <Select value={requestForm.kind} onValueChange={(v) => setRequestForm((f) => ({ ...f, kind: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(requestKindLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div />
              <div className="space-y-2">
                <Label htmlFor="budget_min">Buget minim</Label>
                <Input id="budget_min" type="number" value={requestForm.budget_min} onChange={(e) => setRequestForm((f) => ({ ...f, budget_min: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget_max">Buget maxim</Label>
                <Input id="budget_max" type="number" value={requestForm.budget_max} onChange={(e) => setRequestForm((f) => ({ ...f, budget_max: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRequestDialogOpen(false)}>Renunță</Button>
              <Button type="submit" disabled={createRequest.isPending}>Salvează</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
