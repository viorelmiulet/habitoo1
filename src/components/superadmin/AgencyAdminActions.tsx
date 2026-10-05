import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, ArchiveRestore, Check, FileUp, Pencil, Trash2 } from "lucide-react";
import { AgencyDetailsDialog } from "@/components/superadmin/AgencyDetailsDialog";
import { SubscriptionPicker } from "@/components/superadmin/SubscriptionPicker";
import { PropertyImportDialog } from "@/components/superadmin/PropertyImportDialog";
import { OrganizationDeletionDialog } from "@/components/superadmin/UserDeletionDialog";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { listSuperadminOrganizationIds } from "@/lib/account-deletion.functions";
import { listPlatformUsers } from "@/lib/superadmin-users.functions";
import { organizationDeletionBlock } from "@/lib/user-deletion";
import { approveRegistrationRequest } from "@/lib/registration-approval.functions";
import { PLAN_AGENT_LIMITS, PLAN_KEYS, PLAN_LABELS, PLAN_PRICES, normalizePlan, planAgentLimitLabel, planPriceLabel, type PlanKey } from "@/lib/plans";
import { SUBSCRIPTION_TERM_LABELS, type SubscriptionTerm } from "@/lib/subscription";
import { ORG_STATUS_LABELS } from "@/lib/superadmin-status";
import type { Tables } from "@/integrations/supabase/types";

type Org = Tables<"organizations">;
const selectableStatuses = ["active", "suspended"] as const;

/** Selector de plan cu salvare explicită și tariful aplicat, în funcție de termen. */
function PlanPicker({ plan, term, onSave, saving }: { plan: string; term: string | null; onSave: (plan: PlanKey) => void; saving: boolean }) {
  const [value, setValue] = useState<PlanKey>(normalizePlan(plan));
  const dirty = value !== normalizePlan(plan);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value} onValueChange={(v) => setValue(v as PlanKey)}>
        <SelectTrigger className="h-11 w-full sm:w-64"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PLAN_KEYS.map((k) => (
            <SelectItem key={k} value={k}>
              {PLAN_LABELS[k]} · {planAgentLimitLabel(k)} · {term === "12m" ? PLAN_PRICES[k].annualMonthly : PLAN_PRICES[k].monthly}€/lună
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">{planPriceLabel(value, term)}</span>
      <Button size="sm" variant="outline" className="h-11" disabled={!dirty || saving} onClick={() => onSave(value)}>Salvează planul</Button>
    </div>
  );
}

function useOrgMutations() {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const done = (msg: string) => { void queryClient.invalidateQueries({ queryKey: ["superadmin"] }); toast.success(msg); };
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("organizations").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => done("Agenția a fost actualizată."),
    onError: (e: Error) => toastError(e),
  });
  const saveSubscription = useMutation({
    mutationFn: async ({ id, term }: { id: string; term: SubscriptionTerm | null }) => {
      const { error } = await supabase.rpc("set_organization_subscription", { _org: id, _term: term as string });
      if (error) throw error;
    },
    onSuccess: (_r, vars) => done(vars.term ? `Termenul abonamentului a fost setat la ${SUBSCRIPTION_TERM_LABELS[vars.term]}.` : "Agenția rămâne fără termen (acces nelimitat)."),
    onError: (e: Error) => toastError(e),
  });
  const savePlan = useMutation({
    mutationFn: async ({ id, plan, previous }: { id: string; plan: PlanKey; previous: string }) => {
      const { error } = await supabase.from("organizations").update({ plan }).eq("id", id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({ organization_id: id, action: "organization.plan_changed", entity: "organizations", entity_id: id, old_values: { plan: previous }, new_values: { plan, agent_limit: PLAN_AGENT_LIMITS[plan] } });
    },
    onSuccess: () => done("Planul agenției a fost salvat."),
    onError: (e: Error) => toastError(e),
  });
  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("approve_organization", { _org: id });
      if (error) throw error;
    },
    onSuccess: () => done("Agenția a fost aprobată și are acces în aplicație."),
    onError: (e: Error) => toastError(e),
  });
  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from("organizations").update({ archived_at: archived ? new Date().toISOString() : null, archived_by: archived ? (me?.userId ?? null) : null }).eq("id", id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({ organization_id: id, actor_id: me?.userId ?? null, action: archived ? "organization.archived" : "organization.unarchived", entity: "organizations", entity_id: id, new_values: { archived } });
    },
    onSuccess: (_r, vars) => done(vars.archived ? "Agenția a fost arhivată." : "Agenția a fost reactivată."),
    onError: (e: Error) => toastError(e),
  });
  return { update, saveSubscription, savePlan, approve, setArchived, me };
}

