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
        title="Cerere trimisă"
        subtitle="Îți verificăm datele agenției și îți activăm accesul după aprobare."
      >
        <div className="space-y-4 text-sm">
          <Clock className="mx-auto size-10 text-primary" />
          <div className="rounded-xl border border-border p-4">
            <p className="font-medium">{request.agency_name}</p>
            <p className="text-xs text-muted-foreground">
              {request.legal_name} · CUI {request.cui} · Reg. Com. {request.trade_registry_number}
            </p>
          </div>
          <p className="text-muted-foreground">
            Nu trebuie să faci nimic altceva. Vei primi acces imediat ce cererea este validată.
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
      <AuthShell title="Cerere respinsă" subtitle="Poți corecta datele și trimite din nou cererea.">
        <div className="space-y-4 text-sm">
          <XCircle className="mx-auto size-10 text-destructive" />
          {request.rejection_reason ? (
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Motivul respingerii</p>
              <p className="mt-1">{request.rejection_reason}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Nu a fost specificat un motiv. Verifică datele agenției și trimite din nou cererea.
            </p>
          )}
          <Button className="w-full" onClick={() => setResubmit(true)}>
            Trimite din nou cererea
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
      title="Configurează agenția"
      subtitle="Completează datele agenției. Contul devine activ după validarea platformei."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="agency">Nume comercial</Label>
          <Input
            id="agency"
            required
            value={form.agency}
            onChange={set("agency")}
            placeholder="Numele sub care activează agenția"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="legalName">Nume legal</Label>
          <Input
            id="legalName"
            required
            value={form.legalName}
            onChange={set("legalName")}
            placeholder="Exact ca în certificatul de înregistrare"
          />
        </div>
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
          <Label htmlFor="tradeRegistry">Număr de înregistrare Registrul Comerțului</Label>
          <Input
            id="tradeRegistry"
            required
            value={form.tradeRegistry}
            onChange={set("tradeRegistry")}
            placeholder="ex. J40/1234/2020"
          />
        </div>
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
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Se trimite…" : "Trimite spre aprobare"}
        </Button>
      </form>
    </AuthShell>
  );
}
