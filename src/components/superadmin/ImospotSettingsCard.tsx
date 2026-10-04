import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { getImospotSettings, saveImospotSettings } from "@/lib/portal-activation.functions";

const FIELDS = [
  { key: "to", label: "Destinația cererilor Imospot" },
  { key: "from", label: "Expeditor" },
  { key: "cc", label: "Adresă de copie (Cc)" },
] as const;

/** Setarea de platformă pentru cererile de cheie Imospot (doar Superadmin). */
export function ImospotSettingsCard() {
  const load = useServerFn(getImospotSettings);
  const save = useServerFn(saveImospotSettings);
  const settings = useQuery({ queryKey: ["imospot-settings"], queryFn: () => load({}) });
  const [form, setForm] = useState({ to: "", from: "", cc: "" });
  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);
  const mutation = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => toast.success("Setările Imospot au fost salvate."),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="panel">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Cereri de cheie Imospot</h2>
        <p className="text-xs text-muted-foreground">
          Emailul trimis automat către Imospot când aprobi activarea unei agenții.
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
            <Label htmlFor={`imospot_${f.key}`}>{f.label}</Label>
            <Input
              id={`imospot_${f.key}`}
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
