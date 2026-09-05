import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { currentUserQueryKey } from "@/hooks/use-session";

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
  const [form, setForm] = useState({ agency: "", fullName: "", phone: "" });
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.rpc("bootstrap_agency", {
      _agency_name: form.agency,
      _full_name: form.fullName,
      _phone: form.phone || undefined,
    });
    setLoading(false);
    if (error) {
      toastError(error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
    toast.success("Agenția a fost creată. Am pregătit și câteva date demo.");
    navigate({ to: "/app" });
  };

  return (
    <AuthShell
      title="Configurează agenția"
      subtitle="Ultimul pas: numele agenției și datele tale de agent."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="agency">Numele agenției</Label>
          <Input id="agency" required value={form.agency} onChange={set("agency")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fullName">Numele tău</Label>
          <Input id="fullName" required value={form.fullName} onChange={set("fullName")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Telefon</Label>
          <Input id="phone" value={form.phone} onChange={set("phone")} placeholder="07xx xxx xxx" />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Se configurează…" : "Intră în CRM"}
        </Button>
      </form>
    </AuthShell>
  );
}
