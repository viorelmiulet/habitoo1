import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { currentUserQueryKey, useCurrentUser } from "@/hooks/use-session";
import { OrgBlocked } from "@/components/app/OrgBlocked";
import { ShellLoading } from "@/components/app/LoadingState";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Configurează agenția — Habitoo CRM" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me, isLoading: loadingMe } = useCurrentUser();
  const [form, setForm] = useState({
    agency: "",
    legalName: "",
    cui: "",
    tradeRegistry: "",
    fullName: "",
    phone: "",
  });
  const [loading, setLoading] = useState(false);
  // Retrimiterea unei cereri respinse: afișează din nou formularul.
  const [resubmit, setResubmit] = useState(false);

  // Precompletează datele din metadata contului (completate la înscriere).
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as
        | { full_name?: string; agency_name?: string; phone?: string }
        | undefined;
      if (!meta) return;
      setForm((f) => ({
        ...f,
        fullName: f.fullName || meta.full_name || "",
        agency: f.agency || meta.agency_name || "",
        phone: f.phone || meta.phone || "",
      }));
    });
  }, []);

  // Precompletează formularul din cererea respinsă, ca să nu rescrie totul.
  const request = me?.registration ?? null;
  useEffect(() => {
    if (!request) return;
    setForm((f) => ({
      agency: f.agency || request.agency_name,
      legalName: f.legalName || request.legal_name,
      cui: f.cui || request.cui,
      tradeRegistry: f.tradeRegistry || request.trade_registry_number,
      fullName: f.fullName || request.full_name,
      phone: f.phone || request.phone || "",
    }));
  }, [request]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Se înregistrează DOAR cererea de înscriere. Organizația, profilul și rolul
    // de agency_admin se creează abia la aprobarea superadminului.
    const { error } = await supabase.rpc("submit_agency_registration_request", {
      _agency_name: form.agency,
      _legal_name: form.legalName,
      _cui: form.cui,
      _trade_registry_number: form.tradeRegistry,
      _full_name: form.fullName,
      _phone: form.phone,
    });
    setLoading(false);
    if (error) {
      toastError(error);
      return;
    }
    setResubmit(false);
    await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
    toast.success("Cererea de înscriere a fost trimisă. Îți activăm accesul după aprobare.");
  };

  if (loadingMe) return <ShellLoading label="Se verifică agenția…" />;
  // Agenție existentă, dar blocată (suspendată/arhivată/anulată).
  if (me?.orgBlocked && !me.isSuperadmin) return <OrgBlocked reason={me.orgBlocked} />;
  // Cererea a fost deja aprobată — accesul e activ.
  if (me?.organization) {
    navigate({ to: "/app", replace: true });
    return <ShellLoading label="Se deschide aplicația…" />;
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  // Cerere în așteptare → ecran de așteptare, fără formular.
  if (request?.status === "pending") {
    return (
      <AuthShell
        title="Cererea ta a plecat spre noi"
        subtitle="Verificăm datele agenției și îți activăm accesul după aprobare."
      >
        <div className="space-y-6 text-sm">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Clock className="size-6" />
          </span>

          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-xs font-medium text-muted-foreground">Datele trimise</p>
            <p className="mt-2 font-semibold">{request.agency_name}</p>
            <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between gap-3">
                <dt>Denumire legală</dt>
                <dd className="text-right text-foreground">{request.legal_name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>CUI</dt>
                <dd className="text-right text-foreground">{request.cui}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Reg. Comerțului</dt>
                <dd className="text-right text-foreground">{request.trade_registry_number}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Persoană de contact</dt>
                <dd className="text-right text-foreground">
                  {request.full_name}
                  {request.phone ? ` · ${request.phone}` : ""}
                </dd>
              </div>
            </dl>
          </div>

          <ol className="space-y-3">
            {[
              {
                title: "Cererea a fost înregistrată",
                text: "Am primit datele agenției tale.",
                done: true,
              },
              {
                title: "Verificăm datele firmei",
                text: "De regulă în una-două zile lucrătoare.",
                done: false,
              },
              {
                title: "Primești emailul de activare",
                text: "Te autentifici cu același email și intri direct în CRM.",
                done: false,
              },
            ].map((step) => (
              <li key={step.title} className="flex gap-3">
                <span
                  className={
                    step.done
                      ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"
                      : "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                  }
                >
                  <Check className="size-3" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="text-xs text-muted-foreground">
            Nu trebuie să faci nimic altceva. Dacă vrei să corectezi ceva, scrie-ne la
            contact@habitoo.ro.
          </p>

          <Button variant="outline" className="w-full" onClick={signOut}>
            Deconectare
          </Button>
        </div>
      </AuthShell>
    );
  }

  // Cerere respinsă → motivul și opțiunea de retrimitere.
  if (request?.status === "rejected" && !resubmit) {
    return (
      <AuthShell
        title="Cererea nu a fost aprobată"
        subtitle="Poți corecta datele și trimite din nou cererea — câmpurile rămân precompletate."
      >
        <div className="space-y-5 text-sm">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <XCircle className="size-6" />
          </span>

          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-xs font-medium text-muted-foreground">Motivul</p>
            <p className="mt-1">
              {request.rejection_reason ??
                "Nu a fost specificat un motiv. Verifică datele firmei și trimite din nou cererea."}
            </p>
          </div>

          <div className="rounded-xl border border-border p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{request.agency_name}</p>
            <p className="mt-1">
              {request.legal_name} · CUI {request.cui} · Reg. Com. {request.trade_registry_number}
            </p>
          </div>

          <Button className="w-full" onClick={() => setResubmit(true)}>
            Corectează și trimite din nou
          </Button>
          <Button variant="outline" className="w-full" onClick={signOut}>
            Deconectare
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Înscrie agenția"
      subtitle="Completează datele firmei. Contul devine activ după validarea echipei Habitoo."
      width="md"
    >
      <form onSubmit={submit} className="space-y-7">
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold">Date de identificare a firmei</legend>
          <p className="text-xs text-muted-foreground">
            Le folosim pentru a verifica agenția. Trebuie să corespundă documentelor oficiale.
          </p>
          <div className="space-y-2">
            <Label htmlFor="agency">Nume comercial</Label>
            <Input
              id="agency"
              required
              value={form.agency}
              onChange={set("agency")}
              placeholder="ex. Habitoo Imobiliare"
            />
            <p className="text-xs text-muted-foreground">
              Numele sub care ești cunoscut de clienți — apare în aplicație și pe anunțuri.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="legalName">Denumire legală</Label>
            <Input
              id="legalName"
              required
              value={form.legalName}
              onChange={set("legalName")}
              placeholder="ex. HABITOO IMOBILIARE S.R.L."
            />
            <p className="text-xs text-muted-foreground">
              Denumirea exactă din certificatul de înregistrare, cu forma juridică (S.R.L., S.A.).
              Poate fi diferită de numele comercial.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cui">CUI</Label>
              <Input
                id="cui"
                required
                value={form.cui}
                onChange={set("cui")}
                placeholder="ex. RO12345678"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tradeRegistry">Nr. Registrul Comerțului</Label>
              <Input
                id="tradeRegistry"
                required
                value={form.tradeRegistry}
                onChange={set("tradeRegistry")}
                placeholder="ex. J40/1234/2020"
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold">Persoana de contact</legend>
          <p className="text-xs text-muted-foreground">
            Cu acest cont devii administratorul agenției în Habitoo.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Numele tău</Label>
              <Input id="fullName" required value={form.fullName} onChange={set("fullName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                type="tel"
                required
                value={form.phone}
                onChange={set("phone")}
                placeholder="07xx xxx xxx"
                autoComplete="tel"
              />
            </div>
          </div>
        </fieldset>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Se trimite…" : "Trimite spre aprobare"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Verificarea durează de regulă una-două zile lucrătoare.
        </p>
      </form>
    </AuthShell>
  );
}