/** Plan, abonament și stare — în cardul „Abonament și plan”. */
export function AgencySubscriptionControls({ org }: { org: Org }) {
  const { update, saveSubscription, savePlan, approve } = useOrgMutations();
  return (
    <div className="space-y-4">
      <PlanPicker plan={org.plan} term={org.subscription_term} onSave={(plan) => savePlan.mutate({ id: org.id, plan, previous: org.plan })} saving={savePlan.isPending} />
      <SubscriptionPicker key={`${org.id}-${org.subscription_term ?? "none"}-${org.subscription_expires_at ?? ""}`} term={org.subscription_term} onSave={(term) => saveSubscription.mutate({ id: org.id, term })} saving={saveSubscription.isPending} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Stare</span>
        <Select value={org.status} onValueChange={(v) => update.mutate({ id: org.id, patch: { status: v } })}>
          <SelectTrigger aria-label="Starea agenției" className="h-11 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {selectableStatuses.map((k) => <SelectItem key={k} value={k}>{ORG_STATUS_LABELS[k]}</SelectItem>)}
            {selectableStatuses.includes(org.status as "active" | "suspended") ? null : <SelectItem value={org.status}>{ORG_STATUS_LABELS[org.status] ?? org.status}</SelectItem>}
          </SelectContent>
        </Select>
        {org.status === "pending_approval" ? (
          <Button className="h-11" disabled={approve.isPending} onClick={() => approve.mutate(org.id)}><Check className="mr-1.5 size-4" />Aprobă</Button>
        ) : null}
      </div>
    </div>
  );
}

/** Acțiunile din antetul paginii de agenție: import, editare, arhivare, ștergere. */
export function AgencyHeaderActions({ org }: { org: Org }) {
  const { setArchived, me } = useOrgMutations();
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fetchPlatformUsers = useServerFn(listPlatformUsers);
  const fetchSuperadminOrgs = useServerFn(listSuperadminOrganizationIds);
  const platformUsers = useQuery({ queryKey: ["superadmin", "users"], queryFn: () => fetchPlatformUsers() });
  const superadminOrgs = useQuery({ queryKey: ["superadmin", "superadmin-orgs"], queryFn: () => fetchSuperadminOrgs() });
  const block = organizationDeletionBlock(org.id, me?.profile?.organization_id, superadminOrgs.data ?? []);
  const deleteBtn = (
    <Button variant="ghost" className="h-11 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={block !== null || !superadminOrgs.data} onClick={() => setDeleting(true)}>
      <Trash2 className="mr-1.5 size-4" />Șterge
    </Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" className="h-11" onClick={() => setImporting(true)}><FileUp className="mr-1.5 size-4" />Importă proprietăți</Button>
      <Button variant="outline" className="h-11" onClick={() => setEditing(true)}><Pencil className="mr-1.5 size-4" />Editează datele</Button>
      {org.archived_at ? (
        <Button variant="outline" className="h-11" disabled={setArchived.isPending} onClick={() => setArchived.mutate({ id: org.id, archived: false })}><ArchiveRestore className="mr-1.5 size-4" />Reactivează</Button>
      ) : (
        <Button variant="outline" className="h-11" disabled={setArchived.isPending} onClick={() => setArchiving(true)}><Archive className="mr-1.5 size-4" />Arhivează</Button>
      )}
      {block ? (
        <TooltipProvider><Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={block}>{deleteBtn}</span></TooltipTrigger><TooltipContent>{block}</TooltipContent></Tooltip></TooltipProvider>
      ) : deleteBtn}

      {editing ? <AgencyDetailsDialog org={org as never} onClose={() => setEditing(false)} /> : null}
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={`Arhivezi „${org.name}”?`}
        description="Datele agenției (proprietăți, utilizatori, lead-uri) NU se șterg. Agenția dispare din listele normale și membrii ei nu mai pot accesa aplicația până la reactivare."
        confirmLabel="Arhivează agenția"
        destructive
        onConfirm={async () => { await setArchived.mutateAsync({ id: org.id, archived: true }); setArchiving(false); }}
      />
      <OrganizationDeletionDialog organization={deleting ? { id: org.id, name: org.name } : null} users={platformUsers.data?.users ?? []} onClose={() => setDeleting(false)} />
      <PropertyImportDialog open={importing} onOpenChange={setImporting} organization={importing ? { id: org.id, name: org.name } : null} />
    </div>
  );
}

/** Aprobarea și respingerea cererilor de înscriere (aceleași apeluri ca înainte). */
export function useRegistrationRequestActions() {
  const queryClient = useQueryClient();
  const approveRequest = useMutation({
    mutationFn: async (id: string) => approveRegistrationRequest({ data: { requestId: id } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast.success(result.emailSent ? "Cererea a fost aprobată — agenția a fost creată, iar solicitantul a primit email de confirmare." : "Cererea a fost aprobată — agenția a fost creată (emailul de confirmare nu a putut fi trimis).");
    },
    onError: (e: Error) => toastError(e),
  });
  const rejectRequest = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_registration_request", { _request_id: id, _reason: reason || undefined });
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["superadmin"] }); toast.success("Cererea a fost respinsă."); },
    onError: (e: Error) => toastError(e),
  });
  return { approveRequest, rejectRequest };
}
