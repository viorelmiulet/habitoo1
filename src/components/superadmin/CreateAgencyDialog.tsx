import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { superadminCreateAgency } from "@/lib/superadmin-create-agency.functions";
import { PLAN_KEYS, PLAN_LABELS } from "@/lib/plans";
import { SUBSCRIPTION_TERMS, SUBSCRIPTION_TERM_LABELS } from "@/lib/subscription";

const EMPTY = { name: "", email: "", password: "", legal_name: "", cui: "", trade_registry_number: "", phone: "", city: "", full_name: "", plan: "basic", term: "trial_90d" };

export function CreateAgencyDialog() {
  const create = useServerFn(superadminCreateAgency);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await create({ data: { ...form, plan: form.plan as never, term: form.term as never } });
      setForm(EMPTY);
      setCreatedId(res.organizationId);
      void qc.invalidateQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agenția nu a putut fi creată.");
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof typeof EMPTY, label: string, type = "text", required = false) => (
    <div className="space-y-1">
      <Label htmlFor={`ca-${k}`}>{label}{required ? " *" : ""}</Label>
      <Input id={`ca-${k}`} type={type} value={form[k]} onChange={set(k)} required={required} minLength={k === "password" ? 8 : undefined} autoComplete={k === "password" ? "new-password" : "off"} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCreatedId(null); setError(null); setForm(EMPTY); } }}>
      <DialogTrigger asChild><Button>Creează agenție</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Creează agenție</DialogTitle>
          <DialogDescription>Fără cerere de înscriere și fără email de confirmare.</DialogDescription>
        </DialogHeader>
        {createdId ? (
          <div className="space-y-4">
            <p role="status">Agenția a fost creată. Administratorul se poate autentifica imediat cu emailul și parola setate.</p>
            <Link to="/superadmin/agencies/$id" params={{ id: createdId }} className="text-sm font-medium text-primary hover:underline">Deschide pagina agenției →</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {field("name", "Numele agenției", "text", true)}
            {field("email", "Email administrator", "email", true)}
            {field("password", "Parolă administrator (minimum 8 caractere)", "password", true)}
            {field("full_name", "Numele administratorului")}
            {field("legal_name", "Denumire legală")}
            <div className="grid grid-cols-2 gap-3">{field("cui", "CUI")}{field("trade_registry_number", "Nr. Registrul Comerțului")}</div>
            <div className="grid grid-cols-2 gap-3">{field("phone", "Telefon")}{field("city", "Oraș")}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Plan</Label>
                <Select value={form.plan} onValueChange={(v) => setForm((f) => ({ ...f, plan: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PLAN_KEYS.map((p) => <SelectItem key={p} value={p}>{PLAN_LABELS[p]}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Termen</Label>
                <Select value={form.term} onValueChange={(v) => setForm((f) => ({ ...f, term: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SUBSCRIPTION_TERMS.map((t) => <SelectItem key={t} value={t}>{SUBSCRIPTION_TERM_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Se creează…" : "Creează agenția"}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
