import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getListingContact, updateListingContact } from "@/lib/extension.functions";
import { agentSignature } from "@/lib/extension/listings";

export function ListingContactCard() {
  const get = useServerFn(getListingContact);
  const save = useServerFn(updateListingContact);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["listing-contact"], queryFn: () => get() });
  const [form, setForm] = useState({ listing_phone: "", whatsapp: "" });
  useEffect(() => { if (q.data) setForm({ listing_phone: q.data.listing_phone ?? "", whatsapp: q.data.whatsapp ?? "" }); }, [q.data]);
  const m = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => { toast.success("Datele de contact au fost salvate."); qc.invalidateQueries({ queryKey: ["listing-contact"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Nu am putut salva."),
  });
  const sig = agentSignature({ full_name: q.data?.full_name ?? null, phone: q.data?.phone ?? null, ...form });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="listing-phone">Telefon pentru anunțuri</Label>
          <Input id="listing-phone" type="tel" inputMode="tel" placeholder={q.data?.phone || "0722 123 456"} value={form.listing_phone} onChange={(e) => setForm((f) => ({ ...f, listing_phone: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Gol = se folosește telefonul mobil din profil.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="listing-wa">WhatsApp</Label>
          <Input id="listing-wa" type="tel" inputMode="tel" value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} />
        </div>
      </div>
      <div className="rounded-md border border-border bg-muted/40 p-3">
        <p className="text-xs font-medium text-muted-foreground">Semnătura din postările Facebook</p>
        <p className="mt-1 whitespace-pre-line text-sm">{sig.signature ?? "Adaugă un telefon ca extensia să poată posta anunțurile tale."}</p>
      </div>
      <Button type="submit" disabled={m.isPending || q.isLoading}>Salvează</Button>
    </form>
  );
}
