import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { completeAgencyCompanyData } from "@/lib/agency-public-data.functions";
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
