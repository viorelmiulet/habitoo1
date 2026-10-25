import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { propertyTypeLabels, transactionLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/format";
import { appHead } from "@/components/app/app-head";
import {
  COMMISSION_CURRENCIES,
  canEditCommission,
  commissionPayerLabels,
  commissionStatusLabels,
  commissionTotals,
  emptyCommissionForm,
  prefillFromContract,
  prefillFromProperty,
  toCommissionPayload,
  type CommissionForm,
} from "@/lib/commissions";

const searchSchema = z.object({
  nou: z.coerce.boolean().optional(),
  proprietate: z.string().uuid().optional(),
  contract: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/app/comisioane")({
  validateSearch: searchSchema,
  head: () => appHead("Habitoo CRM — comisioane"),
  component: CommissionsPage,
});

const NONE = "__none";
const ALL = "__all";
const statusTone: Record<string, "warning" | "success" | "neutral"> = {
  pending: "warning",
  collected: "success",
  cancelled: "neutral",
};
const PROPERTY_FIELDS =
  "id,reference,title,city,transaction_kind,property_type,owner_contact_id,price,sale_price,rent_price,currency,sale_currency,rent_currency,commission,assigned_to";

function CommissionsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;
  const userId = user?.userId ?? "";
  const isAdmin = user?.role === "agency_admin";

  const [filters, setFilters] = useState({ from: "", to: "", agent: ALL, kind: ALL, ptype: ALL, status: ALL });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CommissionForm>(() => emptyCommissionForm(""));
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refs = useQuery({
    queryKey: ["commission-refs", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [profiles, properties, contacts] = await Promise.all([
        supabase.from("profiles").select("id,full_name").eq("organization_id", orgId!).order("full_name"),
        supabase.from("properties").select("id,reference,title,city").eq("organization_id", orgId!).order("created_at", { ascending: false }).limit(1000),
        supabase.from("contacts").select("id,first_name,last_name").eq("organization_id", orgId!).order("first_name").limit(2000),
      ]);
      return { profiles: profiles.data ?? [], properties: properties.data ?? [], contacts: contacts.data ?? [] };
    },
  });

  const list = useQuery({
    queryKey: ["commissions", orgId, filters],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase.from("commissions").select("*").order("transaction_date", { ascending: false }).limit(2000);
      if (filters.from) q = q.gte("transaction_date", filters.from);
      if (filters.to) q = q.lte("transaction_date", filters.to);
      if (isAdmin && filters.agent !== ALL) q = q.eq("agent_id", filters.agent);
      if (filters.kind !== ALL) q = q.eq("transaction_kind", filters.kind as "sale" | "rent");
      if (filters.ptype !== ALL) q = q.eq("property_type", filters.ptype);
      if (filters.status !== ALL) q = q.eq("status", filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Precompletare din proprietate sau contract (?nou=1&proprietate=… / &contract=…).
  useEffect(() => {
    if (!search.nou || !userId) return;
    let cancelled = false;
    (async () => {
      let next = emptyCommissionForm(userId);
      if (search.contract) {
        const { data: c } = await supabase.from("contracts").select("property_id,contact_id,price,currency,commission").eq("id", search.contract).maybeSingle();
        if (c) {
          const { data: p } = c.property_id
            ? await supabase.from("properties").select(PROPERTY_FIELDS).eq("id", c.property_id).maybeSingle()
            : { data: null };
          next = prefillFromContract(next, c, p);
        }
      } else if (search.proprietate) {
        const { data: p } = await supabase.from("properties").select(PROPERTY_FIELDS).eq("id", search.proprietate).maybeSingle();
        if (p) {
          next = prefillFromProperty(next, p);
          if (isAdmin && p.assigned_to) next.agent_id = p.assigned_to;
        }
      }
      if (cancelled) return;
      setEditingId(null);
      setForm(next);
      setOpen(true);
      navigate({ to: "/app/comisioane", search: {}, replace: true });
    })();
    return () => { cancelled = true; };
  }, [search.nou, search.contract, search.proprietate, userId, isAdmin, navigate]);

  const names = useMemo(() => new Map((refs.data?.profiles ?? []).map((p) => [p.id, p.full_name ?? "—"])), [refs.data]);
  const props = useMemo(() => new Map((refs.data?.properties ?? []).map((p) => [p.id, p])), [refs.data]);
  const rows = list.data ?? [];
  const totals = commissionTotals(rows);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Agenția nu este configurată.");
      const payload = toCommissionPayload({ ...form, agent_id: isAdmin ? form.agent_id : userId });
      if (!payload.agent_id) throw new Error("Alege agentul.");
      if (editingId) {
        const { error } = await supabase.from("commissions").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("commissions").insert({ ...payload, organization_id: orgId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Comision actualizat" : "Comision adăugat");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["commissions"] });
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comision șters");
      qc.invalidateQueries({ queryKey: ["commissions"] });
    },
    onError: toastError,
  });

  const openNew = () => { setEditingId(null); setForm(emptyCommissionForm(userId)); setOpen(true); };
  const openEdit = (r: (typeof rows)[number]) => {
    setEditingId(r.id);
    setForm({
      agent_id: r.agent_id,
      transaction_date: r.transaction_date,
      transaction_kind: r.transaction_kind,
      property_type: r.property_type,
      property_id: r.property_id,
      contact_id: r.contact_id,
      location_text: r.location_text ?? "",
      transaction_value: String(r.transaction_value),
      agency_commission: String(r.agency_commission),
      agent_amount: String(r.agent_amount),
      currency: r.currency as CommissionForm["currency"],
      payer: r.payer as CommissionForm["payer"],
      status: r.status as CommissionForm["status"],
      collected_at: r.collected_at ?? "",
      notes: r.notes ?? "",
    });
    setOpen(true);
  };
  const set = <K extends keyof CommissionForm>(k: K, v: CommissionForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Comisioane"
        description={isAdmin ? "Toate comisioanele agenției." : "Comisioanele tale."}
        actions={<Button onClick={openNew}><Plus className="size-4" /> Adaugă comision</Button>}
      />

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div><Label>De la</Label><Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
        <div><Label>Până la</Label><Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
        {isAdmin ? (
          <FilterSelect label="Agent" value={filters.agent} onChange={(v) => setFilters({ ...filters, agent: v })}
            options={(refs.data?.profiles ?? []).map((p) => [p.id, p.full_name ?? "—"])} />
        ) : null}
        <FilterSelect label="Tranzacție" value={filters.kind} onChange={(v) => setFilters({ ...filters, kind: v })} options={Object.entries(transactionLabels)} />
        <FilterSelect label="Tip proprietate" value={filters.ptype} onChange={(v) => setFilters({ ...filters, ptype: v })} options={Object.entries(propertyTypeLabels)} />
        <FilterSelect label="Stare" value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} options={Object.entries(commissionStatusLabels)} />
      </div>

      {rows.length === 0 && !list.isLoading ? (
        <EmptyState title="Niciun comision" description="Adaugă primul comision pentru o tranzacție încheiată." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Data</th>
                {isAdmin ? <th className="p-3">Agent</th> : null}
                <th className="p-3">Tranzacție</th>
                <th className="p-3">Proprietate / zonă</th>
                <th className="p-3 text-right">Comision agenție</th>
                <th className="p-3 text-right">Suma agentului</th>
                <th className="p-3">Stare</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.property_id ? props.get(r.property_id) : null;
                const editable = canEditCommission(r, userId, isAdmin);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="p-3 whitespace-nowrap">{r.transaction_date}</td>
                    {isAdmin ? <td className="p-3">{names.get(r.agent_id) ?? "—"}</td> : null}
                    <td className="p-3">{transactionLabels[r.transaction_kind]} · {propertyTypeLabels[r.property_type] ?? r.property_type}</td>
                    <td className="p-3">{p ? `${p.reference ?? ""} ${p.title ?? ""}`.trim() : r.location_text ?? "—"}</td>
                    <td className="p-3 text-right whitespace-nowrap">{formatMoney(Number(r.agency_commission), r.currency)}</td>
                    <td className="p-3 text-right whitespace-nowrap">{formatMoney(Number(r.agent_amount), r.currency)}</td>
                    <td className="p-3"><StatusBadge tone={statusTone[r.status] ?? "neutral"}>{commissionStatusLabels[r.status]}</StatusBadge></td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {editable ? (
                        <>
                          <Button size="icon" variant="ghost" aria-label="Modifică" onClick={() => openEdit(r)}><Pencil className="size-4" /></Button>
                          <Button size="icon" variant="ghost" aria-label="Șterge" onClick={() => setDeleteId(r.id)}><Trash2 className="size-4" /></Button>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Alocat de admin — doar citire"><Lock className="size-3" /> Alocat</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-6 border-t border-border p-3 text-sm">
            <span className="text-muted-foreground">{rows.length} comisioane (fără cele anulate în totaluri)</span>
            {Object.entries(totals).map(([cur, t]) => (
              <span key={cur}>
                <strong>{cur}:</strong> agenție {formatMoney(t.agency, cur)} · agenți {formatMoney(t.agent, cur)} · încasat {formatMoney(t.collected, cur)} · de încasat {formatMoney(t.pending, cur)}
              </span>
            ))}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingId ? "Modifică comisionul" : "Adaugă comision"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {isAdmin ? (
              <FormSelect label="Agent" value={form.agent_id} onChange={(v) => set("agent_id", v)}
                options={(refs.data?.profiles ?? []).map((p) => [p.id, p.full_name ?? "—"])} />
            ) : null}
            <div><Label>Data tranzacției</Label><Input type="date" value={form.transaction_date} onChange={(e) => set("transaction_date", e.target.value)} /></div>
            <FormSelect label="Tip tranzacție" value={form.transaction_kind} onChange={(v) => set("transaction_kind", v as CommissionForm["transaction_kind"])} options={Object.entries(transactionLabels)} />
            <FormSelect label="Tip proprietate" value={form.property_type} onChange={(v) => set("property_type", v)} options={Object.entries(propertyTypeLabels)} />
            <FormSelect label="Proprietate din portofoliu (opțional)" value={form.property_id ?? NONE} onChange={(v) => set("property_id", v === NONE ? null : v)}
              options={[[NONE, "— Fără —"], ...(refs.data?.properties ?? []).map((p) => [p.id, `${p.reference ?? ""} ${p.title ?? ""}`.trim() || p.id] as [string, string])]} />
            <FormSelect label="Client din Contacte (opțional)" value={form.contact_id ?? NONE} onChange={(v) => set("contact_id", v === NONE ? null : v)}
              options={[[NONE, "— Fără —"], ...(refs.data?.contacts ?? []).map((c) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—"] as [string, string])]} />
            {!form.property_id ? (
              <div className="sm:col-span-2"><Label>Adresă / zonă</Label><Input value={form.location_text} onChange={(e) => set("location_text", e.target.value)} maxLength={300} /></div>
            ) : null}
            <div><Label>Valoarea tranzacției</Label><Input inputMode="decimal" value={form.transaction_value} onChange={(e) => set("transaction_value", e.target.value)} /></div>
            <FormSelect label="Moneda" value={form.currency} onChange={(v) => set("currency", v as CommissionForm["currency"])} options={COMMISSION_CURRENCIES.map((c) => [c, c])} />
            <div><Label>Comision încasat de agenție</Label><Input inputMode="decimal" value={form.agency_commission} onChange={(e) => set("agency_commission", e.target.value)} /></div>
            <div><Label>Suma agentului</Label><Input inputMode="decimal" value={form.agent_amount} onChange={(e) => set("agent_amount", e.target.value)} /></div>
            <FormSelect label="Cine plătește" value={form.payer} onChange={(v) => set("payer", v as CommissionForm["payer"])} options={Object.entries(commissionPayerLabels)} />
            <FormSelect label="Stare" value={form.status} onChange={(v) => set("status", v as CommissionForm["status"])} options={Object.entries(commissionStatusLabels)} />
            {form.status === "collected" ? (
              <div><Label>Data încasării</Label><Input type="date" value={form.collected_at} onChange={(e) => set("collected_at", e.target.value)} /></div>
            ) : null}
            <div className="sm:col-span-2"><Label>Note</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={4000} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Renunță</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvează</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Ștergi comisionul?"
        description="Acțiunea nu poate fi anulată."
        confirmLabel="Șterge"
        onConfirm={() => { if (deleteId) remove.mutate(deleteId); setDeleteId(null); }}
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return <FormSelect label={label} value={value} onChange={onChange} options={[[ALL, "Toate"], ...options]} />;
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
