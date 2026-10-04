import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Image as ImageIcon, Trash2 } from "lucide-react";

import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAgencyLogoUrl } from "@/components/app/AgencyBrandingCard";
import { AGENCY_LOGO_MAX_BYTES, AGENCY_LOGO_TYPES } from "@/lib/storage";
import { agencyDetailsSchema } from "@/lib/agency-details";
import { saveAgencyDetails } from "@/lib/superadmin-agency-edit.functions";

type Org = Record<string, unknown> & { id: string; name: string; logo_path?: string | null };

const FIELDS: { section: string; items: { key: string; label: string; placeholder?: string }[] }[] = [
  {
    section: "Identitate",
    items: [
      { key: "name", label: "Nume" },
      { key: "legal_name", label: "Denumire legală" },
      { key: "cui", label: "CUI", placeholder: "RO12345678" },
      { key: "trade_registry_number", label: "Nr. Reg. Com." },
    ],
  },
  {
    section: "Contact",
    items: [
      { key: "email", label: "Email" },
      { key: "phone", label: "Telefon" },
      { key: "city", label: "Oraș" },
      { key: "postal_code", label: "Cod poștal", placeholder: "6 cifre" },
    ],
  },
  {
    section: "Prezentare",
    items: [
      { key: "material_phone", label: "Telefon" },
      { key: "material_email", label: "Email" },
      { key: "material_website", label: "Website", placeholder: "https://…" },
      { key: "material_address", label: "Adresă" },
    ],
  },
];

const KEYS = FIELDS.flatMap((s) => s.items.map((i) => i.key));

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Fișierul nu a putut fi citit."));
    r.readAsDataURL(file);
  });
}

export function AgencyDetailsDialog({ org, onClose }: { org: Org; onClose: () => void }) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveAgencyDetails);
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(KEYS.map((k) => [k, String(org[k] ?? "")])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const logoUrl = useAgencyLogoUrl(org.logo_path);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = agencyDetailsSchema.safeParse(form);
      if (!parsed.success) {
        const e: Record<string, string> = {};
        for (const issue of parsed.error.issues) e[String(issue.path[0])] ??= issue.message;
        setErrors(e);
        throw new Error("Verifică câmpurile marcate.");
      }
      setErrors({});
      const logoPayload = logo ? { mimeType: logo.type, base64: await toBase64(logo) } : null;
      return save({ data: { organizationId: org.id, details: form, logo: logoPayload, removeLogo } });
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast.success(r.changed.length ? "Datele agenției au fost salvate." : "Nicio modificare.");
      onClose();
    },
    onError: (e: Error) => toastError(e),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Editează datele — {org.name}
            {(org as { company_status?: string | null }).company_status === "inactiva" ? (
              <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                Firmă inactivă (ANAF)
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>Fiecare modificare se înregistrează în jurnalul de audit.</DialogDescription>
        </DialogHeader>

        {FIELDS.map((s) => (
          <section key={s.section} className="space-y-3">
            <h3 className="text-sm font-semibold">{s.section}</h3>
            {s.section === "Prezentare" ? (
              <div className="flex items-center gap-3">
                <div className="flex size-16 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                  {logo ? (
                    <img src={URL.createObjectURL(logo)} alt="" className="size-full object-contain" />
                  ) : logoUrl && !removeLogo ? (
                    <img src={logoUrl} alt="" className="size-full object-contain" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground" />
                  )}
                </div>
                <Input
                  type="file"
                  accept={AGENCY_LOGO_TYPES.join(",")}
                  className="max-w-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && !AGENCY_LOGO_TYPES.includes(f.type)) {
                      toast.error("Folosește un fișier JPG, PNG, SVG sau WebP.");
                      return;
                    }
                    if (f && f.size > AGENCY_LOGO_MAX_BYTES) {
                      toast.error("Fișierul depășește 2 MB.");
                      return;
                    }
                    setLogo(f);
                    setRemoveLogo(false);
                  }}
                />
                {(org.logo_path || logo) && !removeLogo ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setLogo(null);
                      setRemoveLogo(Boolean(org.logo_path));
                    }}
                  >
                    <Trash2 className="mr-1.5 size-4" />
                    Elimină logo
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {s.items.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`ad-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`ad-${f.key}`}
                    value={form[f.key] ?? ""}
                    placeholder={f.placeholder}
                    aria-invalid={Boolean(errors[f.key])}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                  {errors[f.key] ? <p className="text-xs text-destructive">{errors[f.key]}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ))}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Renunță
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Salvează
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
