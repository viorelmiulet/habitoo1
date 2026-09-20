import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { LocationPicker, emptyLocation, type LocationValue } from "@/components/app/LocationPicker";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { supabase } from "@/integrations/supabase/client";
import { propertyTypeLabels, transactionLabels } from "@/lib/labels";
import {
  PREDEFINED_APIFY_SOURCES,
  buildPredefinedApifyInput,
  canShowApifyAdvanced,
  getPredefinedApifySource,
  type ApifyJobCriteria,
} from "@/lib/market/apify/predefined-sources";
import { estimateApifyCost } from "@/lib/market/apify/source";

type JobPayload = {
  sourceKey: string;
  criteria: ApifyJobCriteria;
  prospectOrganizationId: string | null;
  advancedInput: Record<string, unknown> | null;
  advancedMapping: Record<string, unknown> | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizations: { id: string; name: string }[];
  saving: boolean;
  isSuperadmin: boolean;
  onRun: (payload: JobPayload) => void;
};

function parseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function ApifySourceDialog({
  open,
  onOpenChange,
  organizations,
  saving,
  isSuperadmin,
  onRun,
}: Props) {
  const [sourceKey, setSourceKey] = useState(PREDEFINED_APIFY_SOURCES[0]?.key ?? "");
  const [transactionType, setTransactionType] = useState<"sale" | "rent">("sale");
  const [propertyType, setPropertyType] = useState<ApifyJobCriteria["propertyType"]>("apartment");
  const [location, setLocation] = useState<LocationValue>(emptyLocation);
  const [zone, setZone] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [maxItems, setMaxItems] = useState("100");
  const [organizationId, setOrganizationId] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [inputJson, setInputJson] = useState("{}");
  const [mappingJson, setMappingJson] = useState("{}");
  const [advancedEdited, setAdvancedEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = getPredefinedApifySource(sourceKey);
  const max = Math.max(1, Math.min(Number(maxItems) || 0, source?.maxResults ?? 1000));

  const criteria = useMemo<ApifyJobCriteria | null>(() => {
    if (!location.localitySirutaCode || !location.localityName || !source) return null;
    return {
      transactionType,
      propertyType,
      county: location.countyName,
      locality: location.localityName,
      localitySirutaCode: location.localitySirutaCode,
      zone: zone || null,
      maxItems: max,
    };
  }, [location, max, propertyType, source, transactionType, zone]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAdvancedOpen(false);
    setAdvancedEdited(false);
  }, [open]);

  useEffect(() => {
    if (!criteria || !source || advancedEdited) return;
    setInputJson(JSON.stringify(buildPredefinedApifyInput(source, criteria), null, 2));
    setMappingJson(JSON.stringify(source.fieldMapping, null, 2));
  }, [advancedEdited, criteria, source]);

  useEffect(() => {
    let active = true;
    setZone("");
    if (!location.localityName) {
      setZones([]);
      return () => {
        active = false;
      };
    }
    void supabase
      .from("imobiliare_locations")
      .select("name")
      .eq("depth", 3)
      .eq(
        "city_normalized",
        location.localityName
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase(),
      )
      .eq("is_hidden", false)
      .order("name")
      .limit(500)
      .then(({ data }) => {
        if (active) setZones([...new Set((data ?? []).map((row) => row.name))]);
      });
    return () => {
      active = false;
    };
  }, [location.localityName]);

  const estimated = source ? estimateApifyCost(max, source.unitCostUsd) : null;
  const submit = () => {
    if (!source || !criteria) {
      setError("Alege sursa și o localitate din nomenclator.");
      return;
    }
    if (Number(maxItems) < 1 || Number(maxItems) > source.maxResults) {
      setError(`Numărul maxim este între 1 și ${source.maxResults}.`);
      return;
    }
    if (source.prospectOrganizationRequired && !organizationId) {
      setError("Alege agenția care primește prospecții.");
      return;
    }
    const advancedInput = advancedEdited ? parseObject(inputJson) : null;
    const advancedMapping = advancedEdited ? parseObject(mappingJson) : null;
    if (advancedEdited && (!advancedInput || !advancedMapping)) {
      setError("Inputul și maparea avansată trebuie să fie obiecte JSON valide.");
      return;
    }
    setError(null);
    onRun({
      sourceKey,
      criteria,
      prospectOrganizationId: organizationId || null,
      advancedInput,
      advancedMapping,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Job nou</DialogTitle>
          <DialogDescription>
            Alege ce date dorești. Jobul pornește o singură dată, după confirmare.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Sursă</Label>
            <Select
              value={sourceKey}
              onValueChange={(value) => {
                setSourceKey(value);
                setAdvancedEdited(false);
              }}
            >
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREDEFINED_APIFY_SOURCES.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{source?.description}</p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Ce cauți</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tranzacție</Label>
                <Select
                  value={transactionType}
                  onValueChange={(value) => setTransactionType(value as "sale" | "rent")}
                >
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(transactionLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Vânzare sau închiriere.</p>
              </div>
              <div className="space-y-2">
                <Label>Tip proprietate</Label>
                <Select
                  value={propertyType}
                  onValueChange={(value) =>
                    setPropertyType(value as ApifyJobCriteria["propertyType"])
                  }
                >
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(propertyTypeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Folosește clasificarea proprietăților din Habitoo.
                </p>
              </div>
              <LocationPicker
                idPrefix="apify-job"
                value={location}
                onChange={setLocation}
                required
              />
              <div className="space-y-2 sm:col-span-2">
                <Label>Zonă / cartier</Label>
                <Select
                  value={zone || "__all__"}
                  onValueChange={(value) => setZone(value === "__all__" ? "" : value)}
                  disabled={!location.localityName || zones.length === 0}
                >
                  <SelectTrigger className="min-h-11">
                    <SelectValue placeholder="Toate zonele" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Toate zonele</SelectItem>
                    {zones.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Opțional; lista folosește nomenclatorul de zone deja încărcat.
                </p>
              </div>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="apify-job-max">Rezultate maxime</Label>
            <Input
              id="apify-job-max"
              className="min-h-11"
              type="number"
              min={1}
              max={source?.maxResults ?? 1000}
              value={maxItems}
              onChange={(event) => setMaxItems(event.currentTarget.value)}
            />
            <p className="text-xs text-muted-foreground">
              Maximum {source?.maxResults ?? 1000}. Cost estimat:{" "}
              {estimated === null ? "indisponibil" : `${estimated.toFixed(4)} USD`}.
            </p>
          </div>

          {source?.prospectOrganizationRequired ? (
            <div className="space-y-2">
              <Label>Agenția care primește prospecții</Label>
              <Select value={organizationId} onValueChange={setOrganizationId}>
                <SelectTrigger className="min-h-11">
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
              <p className="text-xs text-muted-foreground">
                Numai anunțurile marcate public ca persoane fizice sunt eligibile.
              </p>
            </div>
          ) : null}

          {canShowApifyAdvanced(isSuperadmin) ? (
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="min-h-11 w-full justify-between">
                  Avansat{" "}
                  <ChevronDown
                    className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="apify-job-input">Input brut</Label>
                  <Textarea
                    id="apify-job-input"
                    className="font-mono text-xs"
                    rows={7}
                    value={inputJson}
                    onChange={(event) => {
                      setInputJson(event.currentTarget.value);
                      setAdvancedEdited(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Doar pentru depanarea configurației predefinite.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apify-job-mapping">Mapare brută</Label>
                  <Textarea
                    id="apify-job-mapping"
                    className="font-mono text-xs"
                    rows={7}
                    value={mappingJson}
                    onChange={(event) => {
                      setMappingJson(event.currentTarget.value);
                      setAdvancedEdited(true);
                    }}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Renunță
          </Button>
          <Button className="min-h-11" onClick={submit} disabled={saving}>
            {saving ? "Se rulează…" : "Pornește jobul"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { JobPayload as ApifyJobPayload };
