/**
 * Dialogul de adăugare / editare a unei surse Apify.
 *
 * O sursă nouă este doar configurație: actorul, inputul lui (exact schema
 * documentată de actor) și maparea câmpurilor lui în câmpurile Habitoo.
 * JSON-ul este validat în timp ce se scrie; nimic invalid nu se salvează.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  APIFY_TARGET_FIELD_LABELS,
  emptyApifySourceForm,
  firstItemKeys,
  parseJsonObject,
  validateApifySourceForm,
  type ApifyFormErrors,
  type ApifySourceFormValues,
  type ApifySourcePayload,
} from "@/lib/market/apify/source-form";
import type { ApifySourceView } from "@/lib/market/apify/apify.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: ApifySourceView | null;
  organizations: { id: string; name: string }[];
  saving: boolean;
  onSave: (payload: ApifySourcePayload) => void;
};

function formFromSource(source: ApifySourceView): ApifySourceFormValues {
  return {
    key: source.key,
    label: source.label,
    actorId: source.actorId,
    maxItems: String(source.maxItems),
    targets: source.targets,
    prospectOrganizationId: source.prospectOrganizationId,
    unitCostUsd: source.unitCostUsd === null ? "" : String(source.unitCostUsd),
    notes: source.notes ?? "",
    inputJson: source.inputJson,
    fieldMappingJson: source.fieldMappingJson,
  };
}

export function ApifySourceDialog({
  open,
  onOpenChange,
  source,
  organizations,
  saving,
  onSave,
}: Props) {
  const [values, setValues] = useState<ApifySourceFormValues>(() =>
    source ? formFromSource(source) : emptyApifySourceForm(),
  );
  const [errors, setErrors] = useState<ApifyFormErrors>({});

  useEffect(() => {
    if (!open) return;
    setValues(source ? formFromSource(source) : emptyApifySourceForm());
    setErrors({});
  }, [open, source]);

  const set = <K extends keyof ApifySourceFormValues>(key: K, value: ApifySourceFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const inputError = useMemo(() => {
    const parsed = parseJsonObject(values.inputJson);
    return parsed.ok ? null : parsed.message;
  }, [values.inputJson]);

  const mappingError = useMemo(() => {
    const parsed = parseJsonObject(values.fieldMappingJson);
    return parsed.ok ? null : parsed.message;
  }, [values.fieldMappingJson]);

  const rawKeys = useMemo(
    () => firstItemKeys(source?.lastRun?.firstItemJson ?? null),
    [source?.lastRun?.firstItemJson],
  );

  const submit = () => {
    const result = validateApifySourceForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSave(result.payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{source ? "Editează sursa" : "Adaugă sursă"}</DialogTitle>
          <DialogDescription>
            Inputul actorului trebuie să respecte exact schema documentată de acel actor pe Apify.
            Maparea traduce numele câmpurilor returnate de actor în câmpurile Habitoo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="apify-key">Cheie</Label>
            <Input
              id="apify-key"
              value={values.key}
              disabled={source !== null}
              placeholder="olx_imobiliare"
              onChange={(event) => set("key", event.currentTarget.value)}
            />
            {source ? (
              <p className="text-xs text-muted-foreground">Cheia nu se mai poate schimba.</p>
            ) : null}
            {errors.key ? <p className="text-xs text-destructive">{errors.key}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apify-label">Denumire</Label>
            <Input
              id="apify-label"
              value={values.label}
              onChange={(event) => set("label", event.currentTarget.value)}
            />
            {errors.label ? <p className="text-xs text-destructive">{errors.label}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apify-actor">Identificator actor</Label>
            <Input
              id="apify-actor"
              value={values.actorId}
              placeholder="sian.agency/olx-property-scraper"
              onChange={(event) => set("actorId", event.currentTarget.value)}
            />
            {errors.actorId ? <p className="text-xs text-destructive">{errors.actorId}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apify-max">Maxim rezultate pe rulare</Label>
            <Input
              id="apify-max"
              type="number"
              min={1}
              max={10000}
              value={values.maxItems}
              onChange={(event) => set("maxItems", event.currentTarget.value)}
            />
            {errors.maxItems ? <p className="text-xs text-destructive">{errors.maxItems}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apify-cost">Cost pe rezultat (USD)</Label>
            <Input
              id="apify-cost"
              inputMode="decimal"
              value={values.unitCostUsd}
              placeholder="0.005"
              onChange={(event) => set("unitCostUsd", event.currentTarget.value)}
            />
            <p className="text-xs text-muted-foreground">Folosit doar pentru costul estimat.</p>
            {errors.unitCostUsd ? (
              <p className="text-xs text-destructive">{errors.unitCostUsd}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Destinație</Label>
            <div className="flex flex-col gap-2">
              {(
                [
                  { value: "market_pool", label: "Bazin de piață" },
                  { value: "prospects", label: "Prospecți" },
                ] as const
              ).map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={values.targets.includes(option.value)}
                    onCheckedChange={(checked) =>
                      set(
                        "targets",
                        checked === true
                          ? [...values.targets, option.value]
                          : values.targets.filter((target) => target !== option.value),
                      )
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {errors.targets ? <p className="text-xs text-destructive">{errors.targets}</p> : null}
          </div>
          {values.targets.includes("prospects") ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Agenția care primește prospecții</Label>
              <Select
                value={values.prospectOrganizationId ?? ""}
                onValueChange={(value) => set("prospectOrganizationId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Alege agenția" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.prospectOrganizationId ? (
                <p className="text-xs text-destructive">{errors.prospectOrganizationId}</p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="apify-notes">Note</Label>
            <Textarea
              id="apify-notes"
              rows={2}
              value={values.notes}
              onChange={(event) => set("notes", event.currentTarget.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="apify-input">Inputul actorului (JSON)</Label>
            <Textarea
              id="apify-input"
              rows={8}
              className="font-mono text-xs"
              value={values.inputJson}
              onChange={(event) => set("inputJson", event.currentTarget.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se trimite actorului exact așa. Respectă schema documentată de actor.
            </p>
            {inputError ?? errors.inputJson ? (
              <p className="text-xs text-destructive">{inputError ?? errors.inputJson}</p>
            ) : null}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="apify-mapping">Maparea câmpurilor (JSON)</Label>
            <Textarea
              id="apify-mapping"
              rows={8}
              className="font-mono text-xs"
              value={values.fieldMappingJson}
              onChange={(event) => set("fieldMappingJson", event.currentTarget.value)}
            />
            <p className="text-xs text-muted-foreground">
              Forma: câmpul nostru → cheia actorului (text sau listă de chei, prima găsită
              câștigă).
            </p>
            <div className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Câmpurile noastre</p>
              <p>
                {APIFY_TARGET_FIELD_LABELS.map((item) => `${item.field} (${item.label})`).join(
                  " · ",
                )}
              </p>
            </div>
            {rawKeys.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const skeleton = Object.fromEntries(rawKeys.map((key) => [key, key]));
                  set("fieldMappingJson", JSON.stringify(skeleton, null, 2));
                }}
              >
                Copiază cheile din primul rezultat
              </Button>
            ) : null}
            {mappingError ?? errors.fieldMappingJson ? (
              <p className="text-xs text-destructive">{mappingError ?? errors.fieldMappingJson}</p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Renunță
          </Button>
          <Button onClick={submit} disabled={saving}>
            Salvează
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
