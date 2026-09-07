import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
    fullName: "",
    phone: "",
  });
  const [loading, setLoading] = useState(false);

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

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.rpc("bootstrap_agency", {
      _agency_name: form.agency,
      _full_name: form.fullName,
      _phone: form.phone || undefined,
      _legal_name: form.legalName,
      _cui: form.cui,
    });
    setLoading(false);
    if (error) {
      toastError(error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
    toast.success("Cererea de înscriere a fost trimisă. Îți activăm accesul după aprobare.");
    navigate({ to: "/app" });
  };

  if (loadingMe) return <ShellLoading label="Se verifică agenția…" />;
  // Agenția a fost deja creată și așteaptă validarea platformei.
  if (me?.orgBlocked && !me.isSuperadmin) return <OrgBlocked reason={me.orgBlocked} />;

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
