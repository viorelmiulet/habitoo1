import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { getImospotSettings, saveImospotSettings } from "@/lib/portal-activation.functions";
import { KEY_REQUEST_PORTALS, type KeyRequestPortalId } from "@/lib/portals/imospot-key-request";

const FIELDS = [
  { key: "to", label: "Destinația cererilor" },
  { key: "from", label: "Expeditor" },
  { key: "cc", label: "Adresă de copie (Cc)" },
] as const;

/** Setarea de platformă pentru cererile de cheie ale unui portal (doar Superadmin). */
export function ImospotSettingsCard({ portal = "imospot" }: { portal?: KeyRequestPortalId }) {
  const label = KEY_REQUEST_PORTALS[portal].label;
  const load = useServerFn(getImospotSettings);
  const save = useServerFn(saveImospotSettings);
  const settings = useQuery({ queryKey: ["key-request-settings", portal], queryFn: () => load({ data: { portal } }) });
  const [form, setForm] = useState({ to: "", from: "", cc: "" });
  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);
  const mutation = useMutation({
    mutationFn: () => save({ data: { ...form, portal } }),
    onSuccess: () => toast.success(`Setările ${label} au fost salvate.`),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="panel">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Cereri de cheie {label}</h2>
        <p className="text-xs text-muted-foreground">
          Emailul trimis automat către {label} când aprobi activarea unei agenții.
        </p>
      </header>
      <form
        className="grid gap-3 p-5 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        {FIELDS.map((f) => (
          <div key={f.key} className="min-w-0 space-y-1">
            <Label htmlFor={`${portal}_${f.key}`}>{f.label}</Label>
            <Input
              id={`${portal}_${f.key}`}
              type="email"
              value={form[f.key]}
              onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="md:col-span-3">
          <Button type="submit" size="sm" disabled={mutation.isPending || settings.isLoading}>
            Salvează
          </Button>
        </div>
      </form>
    </section>
  );
}
