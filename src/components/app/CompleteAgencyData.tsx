import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2 } from "lucide-react";
import { CompanyAnafSync } from "@/components/app/CompanyAnafSync";
import { ShellLoading } from "@/components/app/LoadingState";
import { shouldSyncOrg } from "@/lib/company-lookup";

import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { currentUserQueryKey, type CurrentUser } from "@/hooks/use-session";
import {
  AGENCY_LOGO_BUCKET,
  AGENCY_LOGO_MAX_BYTES,
  AGENCY_LOGO_TYPES,
  agencyLogoPath,
  removeFromBucket,
  uploadToBucket,
} from "@/lib/storage";
import {
  AGENCY_FIELD_LABELS,
  agencyWebsiteSchema,
  missingAgencyPublicFields,
  validateRequiredAgencyField,
  type AgencyRequiredField,
} from "@/lib/agency-public-data";
import { completeAgencyPublicData } from "@/lib/agency-public-data.functions";
import { notifyProperstarFeedChanged } from "@/lib/portals/properstar-cache";

const ANAF_FIELDS = ["material_address", "city", "postal_code"] as const satisfies readonly AgencyRequiredField[];

const PLACEHOLDERS: Record<AgencyRequiredField, string> = {
  email: "contact@agentia-ta.ro",
  phone: "0722 123 456",
  material_address: "Str. Exemplu nr. 10, et. 1",
  city: "București",
  postal_code: "010101",
};

/** Ecranul „Completează datele agenției”: doar câmpurile lipsă, plus logo și website (recomandate). */
export function CompleteAgencyData({ user }: { user: CurrentUser }) {
  const org = user.organization!;
  const queryClient = useQueryClient();
  const save = useServerFn(completeAgencyPublicData);
  // Câmpurile preluate din ANAF nu se mai cer; „Modifică" le redeschide pentru editare.
  const [editing, setEditing] = useState<AgencyRequiredField[]>([]);
  const [syncing, setSyncing] = useState(() => shouldSyncOrg(org, new Date()));
  const missing = [...missingAgencyPublicFields(org), ...editing.filter((f) => !missingAgencyPublicFields(org).includes(f))];
  const fromAnaf = ANAF_FIELDS.filter((f) => !missing.includes(f) && String(org[f] ?? "").trim());
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const askWebsite = !org.material_website?.trim();

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (!AGENCY_LOGO_TYPES.includes(file.type)) throw new Error("Folosește un fișier JPG, PNG, SVG sau WebP.");
      if (file.size > AGENCY_LOGO_MAX_BYTES) throw new Error("Fișierul depășește 2 MB.");
      const path = agencyLogoPath(org.id, file.type);
      await uploadToBucket(AGENCY_LOGO_BUCKET, path, file, file.type);
      const { error } = await supabase.from("organizations").update({ logo_path: path }).eq("id", org.id);
      if (error) throw error;
      if (org.logo_path && org.logo_path !== path) await removeFromBucket(AGENCY_LOGO_BUCKET, [org.logo_path]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      toast.success("Logo-ul agenției a fost încărcat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const next: Record<string, string> = {};
      for (const f of missing) {
        const msg = validateRequiredAgencyField(f, values[f] ?? "");
        if (msg) next[f] = msg;
      }
      const website = (values.material_website ?? "").trim();
      if (website && !agencyWebsiteSchema.safeParse(website).success) {
        next.material_website = "Website-ul trebuie să înceapă cu https://.";
      }
      setErrors(next);
      if (Object.keys(next).length) throw new Error("Verifică câmpurile marcate.");
      await save({
        data: {
          ...Object.fromEntries(missing.map((f) => [f, values[f]!.trim()])),
          ...(website ? { material_website: website } : {}),
        },
      });
    },
    onSuccess: async () => {
      notifyProperstarFeedChanged();
      await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      toast.success("Datele agenției au fost salvate.");
    },
    onError: (e: Error) => toastError(e),
  });

  if (syncing)
    return (
      <>
        <CompanyAnafSync org={org} onDone={() => setSyncing(false)} />
        <ShellLoading label="Preluăm datele firmei din ANAF…" />
      </>
    );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form
        className="panel w-full max-w-lg space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <div className="flex items-start gap-3">
          <Building2 className="mt-1 size-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Completează datele agenției</h1>
            <p className="text-sm text-muted-foreground">
              Aceste date apar pe portaluri, lângă anunțurile agenției. Completează-le ca să poți lucra în Habitoo.
            </p>
          </div>
        </div>

        {org.legal_name || org.cui ? (
          <div className="rounded-md border p-3 text-sm">
            <div>
              <span className="text-muted-foreground">Denumire legală: </span>
              {org.legal_name ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">CUI: </span>
              {org.cui ?? "—"}
            </div>
            {fromAnaf.map((f) => (
              <div key={f} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-muted-foreground">{AGENCY_FIELD_LABELS[f]}: </span>
                <span className="min-w-0 break-words">{org[f]}</span>
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    setEditing((e) => [...e, f]);
                    setValues((v) => ({ ...v, [f]: String(org[f] ?? "") }));
                  }}
                >
                  Modifică
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {missing.map((f) => (
          <div key={f} className="space-y-1.5">
            <Label htmlFor={`req-${f}`}>{AGENCY_FIELD_LABELS[f]} *</Label>
            <Input
              id={`req-${f}`}
              type={f === "email" ? "email" : "text"}
              inputMode={f === "postal_code" || f === "phone" ? "numeric" : undefined}
              placeholder={PLACEHOLDERS[f]}
              value={values[f] ?? ""}
              aria-invalid={Boolean(errors[f])}
              onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
            />
            {errors[f] ? <p className="text-xs text-destructive">{errors[f]}</p> : null}
          </div>
        ))}

        {askWebsite ? (
          <div className="space-y-1.5">
            <Label htmlFor="req-website">Website (recomandat)</Label>
            <Input
              id="req-website"
              placeholder="https://agentia-ta.ro"
              value={values.material_website ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, material_website: e.target.value }))}
            />
            {errors.material_website ? (
              <p className="text-xs text-destructive">{errors.material_website}</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="req-logo">Logo agenție (recomandat)</Label>
          <Input
            id="req-logo"
            type="file"
            accept="image/jpeg,image/png,image/svg+xml,image/webp"
            disabled={uploadLogo.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) uploadLogo.mutate(file);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {org.logo_path ? "Logo încărcat. Poți alege altul." : "JPG, PNG, SVG sau WebP, maximum 2 MB."}
          </p>
        </div>

        <Button type="submit" className="w-full" disabled={submit.isPending}>
          Salvează și continuă
        </Button>
      </form>
    </div>
  );
}
