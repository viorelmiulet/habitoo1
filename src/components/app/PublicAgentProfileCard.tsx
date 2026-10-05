import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { currentUserQueryKey } from "@/hooks/use-session";
import { PUBLIC_AGENT_BIO_MAX } from "@/lib/public-profile";

type Props = {
  userId: string;
  agencyPublic: boolean;
  initial: { enabled: boolean; bio: string | null; showPhone: boolean; slug: string | null };
};

/** Profilul public al agentului; fiecare își modifică doar profilul propriu (trigger în DB). */
export function PublicAgentProfileCard({ userId, agencyPublic, initial }: Props) {
  const queryClient = useQueryClient();
  const base = { enabled: initial.enabled, bio: initial.bio ?? "", showPhone: initial.showPhone };
  const [form, setForm] = useState(base);
  const dirty = JSON.stringify(form) !== JSON.stringify(base);

  const save = useMutation({
    mutationFn: async () => {
      if (form.bio.length > PUBLIC_AGENT_BIO_MAX) throw new Error(`Descrierea are maximum ${PUBLIC_AGENT_BIO_MAX} de caractere.`);
      const { error } = await supabase
        .from("profiles")
        .update({ public_profile_enabled: form.enabled, public_bio: form.bio || null, public_show_phone: form.showPhone })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      toast.success("Profilul public a fost salvat.");
    },
    onError: (e: Error) => toastError(e),
  });

  return (
    <section className="rounded-[22px] border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <header className="mb-5 space-y-1">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
          <Globe className="size-5 text-gold" aria-hidden /> Profilul meu public
        </h2>
        <p className="text-sm text-muted-foreground">
          Profilul tău va fi vizibil pe internet, inclusiv în Google. Poți dezactiva oricând.
        </p>
      </header>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
          <Label htmlFor="pub_agent_enabled" className="text-sm">Afișează profilul meu public</Label>
          <Switch id="pub_agent_enabled" checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
        </div>
        {form.enabled && !agencyPublic ? (
          <p className="rounded-2xl border border-gold/40 bg-gold/10 p-3 text-sm text-foreground">
            Profilul va fi vizibil după ce agenția îți activează pagina publică.
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="pub_agent_bio">Descriere scurtă</Label>
          <Textarea
            id="pub_agent_bio"
            rows={4}
            maxLength={PUBLIC_AGENT_BIO_MAX}
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          />
          <p className="text-right text-xs text-muted-foreground" aria-live="polite">
            {form.bio.length}/{PUBLIC_AGENT_BIO_MAX}
          </p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
          <div className="space-y-1">
            <Label htmlFor="pub_agent_phone" className="text-sm">Afișează numărul meu de telefon</Label>
            <p className="text-xs text-muted-foreground">Emailul tău nu este afișat public niciodată.</p>
          </div>
          <Switch id="pub_agent_phone" checked={form.showPhone} onCheckedChange={(v) => setForm((f) => ({ ...f, showPhone: v }))} />
        </div>
        {initial.slug && initial.enabled ? (
          <p className="text-xs text-muted-foreground">Adresa viitoare: habitoo.ro/agenti/{initial.slug}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-11" disabled={!dirty || save.isPending} onClick={() => setForm(base)}>
            Renunță
          </Button>
          <Button type="submit" className="h-11 bg-gold text-gold-foreground hover:bg-gold/90" disabled={!dirty || save.isPending}>
            {save.isPending ? "Se salvează…" : "Salvează modificările"}
          </Button>
        </div>
      </form>
    </section>
  );
}
