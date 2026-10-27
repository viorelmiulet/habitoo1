import { useState } from "react";
import { SubscriptionEmailStatus } from "./SubscriptionEmailStatus";
import { Check, CalendarDays, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PLAN_KEYS, PLAN_PRICES, normalizePlan, planLabel, planAgentLimitLabel, planPriceLabel, type PlanKey } from "@/lib/plans";
import { paidTermLabel, subscriptionPlanFits, type PaidTerm } from "@/lib/subscription-requests";
import { formatDate } from "@/lib/format";
import type { getSubscriptionChoices } from "@/lib/subscription-requests.functions";

type Choices = Awaited<ReturnType<typeof getSubscriptionChoices>>;
export function SubscriptionChoiceView({ data, saving, onSubmit, onCancel }: { data: Choices; saving: boolean; onSubmit: (choice: { plan: PlanKey; term: PaidTerm; note: string; replace: string | null }) => void; onCancel: (id: string) => void }) {
  const pending = data.requests.find(r => r.status === "pending");
  const [term, setTerm] = useState<PaidTerm>((pending?.term as PaidTerm) ?? "30d");
  const [chosen, setChosen] = useState<PlanKey | null>(null);
  const [note, setNote] = useState(pending?.note ?? "");
  const [cancelOpen, setCancelOpen] = useState(false);
  return <div className="space-y-7">
    <header data-tour="subscription-current"><p className="mb-2 text-sm text-muted-foreground">{data.organizationName}</p><h1 className="text-3xl font-semibold">Alege abonamentul</h1><div className="mt-4 flex flex-wrap gap-5 text-sm"><span className="flex items-center gap-2"><Check className="size-4 text-primary" />Plan curent: <strong>{planLabel(data.plan)}</strong></span><span className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" /><strong>{data.activeAgents}</strong> agenți activi</span></div></header>
    {pending ? <section className="space-y-3 border-y border-info/30 bg-info/10 px-4 py-4"><p className="flex items-start gap-2 font-semibold"><Clock className="mt-0.5 size-4 shrink-0" />Cerere trimisă: {planLabel(pending.plan)}, {paidTermLabel(pending.term)} · în așteptarea activării</p><p className="text-sm text-muted-foreground">{planPriceLabel(pending.plan, pending.term)}{pending.note ? ` · ${pending.note}` : ""}</p><SubscriptionEmailStatus email={pending.email} /><Button variant="outline" size="sm" disabled={saving} onClick={() => setCancelOpen(true)}>Anulează cererea</Button><span className="ml-3 text-sm text-muted-foreground">Alege alt plan sau altă perioadă pentru a schimba cererea.</span></section> : null}
    <div className="inline-flex max-w-full gap-1 rounded-md border border-border bg-muted p-1" data-tour="subscription-period" role="group" aria-label="Perioada abonamentului"><Button size="sm" variant={term === "30d" ? "outline" : "ghost"} aria-pressed={term === "30d"} onClick={() => setTerm("30d")}>Lunar</Button><Button size="sm" variant={term === "12m" ? "outline" : "ghost"} aria-pressed={term === "12m"} onClick={() => setTerm("12m")}><CalendarDays />Anual (−50%)</Button></div>
    <div data-tour="subscription-plans" className="grid gap-4 md:grid-cols-3">{PLAN_KEYS.map(plan => {
      const fits = subscriptionPlanFits(plan, data.activeAgents);
      const current = normalizePlan(data.plan) === plan;
      const price = PLAN_PRICES[plan];
      return <article key={plan} className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h2 className="text-2xl font-semibold">{planLabel(plan)}</h2>{current ? <span className="text-xs font-semibold text-primary">Plan curent</span> : null}</div><p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Users className="size-4" />{planAgentLimitLabel(plan)}</p><p className="text-4xl font-semibold">{term === "12m" ? price.annualMonthly : price.monthly} €<span className="text-sm font-normal text-muted-foreground"> / lună</span></p><p className="mt-2 text-sm text-muted-foreground">{term === "12m" ? `${price.annualMonthly * 12} € total anual` : `${price.monthly} € pentru 30 de zile`}</p><div className="mt-6 flex flex-1 flex-col justify-end gap-3">{!fits ? <p className="text-sm text-destructive">Limita de {planAgentLimitLabel(plan)} este sub cei {data.activeAgents} agenți activi.</p> : null}<Button variant="outline" disabled={!fits || saving} onClick={() => setChosen(plan)}>{pending ? "Schimbă cererea" : "Alege"}</Button></div></article>;
    })}</div>
    {data.requests.filter(r => r.status !== "pending").length ? <section data-tour="subscription-history" className="border-t border-border pt-5"><h2 className="mb-3 text-lg font-semibold">Cererile anterioare</h2><ul className="divide-y divide-border">{data.requests.filter(r => r.status !== "pending").map(r => <li key={r.id} className="py-3 text-sm"><p>{planLabel(r.plan)} · {paidTermLabel(r.term)} · {formatDate(r.requested_at)} · {r.status === "approved" ? "Activat" : r.status === "rejected" ? "Respins" : "Anulat"}</p><SubscriptionEmailStatus email={r.email} />{r.rejection_reason ? <p className="mt-1 text-destructive">{r.rejection_reason}</p> : null}</li>)}</ul></section> : null}
    <Dialog open={chosen !== null} onOpenChange={open => { if (!open && !saving) setChosen(null); }}><DialogContent><DialogHeader><DialogTitle>{pending ? "Schimbă cererea de abonament" : "Confirmă abonamentul"}</DialogTitle><DialogDescription>{chosen ? `${planLabel(chosen)} · ${paidTermLabel(term)} · ${planPriceLabel(chosen, term)}` : ""}</DialogDescription></DialogHeader><p className="text-sm text-muted-foreground">Abonamentul va fi activat de administratorul platformei după verificarea cererii. Nu se efectuează nicio plată online.</p><Label htmlFor="subscription-note">Notă (opțional)</Label><Textarea id="subscription-note" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} disabled={saving} /><Button disabled={saving} onClick={() => { if (chosen) onSubmit({ plan: chosen, term, note, replace: pending?.id ?? null }); }}>{saving ? "Se trimite…" : "Trimite cererea"}</Button></DialogContent></Dialog>
    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}><DialogContent><DialogHeader><DialogTitle>Anulezi cererea?</DialogTitle><DialogDescription>Abonamentul curent nu se modifică.</DialogDescription></DialogHeader><Button variant="destructive" disabled={saving} onClick={() => { if (pending) onCancel(pending.id); }}>Anulează cererea</Button></DialogContent></Dialog>
  </div>;
}
