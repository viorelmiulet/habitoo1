import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { completeAgencyCompanyData } from "@/lib/agency-public-data.functions";
import { applyAnafReload, previewAnafReload } from "@/lib/company-lookup.functions";
import type { CompanyDiff } from "@/lib/company-lookup";
import { currentUserQueryKey } from "@/hooks/use-session";

type Org = { legal_name: string | null; cui: string | null; trade_registry_number: string | null };

const FIELDS = [
  { key: "legal_name", label: "Denumire legală" },
  { key: "cui", label: "CUI" },
  { key: "trade_registry_number", label: "Nr. Registrul Comerțului" },
] as const;

/** Datele firmei: cele completate se văd, cele goale se pot completa o singură dată. */
export function AgencyCompanyDataFields({ org, canEdit }: { org: Org | null; canEdit: boolean }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const save = useServerFn(completeAgencyCompanyData);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => {
      setForm({});
      void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["agency-portal-catalog"] });
      toast.success("Datele firmei au fost salvate.");
    },
    onError: (e: Error) => toastError(e),
  });
  const preview = useServerFn(previewAnafReload);
  const apply = useServerFn(applyAnafReload);
  const [diffs, setDiffs] = useState<CompanyDiff[] | null>(null);
  const reload = useMutation({
    mutationFn: () => preview(),
    onSuccess: (r) => {
      if (!r.ok) toast.error(r.message);
      else if (r.diffs.length === 0) toast.success("Datele sunt deja la zi cu ANAF.");
      else setDiffs(r.diffs);
    },
    onError: (e: Error) => toastError(e),
  });
  const confirm = useMutation({
    mutationFn: () => apply({ data: { fields: (diffs ?? []).map((d) => d.field) } }),
    onSuccess: () => {
      setDiffs(null);
      void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      toast.success("Datele firmei au fost actualizate din ANAF.");
    },
    onError: (e: Error) => toastError(e),
  });
  const empty = FIELDS.filter((f) => !String(org?.[f.key] ?? "").trim());
  return (
    <div id="company-data" className="space-y-3 rounded-md border p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.filter((f) => !empty.includes(f)).map((f) => (
          <div key={f.key}>
            <div className="text-muted-foreground">{f.label}</div>
            <div className="break-words">{org?.[f.key]}</div>
          </div>
        ))}
      </div>
      {canEdit && org?.cui ? (
        <div className="space-y-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={reload.isPending}
            onClick={() => reload.mutate()}
          >
            {reload.isPending ? "Se verifică…" : "Reîncarcă datele din ANAF"}
          </Button>
          {diffs ? (
            <div data-testid="anaf-diff" className="space-y-2 rounded-md border border-border p-3">
              <p className="font-medium">Diferențe față de ANAF</p>
              <ul className="space-y-1 text-xs">
                {diffs.map((d) => (
                  <li key={d.field} className="break-words">
                    <span className="text-muted-foreground">{d.label}:</span> {d.current || "—"} → {d.next}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
                  Aplică modificările
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDiffs(null)}>
                  Renunță
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {empty.length > 0 && canEdit ? (
        <div className="space-y-3">
          {empty.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`company_${f.key}`}>{f.label}</Label>
              <Input
                id={`company_${f.key}`}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            După salvare, aceste date pot fi modificate doar de echipa Habitoo.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={mutation.isPending || !Object.values(form).some((v) => v.trim())}
            onClick={() => mutation.mutate()}
          >
            Salvează datele firmei
          </Button>
        </div>
      ) : null}
    </div>
  );
}
